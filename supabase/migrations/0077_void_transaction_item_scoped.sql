-- 0077_void_transaction_item_scoped.sql
-- Phạm vi: viết lại public.void_transaction_item(uuid,text) (giữ nguyên chữ ký + khóa trong JSON kết quả) và thêm 3 cột truy vết hủy.
-- LƯU Ý: bản 0067 (thủ kho hủy phiếu kho mình) đã chạy trên DB nhưng KHÔNG có trong repo (repo 0067 là file khác của dev).
--        0077 là bản thay thế đầy đủ; TRƯỚC KHI CHẠY hãy lưu pg_get_functiondef hiện tại làm bản rollback.
-- Sửa so với bản 0063:
--   1. Quyền: super_admin/admin/btc_manager (mọi kho) + warehouse_manager CHỈ GCN thuộc kho mình quản lý.
--   2. Chỉ hủy được phiếu đã xử lý: approved / confirmed / checked_out / completed (pending => từ chối, rejected => không cần hủy).
--   3. KHÔNG ghi đè decided_by/decided_at nữa (mất dấu người duyệt gốc); ghi vào voided_at / voided_by / void_reason.
--   4. Quy tắc N5: chỉ hoàn nguyên GCN khi phiếu này là phiếu tác động MỚI NHẤT lên GCN (chưa có phiếu duyệt muộn hơn);
--      nếu đã có phiếu mới hơn thì chỉ hủy phiếu, KHÔNG đụng GCN, và báo asset_restored=false.
--   5. Đảo hiệu ứng của 0073 khi hủy phiếu 'thế chấp' (hoặc chuyển nhượng kèm thế chấp): mortgage_status='none', xóa thông tin thế chấp.
--   6. Phiếu có hiệu ứng KHÔNG thể tự hoàn nguyên (xuất bán, sang tên cho khách, giải chấp, tách sổ, đổi sổ, nhập kèm đổi chủ):
--      từ chối hủy (0A000), yêu cầu chỉnh trực tiếp trên GCN.
BEGIN;

ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS void_reason text;

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
  v_managed      uuid[];
  v_item         record;
  v_asset        record;
  v_reason_clean text;
  v_item_reason  text;
  v_has_newer    boolean := false;
  v_restored     boolean := false;
  v_mortgage_fx  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  SELECT role, managed_warehouse_ids INTO v_role, v_managed
  FROM public.profiles WHERE id = v_uid AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy phiếu giao dịch.' USING ERRCODE = '42501';
  END IF;

  SELECT ti.* INTO v_item
  FROM public.transaction_items ti
  WHERE ti.id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu giao dịch cần hủy.' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'Phiếu giao dịch này đã được hủy trước đó.' USING ERRCODE = '22023';
  END IF;

  IF v_item.status NOT IN ('approved', 'confirmed', 'checked_out', 'completed') THEN
    RAISE EXCEPTION 'Chỉ hủy được phiếu đã xử lý (phiếu hiện ở trạng thái: %). Phiếu chờ duyệt hãy dùng chức năng từ chối.', v_item.status
      USING ERRCODE = '22023';
  END IF;

  SELECT id, certificate_no, custody_status, mortgage_status, warehouse_id
  INTO v_asset
  FROM public.assets WHERE id = v_item.asset_id FOR UPDATE;

  IF v_role = 'warehouse_manager'
     AND (v_asset.warehouse_id IS NULL OR NOT (v_asset.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[])))) THEN
    RAISE EXCEPTION 'GCN này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
  END IF;

  v_reason_clean := COALESCE(NULLIF(btrim(p_reason), ''), 'Hủy phiếu sai/kiểm thử');
  v_item_reason := COALESCE(NULLIF(v_item.reason, ''), NULLIF(v_item.details->>'reason', ''));

  IF v_item_reason IN ('xuất bán', 'sang tên cho khách', 'giải chấp', 'tách sổ', 'đổi sổ')
     OR lower(COALESCE(v_item.details->>'updateOwnership', 'false')) IN ('true', 't', '1') THEN
    RAISE EXCEPTION 'Phiếu "%" đã thay đổi dữ liệu GCN mà hệ thống không thể tự hoàn nguyên. Vui lòng chỉnh sửa trực tiếp trên GCN %.',
      COALESCE(v_item_reason, 'chuyển nhượng'), v_asset.certificate_no
      USING ERRCODE = '0A000';
  END IF;

  -- Quy tắc N5: có phiếu duyệt MUỘN HƠN tác động lên cùng GCN chưa?
  IF v_item.decided_at IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.transaction_items x
      WHERE x.asset_id = v_item.asset_id
        AND x.id <> v_item.id
        AND x.status IN ('approved', 'confirmed', 'checked_out', 'completed')
        AND x.decided_at > v_item.decided_at
    ) INTO v_has_newer;
  END IF;

  IF v_item.type = 'checkout' AND NOT v_has_newer THEN
    IF v_asset.custody_status IN ('checked_out', 'in_transit') THEN
      UPDATE public.assets
      SET custody_status = 'in_stock',
          expected_return_date = NULL,
          borrow_purpose = NULL,
          current_holder_dept = NULL,
          updated_at = now()
      WHERE id = v_item.asset_id;
      v_restored := true;
    END IF;

    v_mortgage_fx := v_item_reason = 'thế chấp'
      OR (v_item_reason = 'chuyển nhượng'
          AND lower(COALESCE(v_item.details->>'concurrentMortgage', 'false')) IN ('true', 't', '1'));

    IF v_mortgage_fx AND v_asset.mortgage_status = 'mortgaged' THEN
      UPDATE public.assets
      SET mortgage_status = 'none',
          mortgage_bank = NULL,
          mortgage_unit = NULL,
          mortgage_valuation = NULL,
          collateral_ratio = NULL,
          collateral_value = NULL,
          mortgage_expected_release_date = NULL,
          updated_at = now()
      WHERE id = v_item.asset_id;
      v_restored := true;
    END IF;
  END IF;

  UPDATE public.transaction_items
  SET status = 'cancelled',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[ĐÃ HỦY: ' || v_reason_clean || ']'
        ELSE notes || ' | [ĐÃ HỦY: ' || v_reason_clean || ']'
      END,
      decision_notes = COALESCE(decision_notes, '') || ' (Đã hủy bởi ' || v_role || ')',
      voided_at = now(),
      voided_by = v_uid,
      void_reason = v_reason_clean
  WHERE id = p_item_id;

  INSERT INTO public.activity_logs (
    log_date, action_type, document_no, description, used_by, notes,
    asset_id, transaction_id, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE,
    'Hủy phiếu',
    COALESCE(v_item.voucher_code, 'CHƯA-SỐ'),
    'Hủy phiếu ' || COALESCE(v_item.voucher_code, '') || ' của GCN ' || COALESCE(v_asset.certificate_no, '-') || '. Lý do: ' || v_reason_clean
      || CASE WHEN v_has_newer THEN ' (GCN không được hoàn nguyên vì đã có phiếu mới hơn)' ELSE '' END,
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
    'asset_restored', v_restored,
    'message', CASE
      WHEN v_has_newer THEN 'Đã hủy phiếu. GCN không bị thay đổi vì đã có phiếu mới hơn tác động lên GCN này.'
      WHEN v_restored THEN 'Đã hủy phiếu và hoàn trả trạng thái tài sản thành công.'
      ELSE 'Đã hủy phiếu.'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_transaction_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_transaction_item(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK: chạy lại định nghĩa cũ đã lưu từ pg_get_functiondef (3 cột mới có thể giữ nguyên, không ảnh hưởng).