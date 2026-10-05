-- 0063_fix_void_transaction_item_role_check.sql
-- Lý do: 0058_void_transaction_audit_log.sql (repo) có lỗi phân quyền:
--   `IF v_role NOT IN (...)` khi v_role = NULL (tài khoản không có hồ sơ active, ví dụ chờ duyệt/bị khóa)
--   cho kết quả NULL, IF coi như FALSE -> KHÔNG bị chặn -> hủy phiếu được.
-- Sửa: (1) chặn khi v_role IS NULL; (2) khóa dòng phiếu (FOR UPDATE) để hai người hủy cùng lúc không chạy chồng.
-- GIỮ NGUYÊN chữ ký, ghi activity_logs, quyền EXECUTE (0058 + 0061).
-- Phạm vi: CHỈ viết lại public.void_transaction_item(uuid,text).
-- Chưa sửa (cần xác nhận nghiệp vụ, xem báo cáo): hủy phiếu CŨ có thể trả sai trạng thái tài sản khi đã có phiếu mượn MỚI.
BEGIN;

CREATE OR REPLACE FUNCTION public.void_transaction_item(
  p_item_id uuid,
  p_reason text DEFAULT 'Hủy phiếu sai/phiếu kiểm thử'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         text;
  v_item         record;
  v_asset        record;
  v_reason_clean text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy phiếu giao dịch (chỉ Admin và BTC Manager được phép).' USING ERRCODE = '42501';
  END IF;

  SELECT ti.*, t.type AS tx_type, t.created_by AS tx_requester
  INTO v_item
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaction_id
  WHERE ti.id = p_item_id
  FOR UPDATE OF ti;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu giao dịch cần hủy.' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'Phiếu giao dịch này đã được hủy trước đó.' USING ERRCODE = '22023';
  END IF;

  v_reason_clean := COALESCE(NULLIF(btrim(p_reason), ''), 'Hủy phiếu sai/kiểm thử');

  SELECT id, certificate_no, custody_status, warehouse_id, expected_return_date
  INTO v_asset
  FROM public.assets
  WHERE id = v_item.asset_id
  FOR UPDATE;

  IF v_item.type = 'checkout' THEN
    IF v_asset.custody_status IN ('checked_out', 'in_transit') THEN
      UPDATE public.assets
      SET custody_status = 'in_stock',
          expected_return_date = NULL,
          borrow_purpose = NULL,
          current_holder_dept = NULL,
          updated_at = now()
      WHERE id = v_item.asset_id;
    END IF;
  END IF;

  UPDATE public.transaction_items
  SET status = 'cancelled',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[ĐÃ HỦY: ' || v_reason_clean || ']'
        ELSE notes || ' | [ĐÃ HỦY: ' || v_reason_clean || ']'
      END,
      decision_notes = COALESCE(decision_notes, '') || ' (Đã hủy bởi ' || v_role || ')',
      decided_at = now(),
      decided_by = v_uid
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (
    log_date, action_type, document_no, description, used_by, notes,
    asset_id, transaction_id, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE,
    'Hủy phiếu',
    COALESCE(v_item.voucher_code, 'CHƯA-SỐ'),
    'Hủy phiếu ' || COALESCE(v_item.voucher_code, '') || ' của GCN ' || COALESCE(v_asset.certificate_no, '-') || '. Lý do: ' || v_reason_clean,
    'BTC VMT',
    v_reason_clean,
    v_item.asset_id,
    v_item.transaction_id,
    v_asset.warehouse_id,
    v_uid
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'asset_id', v_item.asset_id,
    'voucher_code', v_item.voucher_code,
    'warehouse_id', v_asset.warehouse_id,
    'message', 'Đã hủy phiếu và hoàn trả trạng thái tài sản về kho thành công.'
  );
END;
$$;

COMMIT;

-- ROLLBACK: chạy lại nội dung hàm trong supabase/migrations/0058_void_transaction_audit_log.sql