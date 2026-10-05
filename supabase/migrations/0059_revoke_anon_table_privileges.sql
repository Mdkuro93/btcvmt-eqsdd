-- 0059_revoke_anon_table_privileges.sql
-- (Đã chạy tay trên DB thật; file này để repo khớp DB - AGENTS #16.2)
-- Lý do: information_schema.role_table_grants cho thấy anon có SELECT/INSERT/UPDATE/DELETE
--        trên 26 bảng nghiệp vụ (do 0018: GRANT ALL ON ALL TABLES ... TO anon).
--        Luồng trước đăng nhập chỉ dùng RPC, không đọc bảng trực tiếp.
-- Phạm vi: CHỈ thu hồi quyền bảng/sequence của anon.
BEGIN;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
  WHERE grantee = 'anon' AND table_schema = 'public';
  IF n > 0 THEN RAISE EXCEPTION '0059 dừng: anon còn % quyền trên schema public.', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (chỉ cấp lại đúng bảng cần, KHÔNG cấp ALL):
-- GRANT SELECT ON public.<ten_bang> TO anon;