-- ==============================================================================
-- Production PostgreSQL Schema: Sales Reports & Pipeline Audit Logging
-- ==============================================================================

-- Core Business Table: Sales Reports
CREATE TABLE IF NOT EXISTS sales_reports (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    customer_id VARCHAR(100) NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    sale_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    source_file VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on high-cardinality and query-filter columns
CREATE INDEX IF NOT EXISTS idx_sales_reports_customer_id ON sales_reports (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_reports_product_id ON sales_reports (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_reports_sale_date ON sales_reports (sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_reports_status ON sales_reports (status);

-- ==============================================================================
-- Audit & Observability Table: Pipeline Execution Logs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED'
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    invalid_rows INTEGER NOT NULL DEFAULT 0,
    upserted_rows INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_file_name ON pipeline_runs (file_name);
