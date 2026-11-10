import path from 'node:path';
import dotenv from 'dotenv';

// Load environment configuration from project root
dotenv.config();

const projectRoot = process.cwd();

export const CONFIG = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'pipeline_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: Number(process.env.MAX_DB_POOL_SIZE) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  paths: {
    root: projectRoot,
    raw: path.resolve(projectRoot, process.env.RAW_DATA_DIR || './data/raw'),
    processed: path.resolve(projectRoot, process.env.PROCESSED_DATA_DIR || './data/processed'),
    failed: path.resolve(projectRoot, process.env.FAILED_DATA_DIR || './data/failed'),
  },
  batchSize: Number(process.env.BATCH_SIZE) || 500,
  pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS) || 15,
  isDaemon: process.argv.includes('--daemon') || process.env.RUN_MODE === 'daemon',
};

