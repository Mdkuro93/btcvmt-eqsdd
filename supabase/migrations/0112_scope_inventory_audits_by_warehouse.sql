-- Migration 0112: kiểm kê kho (inventory_audits, inventory_audit_items) chỉ theo kho phụ trách / được gán.
-- Lỗi cũ (đọc từ policy trên DB thật):
--   1. managed_warehouse_ids IS NULL được coi là "quản lý mọi kho" -> thủ kho chưa gán kho vẫn thấy mọi đợt kiểm kê.
--   2. Quyền 'asset.view' / 'report.view' (mọi thủ kho đều có) trong cột permissions cho XEM TẤT CẢ đợt kiểm kê của mọi kho.
-- Sau 0112:
--   - admin/super_admin/btc_manager/quan_ly và người có 'asset.manage': xem và sửa tất cả (như cũ).
--   - warehouse_manager: chỉ kho trong managed_warehouse_ids (NULL = không có kho nào).
--   - supervisor, capital_dept, project_dept, re_dept: chỉ XEM kho trong assigned_warehouse_ids.
--   - viewer/nguoi_dung/user: chỉ XEM kho đang được cấp quyền (viewer_warehouse_access còn hạn), như cũ.
--   - dòng kiểm kê (inventory_audit_items): xem theo đợt kiểm kê mà mình xem được; ghi theo quyền sửa đợt kiểm kê.
-- KHÔNG đổi policy INSERT / DELETE hiện có.
BEGIN;

DROP POLICY IF EXISTS "Xem danh sach dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Xem danh sach dot kiem ke kho" ON public.inventory_audits FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager','quan_ly')
    OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY (p.permissions))
    OR (p.role = 'warehouse_manager' AND inventory_audits.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
    OR (p.role IN ('supervisor','capital_dept','project_dept','re_dept')
        AND inventory_audits.warehouse_id = ANY (COALESCE(p.assigned_warehouse_ids, ARRAY[]::uuid[])))
    OR (p.role IN ('viewer','nguoi_dung','user') AND EXISTS (
          SELECT 1 FROM public.viewer_warehouse_access vwa
          WHERE vwa.user_id = p.id AND vwa.warehouse_id = inventory_audits.warehouse_id
            AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc', now()))))
  )));

DROP POLICY IF EXISTS "Cap nhat dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Cap nhat dot kiem ke kho" ON public.inventory_audits FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active' AND (
    p.role IN ('super_admin','admin','btc_manager','quan_ly')
    OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY (p.permissions))
    OR (p.role = 'warehouse_manager' AND inventory_audits.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))
  )));

DROP POLICY IF EXISTS "Xem chi tiet dong kiem ke" ON public.inventory_audit_items;
CREATE POLICY "Xem chi tiet dong kiem ke" ON public.inventory_audit_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inventory_audits ia WHERE ia.id = inventory_audit_items.audit_id));

DROP POLICY IF EXISTS "Quan ly dong kiem ke" ON public.inventory_audit_items;
CREATE POLICY "Quan ly dong kiem ke" ON public.inventory_audit_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.inventory_audits ia
  WHERE ia.id = inventory_audit_items.audit_id AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active' AND (
      p.role IN ('super_admin','admin','btc_manager','quan_ly')
      OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY (p.permissions))
      OR (p.role = 'warehouse_manager' AND ia.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))))))
WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_audits ia
  WHERE ia.id = inventory_audit_items.audit_id AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active' AND (
      p.role IN ('super_admin','admin','btc_manager','quan_ly')
      OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY (p.permissions))
      OR (p.role = 'warehouse_manager' AND ia.warehouse_id = ANY (COALESCE(p.managed_warehouse_ids, ARRAY[]::uuid[])))))));

COMMIT;

-- KIỂM TRA trên app (bắt buộc, vì app truy vấn kiểm kê trực tiếp): thủ kho tạo đợt kiểm kê cho kho mình, nhập số lượng, hoàn tất;
--   thủ kho kho khác KHÔNG thấy đợt đó; admin thấy tất cả.