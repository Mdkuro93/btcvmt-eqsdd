-- ==============================================================================
-- MIGRATION: 0025_add_province_code_to_areas.sql
-- MỤC ĐÍCH: Khắc phục rủi ro sinh sai Mã Tài Sản (VD nhầm sang DNG) do trước
--   đây hệ thống chỉ "dò tên gần đúng" giữa tên Địa bàn tự do (VD "Đà Nẵng")
--   với danh sách tỉnh/thành trong code, không có gì đảm bảo khớp 100%.
--
--   Nay thêm cột `province_code` CỐ ĐỊNH trên bảng `areas`, được chọn từ
--   dropdown chuẩn khi tạo/sửa Địa bàn (không gõ tay/dò tên nữa) — khi cột
--   này có giá trị, hệ thống ưu tiên dùng thẳng, không dò tên nữa.
-- ==============================================================================

BEGIN;

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS province_code TEXT;
COMMENT ON COLUMN public.areas.province_code IS
  'Mã tỉnh/thành cố định (VD: DNG, HCM, HAN...) dùng để sinh Mã Tài Sản. Chọn từ danh sách chuẩn, không tự dò tên.';

-- Backfill tạm cho các địa bàn đã có sẵn theo tên hiện tại (dò gần đúng 1 lần
-- duy nhất lúc migrate; Admin nên vào màn "Địa bàn" kiểm tra/chọn lại chính
-- xác cho từng địa bàn sau khi chạy xong migration này).
UPDATE public.areas SET province_code = 'DNG' WHERE province_code IS NULL AND name ILIKE '%đà nẵng%';
UPDATE public.areas SET province_code = 'HCM' WHERE province_code IS NULL AND (name ILIKE '%hồ chí minh%' OR name ILIKE '%tp.hcm%' OR name ILIKE '%sài gòn%');
UPDATE public.areas SET province_code = 'HAN' WHERE province_code IS NULL AND (name ILIKE '%hà nội%');
UPDATE public.areas SET province_code = 'KHA' WHERE province_code IS NULL AND (name ILIKE '%khánh hòa%' OR name ILIKE '%nha trang%');
UPDATE public.areas SET province_code = 'QNM' WHERE province_code IS NULL AND (name ILIKE '%quảng nam%');
UPDATE public.areas SET province_code = 'QTR' WHERE province_code IS NULL AND (name ILIKE '%quảng trị%');
UPDATE public.areas SET province_code = 'QNG' WHERE province_code IS NULL AND (name ILIKE '%quảng ngãi%');

COMMIT;