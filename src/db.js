import pkg from 'pg';
import { CONFIG } from './config.js';

const { Pool } = pkg;

// Initialize PostgreSQL Connection Pool
export const pool = new Pool(CONFIG.db);

pool.on('error', (err) => {
  console.error('[CRITICAL] Unexpected idle PostgreSQL client error:', err.message);
});

/**
 * Execute parameterized multi-row batch upsert inside an active transaction
 */
export async function executeBatchUpsert(client, rows) {
  if (!rows.length) return;

  const columns = [
    'transaction_id',
    'customer_id',
    'product_id',
    'quantity',
    'unit_price',
    'total_amount',
    'sale_date',
    'status',
    'source_file',
  ];

  const values = [];
  const valueClauses = [];

  rows.forEach((row, rowIndex) => {
    const paramOffset = rowIndex * columns.length;
    const placeholders = columns.map((_, colIndex) => `$${paramOffset + colIndex + 1}`);
    valueClauses.push(`(${placeholders.join(', ')})`);

    values.push(
      row.transaction_id,
      row.customer_id,
      row.product_id,
      row.quantity,
      row.unit_price,
      row.total_amount,
      row.sale_date,
      row.status,
      row.source_file
    );
  });

  const queryText = `
    INSERT INTO sales_reports (
      transaction_id,
      customer_id,
      product_id,
      quantity,
      unit_price,
      total_amount,
      sale_date,
      status,
      source_file
    )
    VALUES ${valueClauses.join(', ')}
    ON CONFLICT (transaction_id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      product_id = EXCLUDED.product_id,
      quantity = EXCLUDED.quantity,
      unit_price = EXCLUDED.unit_price,
      total_amount = EXCLUDED.total_amount,
      sale_date = EXCLUDED.sale_date,
      status = EXCLUDED.status,
      source_file = EXCLUDED.source_file,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await client.query(queryText, values);
}

/**
 * Persist pipeline file execution metrics into the database audit table
 */
export async function recordAuditLog(runId, metrics) {
  try {
    const query = `
      INSERT INTO pipeline_runs (
        run_id, file_name, status, total_rows, valid_rows,
        invalid_rows, upserted_rows, duration_ms, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;
    await pool.query(query, [
      runId,
      metrics.fileName,
      metrics.status,
      metrics.totalRows,
      metrics.validRows,
      metrics.invalidRows,
      metrics.upsertedRows,
      metrics.durationMs,
      metrics.error || null,
    ]);
  } catch (auditErr) {
    // Non-blocking: Do not break pipeline flow if audit table is absent or unreachable
    console.warn(`[AUDIT WARNING] Could not write audit log for ${metrics.fileName}: ${auditErr.message}`);
  }
}

