-- =====================================================================================
-- 0064 — Bổ sung trạng thái 'surplus' và cột total_surplus cho phân hệ Kiểm kê kho
-- =====================================================================================
-- BỐI CẢNH:
--   Hỗ trợ ghi nhận hồ sơ phát sinh thừa (Thừa kho / Sai kho / Chưa vào sổ) trong quá
--   trình đối soát thực tế tại kho lưu trữ.
-- =====================================================================================

BEGIN;

-- 1. Bổ sung giá trị 'surplus' vào ràng buộc check constraint của inventory_audit_items
ALTER TABLE public.inventory_audit_items DROP CONSTRAINT IF EXISTS inventory_audit_items_finding_status_check;
ALTER TABLE public.inventory_audit_items ADD CONSTRAINT inventory_audit_items_finding_status_check
  CHECK (finding_status IN ('pending', 'matched', 'missing', 'misplaced', 'surplus'));

-- 2. Bổ sung cột total_surplus vào bảng inventory_audits
ALTER TABLE public.inventory_audits ADD COLUMN IF NOT EXISTS total_surplus INT NOT NULL DEFAULT 0;

-- 3. Mở rộng ràng buộc custody_status của bảng assets để chấp nhận 'missing'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'assets_custody_status_check' AND table_name = 'assets'
  ) THEN
    ALTER TABLE public.assets DROP CONSTRAINT assets_custody_status_check;
    ALTER TABLE public.assets ADD CONSTRAINT assets_custody_status_check
      CHECK (custody_status IN ('in_stock', 'checked_out', 'in_transit', 'missing'));
  END IF;
END $$;

COMMIT;
