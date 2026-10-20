-- Migration 0108: thêm cột transaction_items.created_at (DB thật không có cột này, trong khi app đang sắp xếp/đọc theo cột đó).
-- Triệu chứng: trang Luân chuyển kho và Sổ cái/Nhật ký báo "column transaction_items.created_at does not exist" -> danh sách luân chuyển trống,
--   không xử lý được phiếu luân chuyển (nhận / từ chối / thu hồi).
-- Cách làm: thêm cột, điền từ transactions.created_at cho dữ liệu cũ (tạm tắt trigger người dùng để không kích hoạt trigger chặn
--   trên phiếu luân chuyển 0091 / mã chứng từ 0096), rồi đặt NOT NULL + mặc định now() cho dòng mới.
BEGIN;

ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.transaction_items DISABLE TRIGGER USER;
UPDATE public.transaction_items ti
SET created_at = COALESCE(t.created_at, now())
FROM public.transactions t
WHERE t.id = ti.transaction_id AND ti.created_at IS NULL;
UPDATE public.transaction_items SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.transaction_items ENABLE TRIGGER USER;

ALTER TABLE public.transaction_items ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.transaction_items ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_items_created_at ON public.transaction_items (created_at DESC);

COMMIT;

-- KIỂM TRA: SELECT count(*) AS thieu FROM public.transaction_items WHERE created_at IS NULL;  -- 0
--           SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.transaction_items'::regclass AND NOT tgisinternal;  -- tgenabled = 'O' (bật)
-- ROLLBACK: DROP INDEX IF EXISTS public.idx_transaction_items_created_at; ALTER TABLE public.transaction_items DROP COLUMN created_at;