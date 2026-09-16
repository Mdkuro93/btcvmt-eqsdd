-- ==============================================================================
-- Migration 0019: Sửa lỗi đệ quy chính sách RLS (42P17) trên bảng transaction_items và transactions
-- ==============================================================================
-- NGUYÊN NHÂN GỐC RỄ:
-- Trong migration ban đầu 0000_initial_schema.sql:
-- 1. Policy "transactions_select" trên bảng transactions thực hiện:
--    EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transaction_id = transactions.id ...)
-- 2. Policy "transaction_items_select" trên bảng transaction_items thực hiện:
--    EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_items.transaction_id ...)
-- 
-- Khi áp dụng các migration sau (0004, 0011, 0012, 0016), hệ thống đã tạo thêm các policy mới
-- bằng tiếng Việt ("Xem transaction: người tạo hoặc người có quyền duyệt", "Xem transaction_items cho user active").
-- Tuy nhiên, các policy cũ bằng tiếng Anh từ 0000_initial_schema.sql ("transactions_select" và
-- "transaction_items_select") CHƯA được DROP.
-- Vì PostgreSQL gộp các policy SELECT bằng phép toán OR (policy1 OR policy2), nên khi có bất kỳ truy vấn
-- SELECT nào tới transactions hoặc transaction_items, Postgres vẫn đánh giá đồng thời cả policy cũ,
-- dẫn đến vòng lặp đệ quy vô tận (42P17: infinite recursion detected in policy for relation "transaction_items").
--
-- GIẢI PHÁP:
-- Xóa bỏ hoàn toàn 5 policy cũ từ initial schema để chấm dứt đệ quy chéo,
-- giữ lại các policy phân quyền chuẩn theo vai trò đã định nghĩa trong 0004, 0011, 0012, 0016.
-- ==============================================================================

-- 1. Gỡ bỏ các policy cũ bị đệ quy trên bảng transactions
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;

-- 2. Gỡ bỏ các policy cũ bị đệ quy trên bảng transaction_items
DROP POLICY IF EXISTS "transaction_items_select" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_insert" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_decide" ON public.transaction_items;
