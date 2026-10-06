-- 0086_assets_updated_meta_trigger.sql
-- Đặt assets.updated_at / updated_by Ở MÁY CHỦ (không tin giá trị trình duyệt gửi lên).
-- Trước đây: trình duyệt tự đặt (src/api/assets.ts), một số RPC chỉ đặt updated_at mà không đặt updated_by (vd. 0073).
-- Quy tắc: updated_at = now(); updated_by = auth.uid() nếu có phiên đăng nhập, ngược lại (SQL Editor/service) giữ giá trị gửi vào.
-- KHÔNG ghi audit_logs (tránh ghi trùng với app/RPC, đúng quyết định ở 0036).
-- Trigger đặt tên trg_assets_set_updated_meta (chạy sau trg_assets_certificate_duplicate_guard theo thứ tự tên).
-- Rollback: DROP TRIGGER trg_assets_set_updated_meta ON public.assets; DROP FUNCTION public.assets_set_updated_meta();
BEGIN;

CREATE OR REPLACE FUNCTION public.assets_set_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assets_set_updated_meta ON public.assets;
CREATE TRIGGER trg_assets_set_updated_meta
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assets_set_updated_meta();

COMMIT;