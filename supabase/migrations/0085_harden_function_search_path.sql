-- 0085_harden_function_search_path.sql
-- Đặt search_path cố định 'public, pg_temp' cho mọi hàm SECURITY DEFINER còn thiếu hoặc chỉ có 'public'
-- (căn cứ danh sách hàm trên DB thật, kiểm kê ngày 05/10/2026). Không viết lại thân hàm, không đổi logic.
-- Lý do: không có search_path thì hàm DEFINER bị phụ thuộc vào search_path của người gọi; chỉ có 'public' thì
-- pg_temp vẫn được tìm ĐẦU TIÊN cho quan hệ (bảng/view) => có thể bị che bằng bảng tạm cùng tên.
-- Rollback: xem cuối file.
BEGIN;

-- Nhóm A: chưa có search_path
ALTER FUNCTION public.can_request(text)                          SET search_path = public, pg_temp;
ALTER FUNCTION public.check_locked_report_snapshot_guard()       SET search_path = public, pg_temp;
ALTER FUNCTION public.current_area_id()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.current_project_ids()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.current_region_id()                        SET search_path = public, pg_temp;
ALTER FUNCTION public.current_role_name()                        SET search_path = public, pg_temp;
ALTER FUNCTION public.project_in_scope(uuid, uuid, uuid)         SET search_path = public, pg_temp;

-- Nhóm B: chỉ có 'public' (thiếu pg_temp ở cuối)
ALTER FUNCTION public._next_voucher_code(uuid, text)             SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_delete_asset(uuid, text)             SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_delete_assets(uuid[], text)          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_report_statistics(text, uuid, uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_asset_delete()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_profile_privilege()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.has_permission(text)                       SET search_path = public, pg_temp;
ALTER FUNCTION public.is_active_role(text[])                     SET search_path = public, pg_temp;
ALTER FUNCTION public.lock_reporting_period(uuid, text)          SET search_path = public, pg_temp;
ALTER FUNCTION public.lookup_asset_status(text)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.reopen_reporting_period(uuid, text)        SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_login_account(text)                SET search_path = public, pg_temp;
ALTER FUNCTION public.transfer_asset_ownership(uuid, uuid, text, text, uuid) SET search_path = public, pg_temp;

COMMIT;

-- KIỂM TRA (kỳ vọng 0 dòng): hàm DEFINER trong public chưa đúng cấu hình
-- select p.proname, coalesce(array_to_string(p.proconfig, ';'), '') as cau_hinh
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
--   and not (coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp'])
-- order by 1;

-- ROLLBACK (đưa về trạng thái trước 0085):
--   Nhóm A: ALTER FUNCTION <hàm> RESET search_path;  (7 hàm)
--   Nhóm B: ALTER FUNCTION <hàm> SET search_path = public;  (13 hàm)