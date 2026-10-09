-- 0096_voucher_code_unique_per_transaction.sql
-- DB thật có chỉ mục UNIQUE idx_unique_transaction_items_voucher_code (voucher_code) KHÔNG nằm trong repo (lệch schema).
-- Nó chặn "một phiếu nhập chung cho nhiều GCN" của import_assets_bulk (dòng thứ 2 trở đi báo duplicate key).
-- Quyết định nghiệp vụ: một mã phiếu thuộc ĐÚNG MỘT giao dịch; một giao dịch có nhiều dòng cùng mã phiếu.
-- => thay chỉ mục duy nhất theo dòng bằng chốt chặn mức giao dịch (trigger + khóa tư vấn chống đua).
-- Rollback: ops/rollback/rollback_0096_voucher_code_unique_per_transaction.sql
BEGIN;

DROP INDEX IF EXISTS public.idx_unique_transaction_items_voucher_code;
CREATE INDEX IF NOT EXISTS idx_transaction_items_voucher_code
  ON public.transaction_items (voucher_code)
  WHERE voucher_code IS NOT NULL AND voucher_code <> '';

CREATE OR REPLACE FUNCTION public._transaction_items_voucher_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.voucher_code IS NULL OR btrim(NEW.voucher_code) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.voucher_code IS NOT DISTINCT FROM OLD.voucher_code
       AND NEW.transaction_id IS NOT DISTINCT FROM OLD.transaction_id THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voucher_code:' || NEW.voucher_code, 0));
  IF EXISTS (
    SELECT 1 FROM public.transaction_items x
    WHERE x.voucher_code = NEW.voucher_code
      AND x.transaction_id IS DISTINCT FROM NEW.transaction_id
      AND x.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Mã phiếu "%" đã thuộc một phiếu (giao dịch) khác.', NEW.voucher_code
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._transaction_items_voucher_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transaction_items_voucher_guard ON public.transaction_items;
CREATE TRIGGER trg_transaction_items_voucher_guard
  BEFORE INSERT OR UPDATE OF voucher_code, transaction_id ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION public._transaction_items_voucher_guard();

COMMIT;
