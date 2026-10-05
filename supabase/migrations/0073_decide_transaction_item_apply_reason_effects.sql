-- 0073_decide_transaction_item_apply_reason_effects.sql
-- Phạm vi: CHỈ viết lại public.decide_transaction_item(uuid,text,text,jsonb,text), xây trên 0072.
-- Vấn đề: từ 0016 loại phiếu chỉ còn checkout/checkin, các nhánh mortgage/sale_update/split KHÔNG BAO GIỜ chạy.
--   => duyệt phiếu thế chấp / xuất bán / giải chấp chỉ đổi custody_status, GCN không phản ánh nghiệp vụ.
--   => RPC đọc khóa borrower/expected_return_date trong khi client gửi department/returnDate.
--   => RPC ghi đè assets.notes bằng p_details->'notes' (client gửi "notes":"") => xóa sạch ghi chú GCN.
-- Sửa: áp hiệu ứng THEO LÝ DO (reason) ngay trong RPC, nguyên tử với việc duyệt.
--   mượn / thu hồi / khác (xuất): checked_out, holder = department, hạn trả = returnDate (chỉ 'mượn'), borrow_purpose = reason
--   thế chấp: như trên + mortgage_status='mortgaged', bank, mortgage_unit, valuation, collateral_ratio, expected_release_date
--   chuyển nhượng: như mượn; nếu concurrentMortgage=true thì thêm thế chấp
--   xuất bán / sang tên cho khách: như mượn + sale_status = saleStatus (mặc định 'sold')
--   tách sổ / đổi sổ: TẠM CHẶN duyệt (báo lỗi) cho đến khi có migration tách sổ an toàn (Prompt 7). Từ chối vẫn được.
--   trả / nhập sau bán / cấp mới / khác (nhập): in_stock, xóa holder + hạn trả + borrow_purpose, kho = targetWarehouseId
--   giải chấp: như nhập kho + xóa thông tin thế chấp (GCN phải đang thế chấp)
--   checkin kèm updateOwnership: gọi transfer_asset_ownership trong cùng giao dịch
-- KHÔNG ghi đè assets.notes nữa. Giữ nguyên các chốt chặn 0072 (vai trò, phạm vi kho, pending, lifecycle, FOR UPDATE).
-- Chưa làm (việc riêng): luân chuyển giữa kho (in_transit + phiếu bước 2), tạo sổ con khi tách sổ, sinh mã phiếu (Q7).
BEGIN;

