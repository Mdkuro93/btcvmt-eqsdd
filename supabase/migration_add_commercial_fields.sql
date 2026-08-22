-- ==============================================================================
-- MIGRATION: ADD COMMERCIAL FIELDS (TÊN DỰ ÁN KINH DOANH & MÃ LÔ KINH DOANH)
-- ==============================================================================

-- 1. Bổ sung 2 cột thông tin kinh doanh / thương mại vào bảng `assets`
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS business_project_name TEXT,
  ADD COLUMN IF NOT EXISTS business_plot_code TEXT;

-- 2. Đánh B-Tree Index cho các trường mới phục vụ sắp xếp & lọc chính xác
CREATE INDEX IF NOT EXISTS idx_assets_biz_proj 
  ON assets(business_project_name);

CREATE INDEX IF NOT EXISTS idx_assets_biz_plot 
  ON assets(business_plot_code);

-- 3. Đánh GIN Trigram Index phục vụ tìm kiếm mờ (ilike '%...%') siêu tốc
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_assets_trgm_biz_search 
  ON assets USING gin (
    business_project_name gin_trgm_ops,
    business_plot_code gin_trgm_ops
  );

-- Thêm chú thích cho cột (Comments)
COMMENT ON COLUMN assets.business_project_name IS 'Tên thương mại / tên bán hàng của dự án (Ví dụ: Cồn Dầu, Spana, Cora...)';
COMMENT ON COLUMN assets.business_plot_code IS 'Mã lô thương mại / mã lô kinh doanh (Ví dụ: LK02-15, BT-VIP-08...)';
