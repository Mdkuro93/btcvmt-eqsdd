-- =====================================================================================
-- 0052 — Backfill asset_code cho các lô quy hoạch tạo TRƯỚC migration 0050
-- =====================================================================================
-- LÝ DO: Trigger _planned_lots_before_write (0050) chỉ tự sinh asset_code khi có
-- INSERT/UPDATE mới. Các lô đã tồn tại trong planned_land_lots từ trước đó (tạo bằng
-- migration 0048) không được trigger chạy lại nên vẫn còn asset_code = NULL.
-- File này gán mã cho các lô còn thiếu, dùng đúng quy tắc trong trigger (PLO-<mã lô>).
-- An toàn chạy nhiều lần (chỉ cập nhật dòng đang NULL).
-- =====================================================================================

BEGIN;

UPDATE public.planned_land_lots
SET asset_code = 'PLO-' || upper(replace(legal_lot_code, ' ', '-'))
WHERE asset_code IS NULL OR btrim(asset_code) = '';

COMMIT;

-- Kiểm tra sau khi chạy: phải trả về 0 dòng.
-- select count(*) from public.planned_land_lots where asset_code is null or btrim(asset_code)='';