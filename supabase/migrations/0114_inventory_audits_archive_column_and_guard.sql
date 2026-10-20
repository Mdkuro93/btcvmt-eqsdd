-- Migration 0114: lưu trữ (xóa mềm) đợt kiểm kê bằng cột riêng + trigger bảo vệ ở DB.
-- Trước đây: lưu trữ = thêm chuỗi "[ĐÃ LƯU TRỮ]" vào notes; policy UPDATE cho cả thủ kho sửa notes,
--   nên thủ kho gọi API trực tiếp vẫn khôi phục được (giao diện chỉ ẩn nút).
-- Sau 0114:
--   * Cột is_archived / archived_at / archived_by.
--   * Dữ liệu cũ có thẻ trong notes được chuyển sang is_archived = true.
--   * Trigger BEFORE UPDATE (áp dụng khi có đăng nhập app, auth.uid() không NULL):
--       - Lưu trữ: admin/super_admin/btc_manager mọi đợt; người khác chỉ đợt CHƯA hoàn tất.
--       - Khôi phục: chỉ admin/super_admin/btc_manager.
--       - Đợt đã lưu trữ: người khác không được sửa gì.
--       - archived_at / archived_by do trigger đặt, người dùng không tự ghi được.
--   * SQL Editor / service_role (auth.uid() NULL) không bị chặn.
-- App: isAuditArchived() ưu tiên cột is_archived; archive/restoreInventoryAudit ghi cột này.
BEGIN;

ALTER TABLE public.inventory_audits
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Chuyển dữ liệu cũ (thẻ trong notes) sang cột mới; trigger chưa tạo nên không bị chặn.
UPDATE public.inventory_audits
SET is_archived = true,
    archived_at = COALESCE(archived_at, updated_at)
WHERE is_archived = false
  AND (notes LIKE '%[ĐÃ LƯU TRỮ]%' OR notes LIKE '%[ARCHIVED]%');

CREATE OR REPLACE FUNCTION public.guard_inventory_audit_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    -- SQL Editor / service_role: không chặn, chỉ giữ dấu vết lưu trữ nhất quán.
    IF NEW.is_archived AND NOT OLD.is_archived THEN NEW.archived_at := COALESCE(NEW.archived_at, now()); END IF;
    IF NOT NEW.is_archived AND OLD.is_archived THEN NEW.archived_at := NULL; NEW.archived_by := NULL; END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = v_uid AND p.status = 'active'
                   AND p.role IN ('super_admin','admin','btc_manager'))
    INTO v_admin;

  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    IF NEW.is_archived THEN                       -- lưu trữ
      IF NOT v_admin AND OLD.status = 'completed' THEN
        RAISE EXCEPTION 'Chỉ quản trị viên được lưu trữ đợt kiểm kê đã hoàn tất.' USING ERRCODE = '42501';
      END IF;
      NEW.archived_at := now();
      NEW.archived_by := v_uid;
    ELSE                                          -- khôi phục
      IF NOT v_admin THEN
        RAISE EXCEPTION 'Chỉ quản trị viên được khôi phục đợt kiểm kê đã lưu trữ.' USING ERRCODE = '42501';
      END IF;
      NEW.archived_at := NULL;
      NEW.archived_by := NULL;
    END IF;
  ELSE
    IF OLD.is_archived AND NOT v_admin THEN
      RAISE EXCEPTION 'Đợt kiểm kê đã lưu trữ, chỉ quản trị viên được thay đổi.' USING ERRCODE = '42501';
    END IF;
    NEW.archived_at := OLD.archived_at;           -- không cho tự ghi
    NEW.archived_by := OLD.archived_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_inventory_audit_archive ON public.inventory_audits;
CREATE TRIGGER trg_guard_inventory_audit_archive
  BEFORE UPDATE ON public.inventory_audits
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_audit_archive();

COMMIT;

-- KIỂM TRA:
--  1. SELECT column_name FROM information_schema.columns WHERE table_name='inventory_audits' AND column_name LIKE 'archiv%';
--  2. Admin lưu trữ rồi khôi phục một đợt thử: thành công.
--  3. kuro lưu trữ đợt CHƯA hoàn tất của kho mình: được; khôi phục: báo lỗi "Chỉ quản trị viên...".
--  4. kuro lưu trữ đợt ĐÃ hoàn tất: báo lỗi.
--  5. Cập nhật CODE (isAuditArchived, archive/restore) cùng lúc, nếu không đợt lưu trữ mới không ẩn khỏi danh sách.