-- Migration 0113: (1) nhật ký kiểm toán GCN (audit_logs) chỉ thấy theo GCN mình xem được;
--                 (2) tạo đợt kiểm kê (inventory_audits INSERT) chỉ cho kho mình phụ trách.
--
-- Trước đây:
--   (1) audit_logs_select_internal_staff (0036): mọi nhân sự nội bộ, kể cả mọi thủ kho, đọc TOÀN BỘ nhật ký
--       (old_data/new_data của GCN mọi kho).
--   (2) "Tao dot kiem ke kho" (0010): warehouse_manager có managed_warehouse_ids NULL được tạo đợt kiểm kê cho
--       MỌI kho (0112 đã bỏ quy tắc "NULL = mọi kho" ở SELECT/UPDATE nhưng chưa ở INSERT).
-- Sau 0113:
--   (1) SELECT: admin/super_admin/btc_manager xem hết; người khác chỉ xem dòng có record_id là một GCN mà policy
--       bảng assets cho họ xem (thủ kho: kho phụ trách; supervisor/phòng ban: kho được gán...). Dòng có record_id
--       không phải GCN (hoặc GCN đã bị xóa) chỉ admin/BTC xem. INSERT giữ nguyên (changed_by = người đang đăng nhập).
--   (2) INSERT: admin/super_admin/btc_manager/quan_ly và người có 'asset.manage' như cũ; warehouse_manager chỉ cho
--       kho trong managed_warehouse_ids (NULL/rỗng = không kho nào).
-- App ghi audit_logs trực tiếp (createAuditLog) và qua RPC SECURITY DEFINER; không đổi cách ghi.
BEGIN;

DROP POLICY IF EXISTS "audit_logs_select_internal_staff" ON public.audit_logs;
CREATE POLICY "audit_logs_select_scoped" ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR (
    public.is_active_role(ARRAY['warehouse_manager','quan_ly','capital_dept','project_dept','re_dept',
                                'chuyen_vien','supervisor']::text[])
    AND EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = CASE WHEN audit_logs.record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        THEN audit_logs.record_id::uuid END
    )
  )
);

DROP POLICY IF EXISTS "Tao dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Tao dot kiem ke kho" ON public.inventory_audits FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager','quan_ly')
    OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY (p.permissions))
    OR (p.role = 'warehouse_manager'
        AND inventory_audits.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
  )));

COMMIT;

-- KIỂM TRA:
--  1. SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs';
--       -> audit_logs_select_scoped (SELECT) và audit_logs_insert_internal_staff (INSERT); không còn *_select_internal_staff.
--  2. Đăng nhập kuro: Nhật ký kiểm toán chỉ hiện GCN kho Test; kuropk1 không thấy dòng của kho Test.
--  3. Thủ kho sửa một GCN của kho mình: vẫn ghi được nhật ký; admin thấy tất cả.