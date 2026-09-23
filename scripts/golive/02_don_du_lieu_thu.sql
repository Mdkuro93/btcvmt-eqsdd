-- ============================================================================
-- 02_don_du_lieu_thu.sql — DỌN TOÀN BỘ DỮ LIỆU THỬ NGHIỆM ĐỂ GO-LIVE   *** KHÔNG THỂ HOÀN TÁC ***
-- ============================================================================
-- CHỈ chạy khi: (1) đã xác nhận go-live, (2) mọi người đã ngừng dùng hệ thống, (3) đã chạy 01_sao_luu_trong_db.sql
--               và thấy schema golive_backup_... xuất hiện, (4) đã đọc scripts/golive/README.md.
--
-- Script làm gì (trong MỘT giao dịch: lỗi ở bất kỳ bước nào là hoàn tác hết, không mất gì):
--   A. XÓA SẠCH dữ liệu nghiệp vụ: GCN, phiếu, thế chấp, tách/gộp sổ, lịch sử sở hữu, kiểm kê, đề xuất khai báo,
--      báo cáo đã khóa sổ, nhật ký (hoạt động / kiểm toán / đăng nhập), thông báo, yêu cầu truy cập, quyền xem kho,
--      nhật ký xóa.
--   B. (Tùy chọn) XÓA các tài khoản không nằm trong danh sách giữ lại (cả đăng nhập lẫn hồ sơ).
--   GIỮ NGUYÊN: danh mục (vùng, địa bàn, kho, dự án, vị trí lưu trữ, pháp nhân CĐT/NĐT) và các tài khoản được giữ.
--
-- Mã phiếu / mã GCN tự sinh được tính từ dữ liệu còn tồn tại, nên sau khi dọn sẽ tự bắt đầu lại từ đầu.
-- File thực tế trên Storage (bản scan GCN) KHÔNG bị xóa bởi script này — xem README, phần việc thủ công.
--
-- ===== CẤU HÌNH: SỬA 3 DÒNG NÀY TRƯỚC KHI CHẠY (mặc định là an toàn: script sẽ từ chối chạy) =====
DO $$
DECLARE
  v_confirm text := 'CHUA_XAC_NHAN';                   -- (1) đổi thành đúng chữ:  DONG_Y_XOA_DU_LIEU_THU
  v_keep_emails text[] := ARRAY['admin@btcvmt.vn'];    -- (2) email các tài khoản GIỮ LẠI, chữ thường, cách nhau dấu phẩy
  v_delete_other_accounts boolean := true;             -- (3) true = xóa mọi tài khoản còn lại; false = giữ nguyên tất cả tài khoản
  -- ===== HẾT PHẦN CẤU HÌNH =====

  v_business_tables text[] := ARRAY[
    'transaction_items', 'transactions', 'collaterals',
    'asset_lineage_links', 'asset_lineage_events', 'asset_ownership_transfers',
    'asset_declaration_requests', 'inventory_audit_items', 'inventory_audits',
    'report_snapshots', 'activity_logs', 'audit_logs', 'access_logs', 'notifications',
    'access_requests', 'viewer_warehouse_access', 'deletion_audit',
    'assets'
  ];
  v_existing text[] := '{}';
  t text;
  v_sql text;
  v_deleted_accounts integer := 0;
BEGIN
  IF v_confirm <> 'DONG_Y_XOA_DU_LIEU_THU' THEN
    RAISE EXCEPTION 'Chưa xác nhận. Sửa v_confirm thành DONG_Y_XOA_DU_LIEU_THU rồi chạy lại. (Chưa có gì bị thay đổi.)';
  END IF;

  IF v_delete_other_accounts THEN
    IF v_keep_emails IS NULL OR array_length(v_keep_emails, 1) IS NULL THEN
      RAISE EXCEPTION 'v_keep_emails đang rỗng: hãy liệt kê ít nhất 1 tài khoản admin cần giữ lại.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(coalesce(email, '')) = ANY (v_keep_emails)) THEN
      RAISE EXCEPTION 'Không tìm thấy tài khoản nào trong v_keep_emails: kiểm tra lại chính tả email. (Chưa có gì bị thay đổi.)';
    END IF;
  END IF;

  -- A. Dọn dữ liệu nghiệp vụ: TRUNCATE tất cả trong MỘT lệnh (không dùng CASCADE để không xóa lan ngoài ý muốn;
  --    nếu còn bảng lạ tham chiếu tới, Postgres báo lỗi và toàn bộ được hoàn tác).
  FOREACH t IN ARRAY v_business_tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      v_existing := v_existing || t;
    END IF;
  END LOOP;

  IF array_length(v_existing, 1) IS NOT NULL THEN
    SELECT 'TRUNCATE TABLE ' || string_agg('public.' || quote_ident(x), ', ') INTO v_sql
    FROM unnest(v_existing) AS x;
    EXECUTE v_sql;
  END IF;

  -- B. Tài khoản
  IF v_delete_other_accounts THEN
    DELETE FROM auth.users WHERE lower(coalesce(email, '')) <> ALL (v_keep_emails);
    GET DIAGNOSTICS v_deleted_accounts = ROW_COUNT;

    -- Hồ sơ mồ côi (không còn tài khoản đăng nhập) và mọi hồ sơ ngoài danh sách giữ lại
    DELETE FROM public.profiles WHERE lower(coalesce(email, '')) <> ALL (v_keep_emails);

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE role IN ('super_admin', 'admin') AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Sau khi dọn sẽ KHÔNG còn admin nào đang hoạt động: hãy thêm email một admin vào v_keep_emails. (Đã hoàn tác.)';
    END IF;
  END IF;

  RAISE NOTICE 'Đã dọn % bảng nghiệp vụ; đã xóa % tài khoản.', coalesce(array_length(v_existing, 1), 0), v_deleted_accounts;
END $$;

-- Kiểm tra nhanh sau khi dọn (kết quả cần thấy: các bảng nghiệp vụ = 0; profiles chỉ còn các tài khoản được giữ)
SELECT 'assets' AS bang, count(*) AS so_dong FROM public.assets
UNION ALL SELECT 'transactions', count(*) FROM public.transactions
UNION ALL SELECT 'profiles (tài khoản còn lại)', count(*) FROM public.profiles
UNION ALL SELECT 'auth.users (đăng nhập còn lại)', count(*) FROM auth.users
UNION ALL SELECT 'warehouses (danh mục, phải còn nguyên)', count(*) FROM public.warehouses
UNION ALL SELECT 'projects (danh mục, phải còn nguyên)', count(*) FROM public.projects;