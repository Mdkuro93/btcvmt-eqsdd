-- 0072_harden_decide_transaction_item.sql
-- Phạm vi: CHỈ viết lại public.decide_transaction_item(uuid,text,text,jsonb,text).
-- Giữ nguyên chữ ký và nhánh nghiệp vụ checkout/checkin/mortgage/sale_update/split của bản đang chạy trên DB.
-- Bổ sung chốt chặn:
--   1. SET search_path = public, pg_temp (hàm SECURITY DEFINER trước đây thiếu).
--   2. Phải đăng nhập, hồ sơ active, có quyền request.approve (khóa dòng NULL như lỗi 0063).
--   3. p_status chỉ nhận 'approved' | 'rejected'; p_details phải là object JSON (hoặc NULL).
--   4. Khóa dòng phiếu (FOR UPDATE) và CHỈ xử lý phiếu đang 'pending' (chặn duyệt 2 lần / duyệt phiếu đã hủy).
--   5. GCN thực sự được cập nhật = confirmed_asset_id (nếu người duyệt đã xác nhận GCN khác) ngược lại asset_id của phiếu.
--      Khóa dòng GCN (FOR UPDATE).
--   6. Phạm vi kho: admin/super_admin/btc_manager toàn quyền; warehouse_manager chỉ GCN thuộc kho mình quản lý
--      (riêng nhập kho 'checkin' được phép nếu kho đích thuộc kho mình quản lý); vai trò khác bị chặn.
--   7. Khi DUYỆT: GCN phải ở lifecycle_status='active'; checkout cần custody in_stock/in_transit; checkin cần
--      checked_out/in_transit; mortgage không áp lên GCN đã thế chấp; split: tổng diện tích sổ con <= diện tích gốc.
-- Không đổi: ghi assets.notes từ p_details->'notes', sinh mã phiếu (việc của Q7), nhật ký (client ghi).
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
  v_confirmed    text;
  v_target_wh    uuid;
  v_in_scope     boolean := false;
  v_split_total  numeric;
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

  -- Khóa dòng phiếu, chỉ xử lý phiếu đang chờ duyệt
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

  -- GCN thực sự bị tác động: GCN đã được người duyệt xác nhận (nếu có), ngược lại GCN trên phiếu
  v_confirmed := COALESCE(p_details->>'confirmed_asset_id', v_item.details->>'confirmed_asset_id');
  IF v_confirmed IS NOT NULL AND v_confirmed <> '' THEN
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

  -- Phạm vi kho
  IF v_role IN ('super_admin', 'admin', 'btc_manager') THEN
    v_in_scope := true;
  ELSIF v_role = 'warehouse_manager' THEN
    v_in_scope := v_asset.warehouse_id IS NOT NULL
                  AND v_asset.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[]));
    IF NOT v_in_scope AND v_type = 'checkin' THEN
      BEGIN
        v_target_wh := COALESCE(p_details->>'warehouse_id', p_details->>'targetWarehouseId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Mã kho đích không phải UUID hợp lệ.' USING ERRCODE = '22023';
      END;
      v_in_scope := v_target_wh IS NOT NULL
                    AND v_target_wh = ANY (COALESCE(v_managed, ARRAY[]::uuid[]));
    END IF;
  END IF;

  IF NOT v_in_scope THEN
    RAISE EXCEPTION 'GCN này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
  END IF;

  -- Cập nhật quyết định trên phiếu
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

  -- ===== Từ đây: duyệt, kiểm tra trạng thái GCN rồi mới áp thay đổi =====
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

  IF v_type = 'mortgage' AND v_asset.mortgage_status = 'mortgaged' THEN
    RAISE EXCEPTION 'GCN % đang thế chấp, không thể ghi thế chấp thêm.', v_asset.certificate_no USING ERRCODE = '22023';
  END IF;

  IF p_details ? 'notes' THEN
    UPDATE public.assets SET notes = p_details->>'notes' WHERE id = v_asset_id;
  END IF;

  IF v_type = 'checkout' THEN
    UPDATE public.assets
    SET
      custody_status = 'checked_out',
      current_holder_dept = p_details->>'borrower',
      expected_return_date = (p_details->>'expected_return_date')::date,
      borrow_purpose = p_details->>'borrow_purpose',
      updated_at = now()
    WHERE id = v_asset_id;

  ELSIF v_type = 'checkin' THEN
    UPDATE public.assets
    SET
      custody_status = 'in_stock',
      current_holder_dept = NULL,
      warehouse_id = COALESCE((p_details->>'warehouse_id')::uuid, warehouse_id),
      updated_at = now()
    WHERE id = v_asset_id;

  ELSIF v_type = 'mortgage' THEN
    UPDATE public.assets
    SET
      mortgage_status = 'mortgaged',
      mortgage_bank = p_details->>'bank',
      mortgage_unit = p_details->>'mortgage_unit',
      collateral_ratio = (p_details->>'collateral_ratio')::numeric,
      collateral_value = (p_details->>'collateral_value')::numeric,
      mortgage_valuation = (p_details->>'valuation')::numeric,
      mortgage_expected_release_date = (p_details->>'expected_release_date')::date,
      updated_at = now()
    WHERE id = v_asset_id;

  ELSIF v_type = 'sale_update' THEN
    UPDATE public.assets
    SET
      sale_status = p_details->>'sale_status',
      usage_term_type = COALESCE(p_details->>'usage_term_type', usage_term_type),
      updated_at = now()
    WHERE id = v_asset_id;

  ELSIF v_type = 'split' THEN
    IF p_details ? 'splitChildren' AND jsonb_typeof(p_details->'splitChildren') = 'array' THEN
      SELECT COALESCE(SUM((c->>'area')::numeric), 0)
      INTO v_split_total
      FROM jsonb_array_elements(p_details->'splitChildren') AS c
      WHERE c->>'certificate_no' IS NOT NULL;

      IF v_asset.area IS NOT NULL AND v_split_total > v_asset.area THEN
        RAISE EXCEPTION 'Tổng diện tích các sổ con (%) vượt diện tích GCN gốc (%).', v_split_total, v_asset.area USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.assets
    SET
      lifecycle_status = 'invalidated',
      custody_status = 'in_stock',
      updated_at = now()
    WHERE id = v_asset_id;

    IF p_details ? 'splitChildren' AND jsonb_typeof(p_details->'splitChildren') = 'array' THEN
      INSERT INTO public.assets (
        certificate_no, project_id, legal_lot_code, area, current_owner_entity_id, warehouse_id, parent_asset_id,
        custody_status, lifecycle_status, sale_status, mortgage_status,
        map_sheet_no, land_lot_no, usage_purpose, usage_term_type, usage_term_date,
        asset_type, collateral_type, business_plot_code, certificate_group, registry_no, registry_date, managing_unit
      )
      SELECT
        c->>'certificate_no',
        v_asset.project_id,
        COALESCE(c->>'legal_lot_code', v_asset.legal_lot_code),
        (c->>'area')::numeric,
        v_asset.current_owner_entity_id,
        v_asset.warehouse_id,
        v_asset.id,
        'in_stock',
        'active',
        'not_ready',
        'none',
        v_asset.map_sheet_no,
        c->>'land_lot_no',
        v_asset.usage_purpose,
        v_asset.usage_term_type,
        v_asset.usage_term_date,
        v_asset.asset_type,
        v_asset.collateral_type,
        v_asset.business_plot_code,
        'so_nho',
        v_asset.registry_no,
        v_asset.registry_date,
        v_asset.managing_unit
      FROM jsonb_array_elements(p_details->'splitChildren') AS c
      WHERE c->>'certificate_no' IS NOT NULL;
    END IF;
  END IF;
END;
$function$;

-- Giữ quyền như 0061: chỉ người đã đăng nhập gọi được
REVOKE ALL ON FUNCTION public.decide_transaction_item(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_transaction_item(uuid, text, text, jsonb, text) TO authenticated;

COMMIT;

-- ROLLBACK: chạy lại định nghĩa cũ (đã lưu từ pg_get_functiondef trước khi chạy 0072).