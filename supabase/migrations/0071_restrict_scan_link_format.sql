-- 0071_restrict_scan_link_format.sql
-- Lý do: bản scan GCN lưu dưới dạng ĐƯỜNG LINK (SharePoint/OneDrive) trong cột scan_file_url, hiện là chữ tự do, không kiểm tra.
--        Giao diện lại gắn thẳng giá trị này vào <iframe src> và <a href> (DocumentPreviewModal.tsx). Một giá trị dạng
--        'javascript:...' do một tài khoản nhập sẽ chạy khi quản trị viên bấm xem -> đánh cắp phiên đăng nhập (XSS lưu trữ).
-- Sửa: ràng buộc CHECK ở DB (không thể qua mặt bằng cách gọi API trực tiếp). Cho phép:
--        (a) rỗng/NULL;
--        (b) https:// tới sharepoint.com (kể cả *.sharepoint.com), 1drv.ms, onedrive.live.com;
--        (c) đường dẫn tương đối kiểu Storage cũ (chỉ gồm chữ, số, _ . / -), để dữ liệu cũ vẫn hợp lệ.
-- SỬA danh sách tên miền ở biến v_cond nếu tổ chức dùng tên miền khác.
-- Dừng rõ ràng (không áp ràng buộc) nếu đang có dòng vi phạm.
BEGIN;

DO $$
DECLARE
  r record;
  n integer;
  v_cond text := $c$scan_file_url IS NULL
      OR btrim(scan_file_url) = ''
      OR scan_file_url ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)'
      OR scan_file_url ~ '^[A-Za-z0-9_./-]+$'$c$;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('assets', 'chk_assets_scan_link'),
      ('asset_declaration_requests', 'chk_adr_scan_link')
    ) AS t(tbl, cname)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'scan_file_url'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE NOT (%s)', r.tbl, v_cond) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION '0071 dừng: bảng % có % dòng scan_file_url không hợp lệ. Xem: select id, scan_file_url from public.% where not (%)',
          r.tbl, n, r.tbl, v_cond;
      END IF;
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.cname);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s)', r.tbl, r.cname, v_cond);
    ELSE
      RAISE NOTICE 'Bỏ qua bảng % (chưa có cột scan_file_url)', r.tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK:
-- ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS chk_assets_scan_link;
-- ALTER TABLE public.asset_declaration_requests DROP CONSTRAINT IF EXISTS chk_adr_scan_link;
