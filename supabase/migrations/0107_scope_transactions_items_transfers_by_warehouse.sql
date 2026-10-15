-- Migration 0107: giới hạn phạm vi XEM phiếu theo kho; siết quyền GHI lịch sử chuyển nhượng.
-- Quyết định của chủ dự án: thủ kho chỉ thấy phiếu có kho gửi hoặc kho nhận thuộc kho mình quản lý.
--   1. transaction_items SELECT: capital/project/re_dept theo kho được gán của GCN; warehouse_manager theo kho quản lý
--      (kho hiện tại của GCN, hoặc kho xuất/kho nhận trong details->'transfer'). Admin/btc_manager giữ toàn bộ.
--   2. transactions SELECT: người tạo | admin/btc_manager | warehouse_manager khi phiếu thuộc kho mình (transactions.warehouse_id hoặc có dòng phiếu trong phạm vi).
--   3. asset_ownership_transfers: SELECT của warehouse_manager theo kho của GCN; quyền ghi (ALL) chỉ còn admin/btc_manager/admin.manage
--      (ghi lịch sử đi qua RPC transfer_asset_ownership SECURITY DEFINER nên không ảnh hưởng).
-- Dùng hàm SECURITY DEFINER để tránh đệ quy RLS giữa transactions <-> transaction_items (xem 0019).
BEGIN;

CREATE OR REPLACE FUNCTION public._wm_managed_warehouses()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.managed_warehouse_ids FROM public.profiles p
                   WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'warehouse_manager'),
                  ARRAY[]::uuid[]);
$$;

CREATE OR REPLACE FUNCTION public._wm_item_in_scope(p_asset_id uuid, p_details jsonb)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT a.warehouse_id FROM public.assets a WHERE a.id = p_asset_id) = ANY (public._wm_managed_warehouses())
    OR NULLIF(p_details #>> '{transfer,source_warehouse_id}', '')::uuid = ANY (public._wm_managed_warehouses())
    OR NULLIF(p_details #>> '{transfer,target_warehouse_id}', '')::uuid = ANY (public._wm_managed_warehouses());
$$;

CREATE OR REPLACE FUNCTION public._wm_tx_in_scope(p_tx_id uuid, p_wh uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_wh = ANY (public._wm_managed_warehouses())
      OR EXISTS (SELECT 1 FROM public.transaction_items ti
                 WHERE ti.transaction_id = p_tx_id AND public._wm_item_in_scope(ti.asset_id, ti.details));
$$;

REVOKE ALL ON FUNCTION public._wm_managed_warehouses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._wm_item_in_scope(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._wm_tx_in_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._wm_managed_warehouses() TO authenticated;
GRANT EXECUTE ON FUNCTION public._wm_item_in_scope(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public._wm_tx_in_scope(uuid, uuid) TO authenticated;

-- Gỡ policy SELECT cũ theo tên thật trên DB (tên bị cắt ở 63 byte nên tra bằng LIKE)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND cmd = 'SELECT' AND (
                 (tablename = 'transactions' AND policyname LIKE 'Xem transaction:%')
              OR (tablename = 'transaction_items' AND policyname = 'Xem transaction_items cho user active')
              OR (tablename = 'asset_ownership_transfers' AND policyname LIKE 'Xem lịch sử chuyển giao sở hữu%'))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "transactions_select_by_warehouse" ON public.transactions FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_tx_in_scope(transactions.id, transactions.warehouse_id)
);

CREATE POLICY "transaction_items_select_by_warehouse" ON public.transaction_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_item_in_scope(transaction_items.asset_id, transaction_items.details)
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.assets a ON a.id = transaction_items.asset_id
             WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('capital_dept','project_dept','re_dept')
               AND a.warehouse_id = ANY (COALESCE(p.assigned_warehouse_ids, ARRAY[]::uuid[])))
);

CREATE POLICY "aot_select_scoped" ON public.asset_ownership_transfers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.status = 'active'
            AND (p.role IN ('super_admin','admin','btc_manager')
                 OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY (p.permissions))
                 OR has_permission('admin.manage')))
  OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.assets a ON a.id = asset_ownership_transfers.asset_id
             WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'investor'
               AND (a.current_owner_entity_id = ANY (p.owner_entity_ids)
                    OR asset_ownership_transfers.to_entity_id = ANY (p.owner_entity_ids)
                    OR asset_ownership_transfers.from_entity_id = ANY (p.owner_entity_ids)))
  OR EXISTS (SELECT 1 FROM public.assets a
             WHERE a.id = asset_ownership_transfers.asset_id
               AND a.warehouse_id = ANY (public._wm_managed_warehouses()))
);

DROP POLICY IF EXISTS "Quản trị viên thêm sửa xóa asset_ownership_transfers" ON public.asset_ownership_transfers;
CREATE POLICY "Quản trị viên thêm sửa xóa asset_ownership_transfers" ON public.asset_ownership_transfers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND (p.role IN ('super_admin','admin','btc_manager')
                    OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY (p.permissions)) OR has_permission('admin.manage'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND (p.role IN ('super_admin','admin','btc_manager')
                    OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY (p.permissions)) OR has_permission('admin.manage'))));

COMMIT;

-- KIỂM TRA sau khi chạy:
--  1. Không còn policy cũ: SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
--       AND tablename IN ('transactions','transaction_items','asset_ownership_transfers') AND cmd IN ('SELECT','ALL') ORDER BY 1,2;
--  2. Đăng nhập thủ kho kho A: thấy phiếu kho A và phiếu luân chuyển có kho A là kho gửi hoặc nhận; KHÔNG thấy phiếu chỉ của kho B.
--  3. Màn Luân chuyển kho: kho gửi và kho nhận đều thấy phiếu; nhận hàng vẫn chạy.
--  4. capital_dept: chỉ thấy dòng phiếu thuộc kho được gán.