-- Migration 0115: siết quyền SỬA / XÓA kỳ báo cáo (report_snapshots).
-- Lỗi cũ (0005): 2 policy "Cấm sửa/xóa report_snapshots khi đã khóa" là policy THƯỜNG (PERMISSIVE) với
--   USING (period_status != 'locked'). Policy thường là "cho phép", không phải "cấm": mọi tài khoản đã đăng nhập
--   (kể cả người xem) gọi API trực tiếp vẫn SỬA / XÓA được mọi kỳ báo cáo chưa khóa.
--   (Trigger trg_locked_report_snapshot_guard vẫn bảo vệ kỳ đã KHÓA, không đổi.)
-- Sau 0115 (vẫn giữ điều kiện chưa khóa):
--   * super_admin / admin / btc_manager: sửa, xóa mọi kỳ chưa khóa.
--   * warehouse_manager: chỉ kỳ thuộc kho trong managed_warehouse_ids (khớp quy tắc INSERT ở 0060).
--   * Vai trò khác: không sửa/xóa được.
-- KHÔNG đổi policy SELECT / INSERT; khóa/mở khóa vẫn qua RPC lock_reporting_period / reopen_reporting_period.
BEGIN;

DROP POLICY IF EXISTS "Cấm sửa report_snapshots khi đã khóa" ON public.report_snapshots;
CREATE POLICY "Cấm sửa report_snapshots khi đã khóa" ON public.report_snapshots FOR UPDATE TO authenticated
USING (
  period_status <> 'locked'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager')
    OR (p.role = 'warehouse_manager' AND report_snapshots.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
  ))
)
WITH CHECK (
  period_status <> 'locked'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager')
    OR (p.role = 'warehouse_manager' AND report_snapshots.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
  ))
);

DROP POLICY IF EXISTS "Cấm xóa report_snapshots khi đã khóa" ON public.report_snapshots;
CREATE POLICY "Cấm xóa report_snapshots khi đã khóa" ON public.report_snapshots FOR DELETE TO authenticated
USING (
  period_status <> 'locked'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager')
    OR (p.role = 'warehouse_manager' AND report_snapshots.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
  ))
);

COMMIT;

-- KIỂM TRA:
--  1. SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename='report_snapshots' ORDER BY 1;
--  2. Admin xóa/sửa một kỳ báo cáo thử chưa khóa: được. Kỳ đã khóa: vẫn bị trigger chặn.
--  3. Thủ kho xóa kỳ của kho mình: được; kỳ của kho khác: không xóa được (0 dòng).
--  4. Tài khoản người xem / supervisor: không sửa, không xóa được (giao diện báo "Không thể xóa").