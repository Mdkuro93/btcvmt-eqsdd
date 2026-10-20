-- Migration 0110: giới hạn quyền SỬA (UPDATE) phiếu theo kho.
-- Trước đây: mọi warehouse_manager sửa/duyệt được MỌI phiếu (transactions, transaction_items) của mọi kho nếu gọi API trực tiếp.
-- App không UPDATE trực tiếp hai bảng này: duyệt phiếu đi qua RPC decide_transaction_item (SECURITY DEFINER, tự kiểm tra kho),
-- hủy phiếu qua void_transaction_item, luân chuyển qua các RPC 0091 -> các RPC không bị ảnh hưởng bởi policy này.
-- Sau 0110: admin/super_admin/btc_manager sửa mọi phiếu; thủ kho chỉ sửa phiếu thuộc kho mình quản lý
--   (dùng _wm_tx_in_scope / _wm_item_in_scope của 0107: kho hiện tại của GCN, kho xuất hoặc kho nhận của luân chuyển).
-- KHÔNG đổi các policy INSERT (app còn thêm phiếu trực tiếp ở một số luồng) và SELECT (đã theo kho từ 0107).
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND cmd = 'UPDATE' AND (
                 (tablename = 'transactions' AND policyname LIKE 'Chỉ btc_manager/warehouse_manager được duyệt%')
              OR (tablename = 'transaction_items' AND policyname LIKE 'Duyệt transaction_items cho btc_manager%'))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "transactions_update_by_warehouse" ON public.transactions FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_tx_in_scope(transactions.id, transactions.warehouse_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_tx_in_scope(transactions.id, transactions.warehouse_id)
);

CREATE POLICY "transaction_items_update_by_warehouse" ON public.transaction_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_item_in_scope(transaction_items.asset_id, transaction_items.details)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR public._wm_item_in_scope(transaction_items.asset_id, transaction_items.details)
);

COMMIT;

-- KIỂM TRA sau khi chạy:
--  1. SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public'
--       AND tablename IN ('transactions','transaction_items') AND cmd IN ('UPDATE','ALL') ORDER BY 1,2;
--     -> mỗi bảng đúng 1 policy UPDATE là *_update_by_warehouse.
--  2. Trên app: thủ kho duyệt 1 phiếu của kho mình (Duyệt phiếu), hủy 1 phiếu, nhận/thu hồi 1 lệnh luân chuyển -> vẫn chạy.