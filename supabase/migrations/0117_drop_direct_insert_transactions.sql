-- Migration 0117: đóng đường GHI TRỰC TIẾP vào transactions / transaction_items từ trình duyệt.
-- Phát hiện từ snapshot policy DB thật (20/10/2026): còn 2 policy INSERT cho phép ghi thẳng bằng API:
--   * "Tạo transaction đúng theo permission của role" (transactions): chỉ kiểm tra vai trò + loại phiếu,
--     KHÔNG kiểm tra created_by = người đang đăng nhập (giả danh người tạo).
--   * "Tạo transaction_items cho user active" (transaction_items): không buộc dòng vào phiếu của chính mình,
--     không chặn status ('approved'...) hay các trường duyệt.
--   Cả hai cho phép BỎ QUA các kiểm tra của create_transaction_request (0074): bảng lý do theo vai trò, phạm vi kho,
--   GCN còn hiệu lực, không trùng phiếu chờ duyệt, tối đa 500 mục, định dạng scan_url.
-- Mọi luồng thật đều dùng hàm SECURITY DEFINER (create_transaction_request, các hàm duyệt kê khai, luân chuyển 0091,
--   nhập khẩu...) nên KHÔNG cần các policy này. Chỉ nhánh dự phòng (khi thiếu RPC) trong code từng ghi trực tiếp; nhánh đó
--   đã bỏ cùng đợt này. Không có policy INSERT thì authenticated không ghi trực tiếp được (RLS từ chối).
-- KHÔNG đổi policy SELECT / UPDATE.
BEGIN;

DROP POLICY IF EXISTS "Tạo transaction đúng theo permission của role" ON public.transactions;
DROP POLICY IF EXISTS "Tạo transaction_items cho user active" ON public.transaction_items;

COMMIT;

-- KIỂM TRA:
--  1. SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('transactions','transaction_items') ORDER BY 1,2;
--       -> không còn policy cmd = INSERT.
--  2. Thủ kho / bộ phận tạo một phiếu mượn/xuất qua giao diện: vẫn tạo được (đi qua create_transaction_request).
--  3. Duyệt phiếu, luân chuyển kho, duyệt yêu cầu kê khai: vẫn chạy như cũ.
--  4. (Tùy chọn) Trình duyệt gọi supabase.from('transactions').insert(...) trực tiếp: bị từ chối (RLS).