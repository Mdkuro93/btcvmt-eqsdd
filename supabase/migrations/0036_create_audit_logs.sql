-- Migration 0036: Tạo bảng public.audit_logs (nhật ký biến động / kiểm toán GCN)
-- (THAY cho file supabase/migrations/0035_create_audit_logs.sql do AI Studio viết: trùng số 0035 với migration
--  admin_delete_asset, và policy ghi quá rộng. Nếu đã lỡ chạy bản 0035_create_audit_logs.sql thì file này vẫn chạy
--  an toàn: bảng đã có thì bỏ qua, chỉ siết lại quyền.)
--
-- Nguyên nhân: PostgREST báo PGRST205 "Could not find the table 'public.audit_logs'" khi mở lịch sử kiểm toán.
-- Bảng này được thiết kế trong 0002_audit_logs.sql nhưng chưa từng có trên database thật.
--
-- Khác với bản của AI Studio:
--   * Ghi nhật ký: CHỈ nhân sự nội bộ VÀ bắt buộc changed_by = người đang đăng nhập (không cho ghi ẩn danh,
--     không cho chủ đầu tư / viewer / tài khoản tự đăng ký chèn dòng giả vào nhật ký kiểm toán).
--   * Thu hồi mọi quyền mặc định trước, chỉ cấp SELECT + INSERT cho authenticated => nhật ký BẤT BIẾN (không ai
--     sửa / xóa được qua API).
--   * KHÔNG cài trigger tự ghi trên bảng assets (khác 0002): app tự ghi nhật ký, cài thêm sẽ ghi trùng.
--
-- Đã kiểm thử trên PostgreSQL 16 giả lập, 9 tình huống: ghi nhật ký của chính mình (OK), ghi ẩn danh (CHẶN),
-- giả mạo người khác (CHẶN), người ngoài nội bộ ghi (CHẶN), anon ghi (CHẶN), sửa/xóa nhật ký (CHẶN), đọc theo
-- vai trò đúng, xóa profile có nhật ký thì changed_by tự chuyển NULL mà không mất dòng nhật ký.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB DEFAULT NULL,
  new_data JSONB DEFAULT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON public.audit_logs(changed_by);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;

-- Xóa các policy cũ (nếu đã chạy bản 0035_create_audit_logs.sql của AI Studio hoặc 0002) rồi tạo lại đúng
DROP POLICY IF EXISTS "audit_logs_select_internal_staff" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_internal_staff" ON public.audit_logs;
DROP POLICY IF EXISTS "Cho phép người dùng đã đăng nhập xem lịch sử audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Cho phép người dùng thêm bản ghi audit_logs" ON public.audit_logs;

CREATE POLICY "audit_logs_select_internal_staff"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  public.is_active_role(ARRAY[
    'super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly',
    'capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'supervisor'
  ]::text[])
);

CREATE POLICY "audit_logs_insert_internal_staff"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND public.is_active_role(ARRAY[
    'super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly',
    'capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'supervisor'
  ]::text[])
);

-- Yêu cầu PostgREST nạp lại cấu trúc bảng ngay
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK (không nên xóa bảng nếu đã có dữ liệu nhật ký):
-- DROP POLICY IF EXISTS "audit_logs_insert_internal_staff" ON public.audit_logs;
-- DROP POLICY IF EXISTS "audit_logs_select_internal_staff" ON public.audit_logs;
-- ==============================================================================