CREATE OR REPLACE FUNCTION public.decide_transaction_item(
  p_item_id uuid,
  p_status text,
  p_notes text,
  p_details jsonb,
  p_voucher_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         text;
  v_managed      uuid[];
  v_item         record;
  v_asset        record;
  v_asset_id     uuid;
  v_type         text;
  v_reason       text;
  v_d            jsonb;
  v_confirmed    text;
  v_target_wh    uuid;
  v_in_scope     boolean := false;
  v_sale         text;
  v_is_mortgage  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  SELECT role, managed_warehouse_ids
  INTO v_role, v_managed
  FROM public.profiles
  WHERE id = v_uid AND status = 'active';

  IF v_role IS NULL OR NOT public.has_permission('request.approve') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt phiếu giao dịch.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Trạng thái quyết định không hợp lệ (chỉ nhận approved hoặc rejected).' USING ERRCODE = '22023';
  END IF;

  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu chi tiết (details) phải là đối tượng JSON.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item
  FROM public.transaction_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu giao dịch.' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu này không còn ở trạng thái chờ duyệt (hiện là: %).', v_item.status USING ERRCODE = '22023';
  END IF;

  v_type := v_item.type;
  v_d := COALESCE(p_details, v_item.details, '{}'::jsonb);
  v_reason := COALESCE(NULLIF(v_item.reason, ''), NULLIF(v_d->>'reason', ''), NULLIF(v_item.details->>'reason', ''));

  -- GCN thực sự bị tác động: GCN đã được người duyệt xác nhận (nếu có), ngược lại GCN trên phiếu
  v_confirmed := COALESCE(NULLIF(v_d->>'confirmed_asset_id', ''), NULLIF(v_item.details->>'confirmed_asset_id', ''));
  IF v_confirmed IS NOT NULL THEN
    BEGIN
      v_asset_id := v_confirmed::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'confirmed_asset_id không phải UUID hợp lệ.' USING ERRCODE = '22023';
    END;
  ELSE
    v_asset_id := v_item.asset_id;
  END IF;

  SELECT * INTO v_asset
  FROM public.assets
  WHERE id = v_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy GCN gắn với phiếu.' USING ERRCODE = 'P0002';
  END IF;

  -- Kho đích (nếu có) dùng cho nhập kho
  BEGIN
    v_target_wh := COALESCE(NULLIF(v_d->>'targetWarehouseId', ''), NULLIF(v_d->>'warehouse_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Mã kho đích không phải UUID hợp lệ.' USING ERRCODE = '22023';
  END;

  -- Phạm vi kho
  IF v_role IN ('super_admin', 'admin', 'btc_manager') THEN
    v_in_scope := true;
  ELSIF v_role = 'warehouse_manager' THEN
    v_in_scope := v_asset.warehouse_id IS NOT NULL
                  AND v_asset.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[]));
    IF NOT v_in_scope AND v_type = 'checkin' THEN
      v_in_scope := v_target_wh IS NOT NULL
                    AND v_target_wh = ANY (COALESCE(v_managed, ARRAY[]::uuid[]));
    END IF;
  END IF;

  IF NOT v_in_scope THEN
    RAISE EXCEPTION 'GCN này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
  END IF;

  -- Kiểm tra trước khi ghi bất cứ thứ gì (chỉ khi duyệt)
  IF p_status = 'approved' THEN
    IF v_asset.lifecycle_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'GCN % không còn hiệu lực (trạng thái: %), không thể duyệt phiếu.',
        v_asset.certificate_no, v_asset.lifecycle_status USING ERRCODE = '22023';
    END IF;

    IF v_type = 'checkout' AND v_asset.custody_status NOT IN ('in_stock', 'in_transit') THEN
      RAISE EXCEPTION 'GCN % đang ở trạng thái % nên không thể xuất.',
        v_asset.certificate_no, v_asset.custody_status USING ERRCODE = '22023';
    END IF;

    IF v_type = 'checkin' AND v_asset.custody_status NOT IN ('checked_out', 'in_transit') THEN
      RAISE EXCEPTION 'GCN % đang ở trạng thái % nên không thể nhập kho.',
        v_asset.certificate_no, v_asset.custody_status USING ERRCODE = '22023';
    END IF;

    IF v_type = 'checkout' AND v_reason IN ('tách sổ', 'đổi sổ') THEN
      RAISE EXCEPTION 'Duyệt phiếu "%" tạm thời chưa được hỗ trợ trên hệ thống (đang hoàn thiện logic tách sổ an toàn). Vui lòng liên hệ quản trị.', v_reason
        USING ERRCODE = '0A000';
    END IF;

    v_is_mortgage := v_type = 'checkout' AND (
      v_reason = 'thế chấp'
      OR (v_reason = 'chuyển nhượng' AND lower(COALESCE(v_d->>'concurrentMortgage', 'false')) IN ('true', 't', '1'))
    );

    IF v_is_mortgage AND v_asset.mortgage_status = 'mortgaged' THEN
      RAISE EXCEPTION 'GCN % đang thế chấp, không thể ghi thế chấp thêm.', v_asset.certificate_no USING ERRCODE = '22023';
    END IF;

    IF v_type = 'checkin' AND v_reason = 'giải chấp' AND v_asset.mortgage_status IS DISTINCT FROM 'mortgaged' THEN
      RAISE EXCEPTION 'GCN % không ở trạng thái thế chấp nên không thể giải chấp.', v_asset.certificate_no USING ERRCODE = '22023';
    END IF;

    IF v_type = 'checkout' AND v_reason IN ('xuất bán', 'sang tên cho khách') THEN
      v_sale := COALESCE(NULLIF(v_d->>'saleStatus', ''), 'sold');
      IF v_sale NOT IN ('not_ready', 'ready_for_sale', 'sold') THEN
        RAISE EXCEPTION 'Trạng thái bán "%" không hợp lệ.', v_sale USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  -- Ghi quyết định lên phiếu
  UPDATE public.transaction_items
  SET
    status = p_status,
    decision_notes = p_notes,
    details = COALESCE(p_details, details),
    voucher_code = COALESCE(p_voucher_code, voucher_code),
    decided_by = v_uid,
    decided_at = now()
  WHERE id = p_item_id;

  IF p_status <> 'approved' THEN
    RETURN;
  END IF;

  -- Áp hiệu ứng lên GCN
  IF v_type = 'checkout' THEN
    UPDATE public.assets
    SET
      custody_status = 'checked_out',
      current_holder_dept = COALESCE(NULLIF(v_d->>'department', ''), NULLIF(v_d->>'borrower', '')),
      expected_return_date = CASE
        WHEN v_reason = 'mượn' THEN COALESCE(NULLIF(v_d->>'returnDate', ''), NULLIF(v_d->>'expected_return_date', ''))::date
        ELSE NULL
      END,
      borrow_purpose = COALESCE(v_reason, NULLIF(v_d->>'borrow_purpose', '')),
      updated_at = now()
    WHERE id = v_asset_id;

    IF v_is_mortgage THEN
      UPDATE public.assets
      SET
        mortgage_status = 'mortgaged',
        mortgage_bank = NULLIF(v_d->>'bank', ''),
        mortgage_unit = NULLIF(v_d->>'mortgage_unit', ''),
        mortgage_valuation = NULLIF(v_d->>'valuation', '')::numeric,
        collateral_ratio = NULLIF(v_d->>'collateral_ratio', '')::numeric,
        mortgage_expected_release_date = NULLIF(v_d->>'expected_release_date', '')::date,
        updated_at = now()
      WHERE id = v_asset_id;
    END IF;

    IF v_reason IN ('xuất bán', 'sang tên cho khách') THEN
      UPDATE public.assets
      SET sale_status = v_sale, updated_at = now()
      WHERE id = v_asset_id;
    END IF;

  ELSIF v_type = 'checkin' THEN
    UPDATE public.assets
    SET
      custody_status = 'in_stock',
      current_holder_dept = NULL,
      expected_return_date = NULL,
      borrow_purpose = NULL,
      warehouse_id = COALESCE(v_target_wh, warehouse_id),
      updated_at = now()
    WHERE id = v_asset_id;

    IF v_reason = 'giải chấp' THEN
      UPDATE public.assets
      SET
        mortgage_status = 'none',
        mortgage_bank = NULL,
        mortgage_unit = NULL,
        mortgage_valuation = NULL,
        collateral_ratio = NULL,
        collateral_value = NULL,
        mortgage_expected_release_date = NULL,
        updated_at = now()
      WHERE id = v_asset_id;
    END IF;

    IF lower(COALESCE(v_d->>'updateOwnership', 'false')) IN ('true', 't', '1')
       AND NULLIF(v_d->>'newOwnerEntityId', '') IS NOT NULL THEN
      PERFORM public.transfer_asset_ownership(
        v_asset_id,
        (v_d->>'newOwnerEntityId')::uuid,
        COALESCE(NULLIF(v_d->>'newOwnerRole', ''), 'cdt'),
        'Đồng thời nhập kho: ' || COALESCE(v_reason, ''),
        v_uid
      );
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_transaction_item(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_transaction_item(uuid, text, text, jsonb, text) TO authenticated;

COMMIT;

-- ROLLBACK: chạy lại nội dung hàm trong 0072_harden_decide_transaction_item.sql