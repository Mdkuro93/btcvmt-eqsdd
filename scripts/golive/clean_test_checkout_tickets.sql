-- =====================================================================================
-- Script dọn dẹp phiếu xuất mượn test & hoàn trả trạng thái GCN bị kẹt
-- Vị trí: scripts/golive/clean_test_checkout_tickets.sql
-- =====================================================================================
-- HƯỚNG DẪN:
--   Chạy script này trong Supabase SQL Editor khi muốn dọn dẹp các phiếu xuất mượn test
--   hoặc phiếu lập sai khiến tài sản bị kẹt ở trạng thái 'checked_out' / 'in_transit'.
-- =====================================================================================

BEGIN;

-- 1. Tìm và hoàn trả các tài sản đang bị kẹt ở trạng thái 'checked_out' hoặc 'in_transit'
-- do các phiếu kiểm thử hoặc phiếu bị hủy
UPDATE public.assets a
SET custody_status = 'in_stock',
    borrower_name = NULL,
    expected_return_date = NULL,
    borrow_purpose = NULL,
    current_holder_dept = NULL,
    updated_at = now()
WHERE a.custody_status IN ('checked_out', 'in_transit')
  AND EXISTS (
    SELECT 1 FROM public.transaction_items ti
    WHERE ti.asset_id = a.id
      AND (
        ti.status = 'cancelled'
        OR ti.voucher_code ILIKE '%TEST%'
        OR ti.notes ILIKE '%test%'
        OR ti.details->>'borrower' ILIKE '%test%'
      )
  );

-- 2. Đổi trạng thái các dòng phiếu kiểm thử sang 'cancelled'
UPDATE public.transaction_items
SET status = 'cancelled',
    notes = COALESCE(notes, '') || ' [ĐÃ DỌN DẸP DỮ LIỆU TEST]'
WHERE status IN ('approved', 'completed')
  AND (
    voucher_code ILIKE '%TEST%'
    OR notes ILIKE '%test%'
    OR details->>'borrower' ILIKE '%test%'
  );

COMMIT;

-- Kiểm tra kết quả:
-- SELECT id, certificate_no, custody_status, warehouse_id FROM public.assets WHERE custody_status = 'checked_out';
