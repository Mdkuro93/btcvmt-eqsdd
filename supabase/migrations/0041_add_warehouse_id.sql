-- ==============================================================================
-- MIGRATION: 0041_add_warehouse_id_to_transactions.sql
-- MỤC ĐÍCH: Bổ sung cột warehouse_id còn thiếu trên bảng `transactions`.
--   Đã xác nhận qua truy vấn information_schema.columns: cột này KHÔNG tồn tại
--   trên DB thật, trong khi migration 0040 (_process_single_declaration_approval)
--   có nhánh INSERT INTO transactions (..., warehouse_id) khi duyệt lẻ 1 đề nghị
--   (không qua duyệt hàng loạt, tức p_transaction_id IS NULL) — nếu không vá cột
--   này trước, duyệt lẻ sẽ báo lỗi "column warehouse_id does not exist".
-- ==============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

COMMENT ON COLUMN public.transactions.warehouse_id IS
  'Kho liên quan tới phiếu (dùng khi tạo phiếu nhập tự động từ duyệt đề xuất khai báo GCN, migration 0040)';

-- Kiểm tra lại sau khi chạy (phải trả về đúng 1 dòng):
-- select column_name from information_schema.columns
-- where table_name = 'transactions' and column_name = 'warehouse_id';