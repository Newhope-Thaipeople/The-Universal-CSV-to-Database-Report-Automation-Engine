# The Universal CSV-to-Database & Report Automation Engine

> High-performance, memory-safe, production-ready backend data ingestion & automation pipeline built with **Node.js (ESM)**, **PostgreSQL (`pg`)**, and streaming CSV processing.

---

## Architecture Overview

```text
 Inbound CSVs
 (data/raw/*.csv)
        │
        ▼
 ┌────────────────────────────────────────────────────────┐
 │   Streaming CSV Parser (O(1) Memory Footprint)         │
 └───────────────────────┬────────────────────────────────┘
                         │ Row-by-Row
                         ▼
 ┌────────────────────────────────────────────────────────┐
 │   Data Cleaner & Validator                             │
 ├────────────────────────────────────────────────────────┤
 │ - Sanitizes strings, formats numbers & ISO dates       │
 │ - Auto-computes missing totals                         │
 │ - Quarantines rejected rows to Dead-Letter CSV         │
 └───────────────────────┬────────────────────────────────┘
                         │ Validated Records
                         ▼
 ┌────────────────────────────────────────────────────────┐
 │   Multi-Row Batch Buffer (Chunk Size: 500 rows)        │
 └───────────────────────┬────────────────────────────────┘
                         │ Parameterized Bulk Query
                         ▼
 ┌────────────────────────────────────────────────────────┐
 │   PostgreSQL Atomic Transaction (BEGIN ... COMMIT)     │
 ├────────────────────────────────────────────────────────┤
 │ - INSERT ... ON CONFLICT (transaction_id) DO UPDATE   │
 │ - Automatic ROLLBACK on fatal failures                 │
 │ - Audit trail logging into `pipeline_runs` table       │
 └───────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
 Archived Success                  Quarantined Failure
 (data/processed/YYYYMMDD_*.csv)   (data/failed/YYYYMMDD_*.csv)
```

---

## Key Capabilities

- **Memory-Safe Streaming**: Stream-parsed via Node.js streams and `csv-parser` (`for await`). Processes gigabyte-scale datasets in low constant RAM ($< 50\text{ MB}$).
- **Batch Parameterized Upserts**: Batches rows into multi-row inserts (`INSERT ... ON CONFLICT DO UPDATE`), cutting database roundtrips by 500x.
- **ACID Transaction Isolation**: Dedicated `BEGIN ... COMMIT` blocks per file. Automatic `ROLLBACK` guarantees zero partial writes.
- **Dead-Letter Queue (DLQ)**: Invalid rows are automatically exported to a `.rejected.csv` with specific failure reasons for operational audit.
- **Database Observability**: Every execution logs metrics (`duration_ms`, `upserted_rows`, `invalid_rows`, etc.) to the `pipeline_runs` audit table.
- **Dual Execution Modes**:
  - **Batch Mode**: Run once on demand or via system crontab (`npm start`).
  - **Daemon Mode**: Continuously poll inbound directories with concurrency mutex lock (`npm run daemon`).

---

## Directory Structure

```text
sales-data-pipeline/
├── .env                      # Live environment configuration (git-ignored)
├── .env.example              # Environment template
├── .gitignore                # Git ignore rules
├── docker-compose.yml        # Turnkey PostgreSQL 16 service
├── package.json              # Project manifest & scripts
├── README.md                 # Complete documentation
│
├── sql/
│   └── schema.sql            # DDL for `sales_reports` and `pipeline_runs`
│
├── src/
│   ├── index.js              # Application entrypoint & signal handling
│   ├── config.js             # Environment loader & path resolver
│   ├── db.js                 # PostgreSQL connection pool & batch upserts
│   ├── validator.js          # Row sanitization & validation rules
│   ├── file-handler.js       # Atomic file moves, DLQ export & timestamps
│   └── pipeline.js           # Core streaming pipeline orchestrator
│
├── test/
│   └── validator.test.js     # Native unit tests (Node.js test runner)
│
└── data/
    ├── raw/                  # Inbound raw CSV files
    ├── processed/            # Successfully processed archives
    └── failed/               # Quarantined failed files
```

---

## Quickstart

### 1. Start Database (Optional Docker)
If you do not have a local PostgreSQL instance running:
```bash
docker compose up -d
```
*Note: This automatically initializes `pipeline_db` with `sql/schema.sql`.*

### 2. Configure Environment (`.env`)
```bash
cp .env.example .env
```
Ensure database credentials match your PostgreSQL instance:
```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=pipeline_db
DB_USER=postgres
DB_PASSWORD=postgres

RAW_DATA_DIR=./data/raw
PROCESSED_DATA_DIR=./data/processed
FAILED_DATA_DIR=./data/failed
BATCH_SIZE=500
POLL_INTERVAL_SECONDS=15
MAX_DB_POOL_SIZE=10
```

### 3. Run Schema Migrations (If not using Docker)
```bash
psql -h 127.0.0.1 -U postgres -d pipeline_db -f sql/schema.sql
```

### 4. Run the Automation Engine

- **Single Execution (Batch Mode)**:
  ```bash
  npm start
  ```

- **Continuous Daemon Service**:
  ```bash
  npm run daemon
  ```

- **Run Unit Test Suite**:
  ```bash
  npm test
  ```
