-- Migration 0109: policy "Admin và BTC Manager được thêm sửa xóa assets" là FOR ALL nên VÔ TÌNH cũng áp dụng cho SELECT.
-- Điều kiện của nó: role admin/super_admin/btc_manager HOẶC profiles.permissions có 'asset.edit' (quyền ghi đè riêng của tài khoản).
-- => bất kỳ tài khoản nào có 'asset.edit' (vd thủ kho tạo qua giao diện) đều xem được TOÀN BỘ GCN mọi kho, bỏ qua giới hạn theo kho.
-- Sửa: tách thành INSERT / UPDATE / DELETE với đúng điều kiện cũ (quyền ghi giữ nguyên), KHÔNG còn áp dụng cho SELECT.
-- Phạm vi xem GCN do các policy SELECT theo kho đảm nhiệm. Lưu ý: UPDATE/DELETE có WHERE theo cột vẫn phải thấy được dòng đó qua policy SELECT.
BEGIN;

DROP POLICY IF EXISTS "Admin và BTC Manager được thêm sửa xóa assets" ON public.assets;

CREATE POLICY "assets_insert_admin_or_edit" ON public.assets FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active'
    AND (p.role IN ('super_admin','admin','btc_manager')
         OR (p.permissions IS NOT NULL AND 'asset.edit' = ANY (p.permissions)))));

CREATE POLICY "assets_update_admin_or_edit" ON public.assets FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active'
    AND (p.role IN ('super_admin','admin','btc_manager')
         OR (p.permissions IS NOT NULL AND 'asset.edit' = ANY (p.permissions)))))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active'
    AND (p.role IN ('super_admin','admin','btc_manager')
         OR (p.permissions IS NOT NULL AND 'asset.edit' = ANY (p.permissions)))));

CREATE POLICY "assets_delete_admin_or_edit" ON public.assets FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.status = 'active'
    AND (p.role IN ('super_admin','admin','btc_manager')
         OR (p.permissions IS NOT NULL AND 'asset.edit' = ANY (p.permissions)))));

COMMIT;

-- KIỂM TRA: SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='assets' ORDER BY cmd, policyname;
--   -> không còn policy cmd = 'ALL' trên assets.
-- Chạy lại kiem_tra_pham_vi_du_lieu_theo_tai_khoan.sql: kuropk1 phải thấy 0, kuro vẫn 3.