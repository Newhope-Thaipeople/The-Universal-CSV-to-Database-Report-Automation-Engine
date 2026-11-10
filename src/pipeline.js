import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import csvParser from 'csv-parser';
import { CONFIG } from './config.js';
import { pool, executeBatchUpsert, recordAuditLog } from './db.js';
import { validateAndCleanRow } from './validator.js';
import {
  ensureDirectories,
  getTimestampPrefix,
  moveFileSafely,
  exportRejectedRows,
} from './file-handler.js';

let isPipelineRunning = false;

/**
 * Format and print structured metrics to console
 */
function logFileMetrics(metrics, finalPath) {
  console.log(`\n------------------ FILE METRICS ------------------`);
  console.log(`Status            : ${metrics.status === 'SUCCESS' ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`File Name         : ${metrics.fileName}`);
  console.log(`Total Rows Read   : ${metrics.totalRows}`);
  console.log(`Valid Rows        : ${metrics.validRows}`);
  console.log(`Invalid Rows      : ${metrics.invalidRows}`);
  console.log(`Upserted Records  : ${metrics.upsertedRows}`);
  console.log(`Batches Executed  : ${metrics.batchesExecuted}`);
  console.log(`Processing Time   : ${metrics.durationMs} ms`);
  console.log(`Final Location    : ${finalPath}`);

  if (metrics.rejectedFilePath) {
    console.log(`Rejected Rows File: ${metrics.rejectedFilePath}`);
  }

  if (metrics.error) {
    console.log(`Error Details     : ${metrics.error}`);
  }

  if (metrics.validationErrors.length > 0) {
    console.log(`\nSample Validation Errors (${metrics.validationErrors.length} of ${metrics.invalidRows}):`);
    metrics.validationErrors.forEach((err) => console.log(`  - ${err}`));
  }
  console.log(`--------------------------------------------------\n`);
}

/**
 * Process a single CSV file end-to-end with transaction isolation
 */
export async function processFile(filePath, runId) {
  const fileName = path.basename(filePath);
  const startTime = Date.now();

  const metrics = {
    fileName,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    upsertedRows: 0,
    batchesExecuted: 0,
    validationErrors: [],
    rejectedRows: [],
    durationMs: 0,
    status: 'PENDING',
  };

  console.log(`\n======================================================`);
  console.log(`[FILE START] Processing: ${fileName}`);
  console.log(`======================================================`);

  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    metrics.status = 'FAILED';
    metrics.durationMs = Date.now() - startTime;
    metrics.error = `Database connection failed: ${connErr.message}`;
    console.error(`[DATABASE ERROR] Could not connect to PostgreSQL: ${connErr.message}`);
    logFileMetrics(metrics, filePath);
    await recordAuditLog(runId, metrics);
    return metrics;
  }

  try {
    // Acquire transaction lock
    await client.query('BEGIN');

    let currentBatch = [];
    let rowSequence = 0;

    // Stream CSV parser with low memory footprint
    const stream = fs.createReadStream(filePath).pipe(
      csvParser({
        mapHeaders: ({ header }) => header.trim(),
        skipEmptyLines: true,
      })
    );

    for await (const rawRow of stream) {
      rowSequence++;
      metrics.totalRows++;

      const validation = validateAndCleanRow(rawRow, rowSequence, fileName);

      if (!validation.isValid) {
        metrics.invalidRows++;
        metrics.rejectedRows.push({
          rowNumber: rowSequence,
          reason: validation.reason,
          rawRow,
        });

        if (metrics.validationErrors.length < 5) {
          metrics.validationErrors.push(validation.reason);
        }
        continue;
      }

      metrics.validRows++;
      currentBatch.push(validation.data);

      if (currentBatch.length >= CONFIG.batchSize) {
        await executeBatchUpsert(client, currentBatch);
        metrics.upsertedRows += currentBatch.length;
        metrics.batchesExecuted++;
        currentBatch = [];
      }
    }

    // Flush any remaining rows
    if (currentBatch.length > 0) {
      await executeBatchUpsert(client, currentBatch);
      metrics.upsertedRows += currentBatch.length;
      metrics.batchesExecuted++;
      currentBatch = [];
    }

    // Commit database transaction
    await client.query('COMMIT');

    // Archive processed file with timestamp prefix to preserve history & idempotency
    const timestamp = getTimestampPrefix();
    const destinationPath = path.join(CONFIG.paths.processed, `${timestamp}_${fileName}`);
    await moveFileSafely(filePath, destinationPath);

    // If there were any rejected rows, write them to a Dead-Letter CSV for review
    if (metrics.rejectedRows.length > 0) {
      const rejectedPath = path.join(CONFIG.paths.processed, `${timestamp}_${fileName}.rejected.csv`);
      await exportRejectedRows(rejectedPath, metrics.rejectedRows);
      metrics.rejectedFilePath = rejectedPath;
    }

    metrics.status = 'SUCCESS';
    metrics.durationMs = Date.now() - startTime;

    logFileMetrics(metrics, destinationPath);
    await recordAuditLog(runId, metrics);
    return metrics;
  } catch (error) {
    // Rollback database changes on error
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error(`[ROLLBACK ERROR] Failed to rollback transaction:`, rbErr.message);
    }

    // Quarantine failed file to prevent infinite re-processing loops
    const timestamp = getTimestampPrefix();
    const failedDestinationPath = path.join(CONFIG.paths.failed, `${timestamp}_${fileName}`);
    try {
      await moveFileSafely(filePath, failedDestinationPath);
    } catch (moveErr) {
      console.error(`[ERROR] Failed to quarantine error file ${fileName}:`, moveErr.message);
    }

    metrics.status = 'FAILED';
    metrics.durationMs = Date.now() - startTime;
    metrics.error = error.message;

    console.error(`\n[FATAL ERROR] Transaction rolled back for file ${fileName}:`, error.message);
    logFileMetrics(metrics, failedDestinationPath);
    await recordAuditLog(runId, metrics);

    return metrics;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Pipeline Controller - orchestrates scanning and execution
 */
export async function runPipeline() {
  if (isPipelineRunning) {
    console.log(`[MUTEX] Pipeline run already in progress. Skipping cycle.`);
    return;
  }

  isPipelineRunning = true;
  const runId = crypto.randomUUID();
  const pipelineStart = Date.now();

  try {
    await ensureDirectories();

    let files;
    try {
      files = await fsp.readdir(CONFIG.paths.raw);
    } catch (err) {
      console.error(`[ERROR] Failed to read raw directory:`, err.message);
      return;
    }

    const csvFiles = files.filter((f) => f.toLowerCase().endsWith('.csv'));

    if (csvFiles.length === 0) {
      if (!CONFIG.isDaemon) {
        console.log(`[INFO] No CSV files found in ${CONFIG.paths.raw}. Standing by.`);
      }
      return;
    }

    console.log(`\n[PIPELINE START] Run ID: ${runId}`);
    console.log(`[INFO] Found ${csvFiles.length} file(s) ready for ingestion.`);

    const summary = {
      totalFiles: csvFiles.length,
      successfulFiles: 0,
      failedFiles: 0,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      upsertedRows: 0,
    };

    // Process files sequentially to maintain predictable locking and clean metrics
    for (const file of csvFiles) {
      const fullPath = path.join(CONFIG.paths.raw, file);
      const result = await processFile(fullPath, runId);

      summary.totalRows += result.totalRows;
      summary.validRows += result.validRows;
      summary.invalidRows += result.invalidRows;
      summary.upsertedRows += result.upsertedRows;

      if (result.status === 'SUCCESS') {
        summary.successfulFiles++;
      } else {
        summary.failedFiles++;
      }
    }

    const totalDuration = Date.now() - pipelineStart;

    console.log(`\n======================================================`);
    console.log(`               GLOBAL PIPELINE SUMMARY                `);
    console.log(`======================================================`);
    console.table([
      { Metric: 'Run ID', Value: runId },
      { Metric: 'Total Files Scanned', Value: summary.totalFiles },
      { Metric: 'Files Successfully Processed', Value: summary.successfulFiles },
      { Metric: 'Files Failed', Value: summary.failedFiles },
      { Metric: 'Total Rows Streamed', Value: summary.totalRows },
      { Metric: 'Valid Rows Ingested', Value: summary.validRows },
      { Metric: 'Invalid Rows Skipped', Value: summary.invalidRows },
      { Metric: 'Total Rows Upserted', Value: summary.upsertedRows },
      { Metric: 'Total Execution Time (ms)', Value: totalDuration },
    ]);
    console.log(`======================================================\n`);
  } catch (globalErr) {
    console.error(`[CRITICAL] Global pipeline error:`, globalErr);
  } finally {
    isPipelineRunning = false;
  }
}

