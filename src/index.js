/**
 * ==============================================================================
 * Application Entrypoint
 * ==============================================================================
 */

import { CONFIG } from './config.js';
import { pool } from './db.js';
import { runPipeline } from './pipeline.js';

let daemonTimer = null;

/**
 * Graceful termination handling
 */
async function shutdown(signal) {
  console.log(`\n[SHUTDOWN] Received ${signal}. Cleaning up...`);
  if (daemonTimer) {
    clearInterval(daemonTimer);
  }
  try {
    await pool.end();
    console.log('[SHUTDOWN] PostgreSQL pool cleanly closed. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[SHUTDOWN] Error during database shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Execution Mode Decision
if (CONFIG.isDaemon) {
  console.log(`[SERVICE MODE] Running in daemon mode. Polling interval: ${CONFIG.pollIntervalSeconds}s`);
  runPipeline();
  daemonTimer = setInterval(runPipeline, CONFIG.pollIntervalSeconds * 1000);
} else {
  // Batch Mode (Run once and terminate)
  runPipeline()
    .catch((err) => {
      console.error('[CRITICAL] Unhandled execution error:', err);
    })
    .finally(async () => {
      await pool.end();
    });
}

