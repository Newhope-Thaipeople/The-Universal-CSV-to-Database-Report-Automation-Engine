import { promises as fsp } from 'node:fs';
import { CONFIG } from './config.js';

/**
 * Ensure required directory structure exists
 */
export async function ensureDirectories() {
  await Promise.all([
    fsp.mkdir(CONFIG.paths.raw, { recursive: true }),
    fsp.mkdir(CONFIG.paths.processed, { recursive: true }),
    fsp.mkdir(CONFIG.paths.failed, { recursive: true }),
  ]);
}

/**
 * Generate ISO-like filesystem-safe timestamp (e.g. 20261110T150000Z)
 */
export function getTimestampPrefix() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

/**
 * Safely move a file across directories (handles cross-device/partition moves)
 */
export async function moveFileSafely(sourcePath, destinationPath) {
  try {
    await fsp.rename(sourcePath, destinationPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Fallback for cross-device mount links
      await fsp.copyFile(sourcePath, destinationPath);
      await fsp.unlink(sourcePath);
    } else {
      throw err;
    }
  }
}

/**
 * Export rejected rows to a Dead Letter CSV file for operational triage
 */
export async function exportRejectedRows(destinationPath, rejectedRows) {
  if (!rejectedRows || rejectedRows.length === 0) return;

  const headers = ['row_number', 'rejection_reason', ...Object.keys(rejectedRows[0].rawRow || {})];
  const csvLines = [headers.join(',')];

  for (const item of rejectedRows) {
    const values = [
      item.rowNumber,
      `"${String(item.reason).replace(/"/g, '""')}"`,
      ...Object.keys(item.rawRow || {}).map((k) => `"${String(item.rawRow[k] ?? '').replace(/"/g, '""')}"`),
    ];
    csvLines.push(values.join(','));
  }

  await fsp.writeFile(destinationPath, csvLines.join('\n'), 'utf8');
}

