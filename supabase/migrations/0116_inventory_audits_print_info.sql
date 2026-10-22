-- Migration 0116: lưu thông tin biên bản kiểm kê (hội đồng + kết luận) trong DB.
-- Trước đây: hội đồng kiểm kê và 2 ô kết luận chỉ lưu trong localStorage của trình duyệt (theo từng máy),
--   nên cùng một đợt mở trên máy khác sẽ in ra thành phần ký khác.
-- Sau 0116: 3 cột nullable trên inventory_audits. NULL = dùng mặc định như cũ.
--   print_committee         jsonb  : mảng thành viên [{id, fullName, position, roleLabel, isSigner, signTitle}]
--   print_physical_notes    text   : "Hiện trạng kho lưu trữ"
--   print_additional_notes  text   : "Ghi chú bổ sung của đợt kiểm"
-- Ai ghi được: đúng người đang được sửa đợt kiểm kê theo policy UPDATE 0112 (admin/BTC/quan_ly, asset.manage,
--   thủ kho đúng kho). Đợt đã lưu trữ: chỉ admin (trigger 0114). KHÔNG đổi policy nào.
BEGIN;

ALTER TABLE public.inventory_audits
  ADD COLUMN IF NOT EXISTS print_committee jsonb,
  ADD COLUMN IF NOT EXISTS print_physical_notes text,
  ADD COLUMN IF NOT EXISTS print_additional_notes text;

ALTER TABLE public.inventory_audits DROP CONSTRAINT IF EXISTS inventory_audits_print_info_chk;
ALTER TABLE public.inventory_audits ADD CONSTRAINT inventory_audits_print_info_chk CHECK (
  (print_committee IS NULL OR (jsonb_typeof(print_committee) = 'array' AND jsonb_array_length(print_committee) <= 20))
  AND (print_physical_notes   IS NULL OR length(print_physical_notes)   <= 4000)
  AND (print_additional_notes IS NULL OR length(print_additional_notes) <= 4000)
);

COMMIT;

-- KIỂM TRA:
--  1. SELECT column_name FROM information_schema.columns WHERE table_name='inventory_audits' AND column_name LIKE 'print_%';
--  2. Thủ kho chỉnh hội đồng ở một đợt kho mình, đóng rồi mở lại trên máy khác: thấy thành phần đã chỉnh.
--  3. Thủ kho kho khác / viewer chỉnh: giao diện báo không lưu được, nội dung chỉ giữ tạm trên máy đó.