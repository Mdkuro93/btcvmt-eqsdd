-- ==============================================================================
-- DATABASE PERFORMANCE OPTIMIZATION & INDEXING SCRIPT
-- Application: Quản Lý GCN QSDĐ & TSĐB (BTC VMT)
-- ==============================================================================

-- 1. Enable Trigram Extension for fast full-text / ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. B-Tree Indexes for Frequent Filters & Foreign Keys on `assets` table
CREATE INDEX IF NOT EXISTS idx_assets_created_at 
  ON assets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_project_created 
  ON assets(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_warehouse_created 
  ON assets(warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_custody_status 
  ON assets(custody_status);

CREATE INDEX IF NOT EXISTS idx_assets_lifecycle_status 
  ON assets(lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_assets_sale_status 
  ON assets(sale_status);

CREATE INDEX IF NOT EXISTS idx_assets_mortgage_status 
  ON assets(mortgage_status);

CREATE INDEX IF NOT EXISTS idx_assets_collateral_type 
  ON assets(collateral_type);

CREATE INDEX IF NOT EXISTS idx_assets_certificate_no 
  ON assets(certificate_no);

CREATE INDEX IF NOT EXISTS idx_assets_asset_code 
  ON assets(asset_code);

-- 3. Composite Index for Duplicate Check Queries
CREATE INDEX IF NOT EXISTS idx_assets_dup_check 
  ON assets(project_id, certificate_no, subdivision, lot_no);

-- 4. GIN Trigram Index for ultra-fast Search (ilike '%...%')
CREATE INDEX IF NOT EXISTS idx_assets_trgm_search 
  ON assets USING gin (
    certificate_no gin_trgm_ops,
    subdivision gin_trgm_ops,
    owner_name gin_trgm_ops
  );

-- 5. Indexes on Transactions & Transaction Items
CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
  ON transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_items_tx_id 
  ON transaction_items(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_items_asset_id 
  ON transaction_items(asset_id);

CREATE INDEX IF NOT EXISTS idx_transaction_items_status 
  ON transaction_items(status);

-- 6. Indexes on Activity Logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_asset_created 
  ON activity_logs(asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at 
  ON activity_logs(created_at DESC);
