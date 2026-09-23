-- Migration 0027: Gỡ RPC admin_reset_user_password (tạo ở 0026)
-- Lý do: hàm này ghi thẳng vào auth.users.encrypted_password bằng SQL, không kiểm tra cấp bậc người bị đặt lại
-- (btc_manager/admin đặt lại được mật khẩu super_admin) và ghi mật khẩu plaintext vào public.app_users.
-- Việc đặt lại mật khẩu nay chỉ đi qua Edge Function admin-reset-password (supabase.auth.admin.updateUserById).
--
-- KHÔNG đụng tới approve_viewer_access_request (phần 2 của 0026) — giữ nguyên.

DROP FUNCTION IF EXISTS public.admin_reset_user_password(UUID, TEXT);