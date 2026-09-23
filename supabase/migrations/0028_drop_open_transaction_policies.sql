-- Migration 0028: Gỡ 2 policy mở toang trên transactions và transaction_items
--
-- Hai policy này (ALL, TO authenticated, USING true) KHÔNG có trong repo, được tạo tay trên DB thật.
-- Vì các policy cùng lệnh được gộp bằng OR nên chúng vô hiệu hóa toàn bộ policy phân quyền theo vai trò
-- đã có sẵn: "Xem transaction...", "Tạo transaction đúng theo permission của role",
-- "Chi btc_manager/warehouse_manager được duyệt...", "Duyệt/Tạo/Xem transaction_items...".
-- Sau khi gỡ, phân quyền quay về đúng thiết kế. Các RPC SECURITY DEFINER (duyệt phiếu...) không bị ảnh hưởng.

DROP POLICY IF EXISTS "transactions_authenticated_policy" ON public.transactions;
DROP POLICY IF EXISTS "transaction_items_authenticated_policy" ON public.transaction_items;

-- ==============================================================================
-- ROLLBACK KHẨN CẤP (chỉ chạy nếu sau khi gỡ có luồng nghiệp vụ hợp lệ bị lỗi
-- "new row violates row-level security policy" — rồi báo lại để vá đúng policy thay vì mở lại):
--
-- CREATE POLICY "transactions_authenticated_policy" ON public.transactions
--   FOR ALL TO authenticated USING (true);
-- CREATE POLICY "transaction_items_authenticated_policy" ON public.transaction_items
--   FOR ALL TO authenticated USING (true);
-- ==============================================================================