-- =====================================================================================
-- 0046 — Khóa bảng public.requests (do migration 0043_add_scan_url_to_requests tạo, không bật RLS)
-- =====================================================================================
-- BỐI CẢNH
--   Migration 0043_add_scan_url_to_requests có nhánh CREATE TABLE IF NOT EXISTS public.requests (...)
--   nhưng KHÔNG bật RLS. Mã nguồn hiện không đọc/ghi bảng này (nghiệp vụ dùng transactions + transaction_items).
--   Bảng public không RLS + quyền mặc định của Supabase => ai có anon key cũng đọc/ghi được qua REST API.
--
-- THAY ĐỔI (chỉ nếu bảng tồn tại):
--   * Bật RLS, KHÔNG tạo policy nào => chặn toàn bộ truy cập từ anon/authenticated (service_role vẫn dùng được).
--   * Thu hồi quyền của PUBLIC/anon/authenticated trên bảng.
-- Nếu sau này thật sự cần dùng bảng này, hãy tạo policy tường minh theo vai trò.
-- =====================================================================================

DO $$
BEGIN
  IF to_regclass('public.requests') IS NULL THEN
    RAISE NOTICE 'Không có bảng public.requests, bỏ qua.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON public.requests FROM PUBLIC, anon, authenticated';
  RAISE NOTICE 'Đã bật RLS và thu hồi quyền trên public.requests.';
END $$;