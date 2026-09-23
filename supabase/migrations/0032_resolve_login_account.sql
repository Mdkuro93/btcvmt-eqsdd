-- Migration 0032: Hàm tra email đăng nhập + policy đọc hồ sơ cho nhân sự nội bộ (CHỈ THÊM, chưa gỡ gì)
--
-- Mục đích: chuẩn bị để gỡ policy `profiles_select_all` (SELECT ... USING true) — policy này cho phép NGƯỜI CHƯA
-- ĐĂNG NHẬP đọc toàn bộ hồ sơ (email, số điện thoại, vai trò, quyền...). Nó tồn tại vì màn hình đăng nhập cần tra
-- email từ tên đăng nhập trước khi có phiên. Thay bằng:
--   (1) Hàm resolve_login_account(): người chưa đăng nhập chỉ nhận về đúng email + trạng thái của MỘT tài khoản.
--   (2) Policy cho nhân sự nội bộ đã đăng nhập đọc hồ sơ (để danh sách yêu cầu/phiếu vẫn hiện tên người yêu cầu).
-- File này an toàn để chạy trước: chỉ thêm, không làm mất khả năng nào đang có.

CREATE OR REPLACE FUNCTION public.resolve_login_account(p_account text)
RETURNS TABLE (email text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input text := lower(btrim(coalesce(p_account, '')));
BEGIN
  IF v_input = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.email::text, p.status::text
    FROM public.profiles p
    WHERE lower(p.email) = v_input
       OR lower(p.username) = v_input
       OR lower(p.email) = v_input || '@btcvmt.vn'
    ORDER BY (lower(p.username) = v_input) DESC,
             (lower(p.email) = v_input) DESC
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_account(text) TO anon, authenticated;

-- Nhân sự nội bộ đã đăng nhập được đọc hồ sơ người khác (giữ nguyên hành vi hiện tại cho nhóm này).
-- Chủ đầu tư / viewer / tài khoản tự đăng ký chỉ đọc được hồ sơ của chính mình (policy sẵn có).
DROP POLICY IF EXISTS "profiles_select_internal_staff" ON public.profiles;
CREATE POLICY "profiles_select_internal_staff"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.is_active_role(ARRAY[
    'super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly',
    'capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'supervisor'
  ]::text[])
);

-- ==============================================================================
-- ROLLBACK (nếu cần):
-- DROP POLICY IF EXISTS "profiles_select_internal_staff" ON public.profiles;
-- DROP FUNCTION IF EXISTS public.resolve_login_account(text);
-- ==============================================================================