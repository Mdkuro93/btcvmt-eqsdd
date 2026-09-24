-- =====================================================================================
-- 0045 — Gỡ luồng đăng ký / đăng nhập kiểu cũ (app_users, register_user, login_user, approve_user)
-- =====================================================================================
-- CHẠY SAU KHI: migration 0044 đã chạy VÀ code frontend mới (Buoc30) đã được dán, test xong đăng ký + duyệt.
--
-- BỐI CẢNH
--   Migration 0018 tạo bảng app_users (mật khẩu lưu dạng thường, policy allow_all_app_users USING (true))
--   và các RPC register_user / login_user / approve_user được GRANT EXECUTE cho cả `anon`.
--   Đăng ký/duyệt nay dùng auth.signUp + handle_new_user + approve_viewer_access_request (0044) nên không còn cần.
--
-- THAY ĐỔI
--   1. Lưu định nghĩa các hàm/policy sắp gỡ vào migration_backups (tạo ở 0044).
--   2. Gỡ các hàm: register_user, login_user, approve_user (+ các tên tương tự nếu tồn tại).
--   3. Bảng app_users: gỡ mọi policy, thu hồi quyền anon/authenticated.
--      - Bảng RỖNG  -> xóa bảng.
--      - Bảng CÒN DÒNG -> GIỮ bảng (đã khóa hoàn toàn), báo NOTICE để bạn kiểm tra rồi tự xóa
--        (vì cột password có thể chứa mật khẩu dạng thường: nên xóa sau khi đã xác nhận không còn cần).
-- =====================================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.migration_backups') IS NULL THEN
    RAISE EXCEPTION 'Migration 0045 dừng: chưa có bảng migration_backups. Hãy chạy 0044 trước.';
  END IF;
END $$;

-- 1. Sao lưu định nghĩa
INSERT INTO public.migration_backups (migration, object_name, definition)
SELECT '0045', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('register_user', 'login_user', 'approve_user', 'reject_user',
                    'login_app_user', 'approve_app_user', 'reject_app_user');

INSERT INTO public.migration_backups (migration, object_name, definition)
SELECT '0045', 'policy app_users.' || policyname,
       format('cmd=%s roles=%s using=%s with_check=%s', cmd, roles, qual, with_check)
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_users';

-- 2. Gỡ hàm
DO $$
DECLARE
  f record;
  v_sig text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('register_user', 'login_user', 'approve_user', 'reject_user',
                        'login_app_user', 'approve_app_user', 'reject_app_user')
  LOOP
    v_sig := f.sig::text;               -- lấy tên TRƯỚC khi gỡ (sau khi gỡ chỉ còn OID)
    EXECUTE 'DROP FUNCTION ' || v_sig;
    RAISE NOTICE 'Đã gỡ hàm %', v_sig;
  END LOOP;
END $$;

-- 3. Bảng app_users
DO $$
DECLARE
  pol record;
  v_rows bigint;
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RAISE NOTICE 'Không có bảng app_users, bỏ qua.';
    RETURN;
  END IF;

  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_users' LOOP
    EXECUTE format('DROP POLICY %I ON public.app_users', pol.policyname);
    RAISE NOTICE 'Đã gỡ policy app_users: %', pol.policyname;
  END LOOP;

  EXECUTE 'ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON public.app_users FROM PUBLIC, anon, authenticated';

  EXECUTE 'SELECT count(*) FROM public.app_users' INTO v_rows;
  IF v_rows = 0 THEN
    EXECUTE 'DROP TABLE public.app_users';
    RAISE NOTICE 'Đã xóa bảng app_users (rỗng).';
  ELSE
    RAISE NOTICE 'app_users còn % dòng: GIỮ bảng nhưng đã khóa hoàn toàn. Kiểm tra rồi tự xóa (DROP TABLE public.app_users) khi chắc chắn không cần.', v_rows;
  END IF;
END $$;

COMMIT;

-- ROLLBACK: định nghĩa hàm/policy cũ nằm trong
--   select object_name, definition from public.migration_backups where migration = '0045' order by id;
-- (Không khuyến nghị khôi phục: các hàm này cấp EXECUTE cho anon và lưu mật khẩu dạng thường.)