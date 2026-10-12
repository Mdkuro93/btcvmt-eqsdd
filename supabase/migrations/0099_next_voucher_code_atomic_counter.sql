-- 0099_next_voucher_code_atomic_counter.sql  (Q7)
-- _next_voucher_code (0037) quét toàn bảng transaction_items lấy MAX rồi +1: chậm khi hàng chục nghìn dòng và
-- hai giao dịch đồng thời có thể nhận cùng một mã phiếu (0096 chỉ chặn trùng ở mức ghi).
-- Thay bằng BỘ ĐẾM NGUYÊN TỬ theo (vùng-kho-loại phiếu-năm):
--   * bảng voucher_code_counters(prefix, last_seq); INSERT .. ON CONFLICT DO UPDATE khóa dòng đếm tới hết giao dịch;
--   * lần đầu một tiền tố xuất hiện: gieo từ MAX hiện có (quét một lần), sau đó chỉ tăng bộ đếm;
--   * vẫn bỏ qua mã đã tồn tại (phòng mã sinh từ nơi khác, ví dụ phía trình duyệt) bằng cách tăng tiếp.
-- Giữ nguyên định dạng [VÙNG]-[MÃ KHO 3 SỐ]-[PN|PX]-[4 SỐ]/[NĂM] và nguồn vùng/kho (warehouses.region_code, warehouses.code).
-- Giao dịch bị hủy thì bộ đếm cũng hoàn lại: không để lại lỗ hổng số.
-- Rollback: ops/rollback/rollback_0099_next_voucher_code_atomic_counter.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.voucher_code_counters (
  prefix     text PRIMARY KEY,           -- ví dụ 'VMT-001-PN-/2026' (đã gồm năm)
  last_seq   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voucher_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voucher_code_counters FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_transaction_items_voucher_code_upper
  ON public.transaction_items (upper(voucher_code)) WHERE voucher_code IS NOT NULL AND voucher_code <> '';

CREATE OR REPLACE FUNCTION public._next_voucher_code(
  p_warehouse_id uuid,
  p_voucher_type text -- 'PN' hoặc 'PX'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_region_code text;
  v_wh_code     text;
  v_type        text := upper(btrim(COALESCE(p_voucher_type, '')));
  v_prefix      text;
  v_year_suffix text;
  v_key         text;
  v_seed        integer := 0;
  v_seq         integer;
  v_code        text;
BEGIN
  IF v_type NOT IN ('PN', 'PX') THEN
    RAISE EXCEPTION 'Loại phiếu không hợp lệ: "%" (chỉ PN hoặc PX).', COALESCE(p_voucher_type, '') USING ERRCODE = '22023';
  END IF;

  SELECT UPPER(COALESCE(w.region_code, 'VMT')), LPAD(COALESCE(w.code, '1'), 3, '0')
    INTO v_region_code, v_wh_code
    FROM public.warehouses w WHERE w.id = p_warehouse_id;
  IF v_region_code IS NULL THEN
    v_region_code := 'VMT';
    v_wh_code := '001';
  END IF;

  v_prefix := v_region_code || '-' || v_wh_code || '-' || v_type || '-';
  v_year_suffix := '/' || EXTRACT(YEAR FROM now())::text;
  v_key := v_prefix || v_year_suffix;

  -- Lần đầu thấy tiền tố này: gieo từ mã lớn nhất đang có (quét một lần)
  IF NOT EXISTS (SELECT 1 FROM public.voucher_code_counters WHERE prefix = v_key) THEN
    SELECT COALESCE(MAX(NULLIF(substring(upper(ti.voucher_code) FROM '^' || v_prefix || '([0-9]+)' || v_year_suffix || '$'), '')::integer), 0)
      INTO v_seed
      FROM public.transaction_items ti
     WHERE ti.voucher_code IS NOT NULL
       AND upper(ti.voucher_code) LIKE v_prefix || '%' || v_year_suffix;
  END IF;

  LOOP
    INSERT INTO public.voucher_code_counters (prefix, last_seq)
    VALUES (v_key, v_seed + 1)
    ON CONFLICT (prefix) DO UPDATE
      SET last_seq = public.voucher_code_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_code := v_prefix || LPAD(v_seq::text, 4, '0') || v_year_suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE upper(ti.voucher_code) = v_code);
    v_seed := 0;  -- mã đã bị dùng ở nơi khác: lần lặp sau chỉ tăng bộ đếm
  END LOOP;

  RETURN v_code;
END;
$function$;

COMMIT;