-- =====================================================================================
-- 0066 — Thêm cột asset_type vào bảng planned_land_lots
-- =====================================================================================

BEGIN;

ALTER TABLE public.planned_land_lots 
ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'Đất nền';

COMMENT ON COLUMN public.planned_land_lots.asset_type IS 'Loại tài sản quy hoạch (Đất nền, Biệt thự, Căn hộ chung cư, Sàn TM khối đế...) phục vụ phân loại Hybrid diện tích đất vs diện tích thông thủy';

COMMIT;
