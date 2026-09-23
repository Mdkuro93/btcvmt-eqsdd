-- Migration 0033: Gỡ policy cho phép NGƯỜI CHƯA ĐĂNG NHẬP đọc toàn bộ bảng profiles
--
-- CHỈ CHẠY SAU KHI: (1) đã chạy 0032, (2) đã cập nhật src/contexts/AuthContext.tsx (dùng hàm resolve_login_account),
-- (3) đã thử đăng nhập bằng tên đăng nhập và bằng email thành công.
-- Nếu chạy sớm hơn, đăng nhập bằng tên đăng nhập sẽ hỏng cho tới khi app được cập nhật.

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

-- ==============================================================================
-- ROLLBACK KHẨN CẤP (mở lại quyền đọc công khai — chỉ dùng nếu đăng nhập bị hỏng):
-- CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
-- ==============================================================================