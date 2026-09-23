-- ============================================================================
-- 01_sao_luu_trong_db.sql — SAO LƯU NHANH các bảng vào một schema riêng TRONG CHÍNH DATABASE
-- ============================================================================
-- Vì sao cần: gói Free của Supabase không có sao lưu tự động. Chạy file này TRƯỚC khi dọn dữ liệu (02_...)
-- để có đường lui. Mỗi lần chạy tạo một schema mới tên golive_backup_YYYYMMDD_HHMI (giờ Việt Nam),
-- không ghi đè bản cũ. Schema này KHÔNG bị lộ qua API (API chỉ mở schema public).
--
-- Không sao chép mật khẩu: với auth.users chỉ lưu id, email, ngày tạo, lần đăng nhập cuối.
-- Khôi phục: xem scripts/golive/README.md, mục "Khôi phục từ bản sao lưu".
-- Xóa bản sao lưu khi không cần nữa:  DROP SCHEMA golive_backup_YYYYMMDD_HHMI CASCADE;

DO $$
DECLARE
  v_schema text := 'golive_backup_' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD_HH24MI');
  v_tables text[] := ARRAY[
    -- danh mục
    'regions', 'areas', 'warehouses', 'projects', 'storage_locations', 'investor_entities',
    -- tài khoản (hồ sơ)
    'profiles', 'viewer_warehouse_access', 'access_requests', 'app_users',
    -- nghiệp vụ
    'assets', 'transactions', 'transaction_items', 'collaterals',
    'asset_lineage_events', 'asset_lineage_links', 'asset_ownership_transfers',
    'asset_declaration_requests', 'inventory_audits', 'inventory_audit_items',
    'report_snapshots', 'activity_logs', 'audit_logs', 'access_logs', 'notifications', 'deletion_audit'
  ];
  t text;
  n integer := 0;
BEGIN
  EXECUTE format('CREATE SCHEMA %I', v_schema);

  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', v_schema, t, t);
      n := n + 1;
    END IF;
  END LOOP;

  EXECUTE format(
    'CREATE TABLE %I.auth_users_info AS SELECT id, email, created_at, last_sign_in_at FROM auth.users', v_schema);

  RAISE NOTICE 'Đã sao lưu % bảng vào schema %', n, v_schema;
END $$;

-- Danh sách các bản sao lưu hiện có (kết quả cần thấy: có ít nhất 1 dòng mới)
SELECT schema_name AS ban_sao_luu
FROM information_schema.schemata
WHERE schema_name LIKE 'golive_backup_%'
ORDER BY schema_name DESC;