-- 0087_bulk_reissue_requests.sql
-- Tạo HÀNG LOẠT hồ sơ CẤP ĐỔI (request_type='cap_doi') từ Excel: mỗi dòng = 1 sổ cũ -> 1 hồ sơ chờ duyệt.
-- KHÔNG tạo GCN mới và KHÔNG đổi sổ cũ: việc đó chỉ xảy ra khi duyệt bằng approve_asset_declaration_request(s)(_bulk) (0082).
-- Quy tắc từng dòng (lỗi độc lập giữa các dòng): khớp ĐỒNG THỜI mã tài sản + mã pháp lý của sổ cũ; sổ cũ phải còn hiệu lực,
-- đã XUẤT KHO (checked_out, không lưu kho), chưa có hồ sơ chờ duyệt khác; số GCN mới bắt buộc, không lặp trong file;
-- trùng số GCN đang có trong hệ thống => bắt buộc duplicate_ack_reason (>=10 ký tự). Thông tin không nhập thì kế thừa từ sổ cũ.
-- Quyền: admin/super_admin/btc_manager, quản lý kho (chỉ sổ cũ thuộc kho mình). p_apply=false: xem trước, không ghi gì.
-- Rollback: DROP FUNCTION public.create_reissue_requests_bulk(jsonb, text, boolean); DROP INDEX public.uq_adr_pending_reissue_per_old_asset;
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_adr_pending_reissue_per_old_asset
  ON public.asset_declaration_requests (old_asset_id)
  WHERE status = 'pending' AND request_type = 'cap_doi';

CREATE OR REPLACE FUNCTION public.create_reissue_requests_bulk(
  p_rows jsonb,
  p_reason text DEFAULT NULL,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (r_row integer, r_old_asset_code text, r_result text, r_message text, r_request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_managed  uuid[];
  v_reason   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row      jsonb;
  v_i        integer := 0;
  v_code     text;
  v_lot      text;
  v_old      public.assets%ROWTYPE;
  v_newcert  text;
  v_seen     text[] := ARRAY[]::text[];
  v_warn     text[];
  v_ack      text;
  v_hit      record;
  v_area     numeric;
  v_regdate  date;
  v_termdate date;
  v_termtype text;
  v_scan     text;
  v_note     text;
  v_f_land   text;
  v_f_map    text;
  v_f_reg    text;
  v_f_purp   text;
  v_req_id   uuid;
  v_scan_re1 constant text := '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)';
  v_scan_re2 constant text := '^[A-Za-z0-9_./-]+$';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, managed_warehouse_ids INTO v_role, v_managed
  FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo hồ sơ cấp đổi hàng loạt.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Danh sách dòng phải là mảng từ 1 đến 500 dòng mỗi lần gọi.' USING ERRCODE = '22023';
  END IF;
  IF p_apply AND (v_reason IS NULL OR char_length(v_reason) < 10) THEN
    RAISE EXCEPTION 'Cần nhập lý do cấp đổi (tối thiểu 10 ký tự) để tạo hồ sơ.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_i := v_i + 1;
    r_row := v_i;
    r_old_asset_code := NULL;
    r_result := 'error';
    r_message := NULL;
    r_request_id := NULL;
    v_warn := ARRAY[]::text[];

    BEGIN
      IF jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Dòng không hợp lệ.' USING ERRCODE = '22023';
      END IF;
      v_code := upper(btrim(COALESCE(v_row->>'old_asset_code', '')));
      r_old_asset_code := NULLIF(v_code, '');
      v_lot := lower(btrim(COALESCE(v_row->>'legal_lot_code', '')));
      v_newcert := btrim(COALESCE(v_row->>'certificate_no', ''));

      IF v_code = '' OR v_lot = '' THEN
        RAISE EXCEPTION 'Thiếu mã tài sản sổ cũ hoặc mã pháp lý (mã lô).' USING ERRCODE = '22023';
      END IF;
      IF v_newcert = '' THEN
        RAISE EXCEPTION 'Thiếu số GCN mới (certificate_no).' USING ERRCODE = '22023';
      END IF;
      IF v_code = ANY (v_seen) THEN
        RAISE EXCEPTION 'Mã tài sản sổ cũ % bị lặp trong file.', v_code USING ERRCODE = '22023';
      END IF;
      v_seen := array_append(v_seen, v_code);
      IF 'c:' || lower(v_newcert) = ANY (v_seen) THEN
        RAISE EXCEPTION 'Số GCN mới % bị lặp trong file.', v_newcert USING ERRCODE = '22023';
      END IF;
      v_seen := array_append(v_seen, 'c:' || lower(v_newcert));

      SELECT * INTO v_old FROM public.assets a WHERE upper(a.asset_code) = v_code FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy GCN cũ có mã tài sản %.', v_code USING ERRCODE = 'P0002';
      END IF;
      IF NULLIF(btrim(COALESCE(v_old.legal_lot_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'GCN cũ chưa có mã pháp lý trên hệ thống; cần bổ sung trước khi cấp đổi.' USING ERRCODE = '22023';
      END IF;
      IF lower(btrim(v_old.legal_lot_code)) <> v_lot THEN
        RAISE EXCEPTION 'Mã pháp lý không khớp với GCN cũ (hệ thống: %).', v_old.legal_lot_code USING ERRCODE = '22023';
      END IF;
      IF v_role = 'warehouse_manager'
         AND (v_old.warehouse_id IS NULL OR NOT (v_old.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[])))) THEN
        RAISE EXCEPTION 'GCN này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
      END IF;
      IF v_old.lifecycle_status IS DISTINCT FROM 'active' OR v_old.invalidation_type IS DISTINCT FROM 'NONE' THEN
        RAISE EXCEPTION 'GCN cũ đã vô hiệu hoặc đã tách/đổi, không thể cấp đổi tiếp.' USING ERRCODE = '22023';
      END IF;
      IF v_old.is_in_warehouse = true OR v_old.custody_status IS DISTINCT FROM 'checked_out' THEN
        RAISE EXCEPTION 'GCN cũ đang LƯU KHO hoặc chưa xuất kho (trạng thái: %). Lập và duyệt phiếu xuất kho GCN cũ trước (lý do "thu hồi"), rồi tạo hồ sơ cấp đổi.', COALESCE(v_old.custody_status, 'không rõ') USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.asset_declaration_requests r
                 WHERE r.old_asset_id = v_old.id AND r.request_type = 'cap_doi' AND r.status = 'pending') THEN
        RAISE EXCEPTION 'GCN cũ này đã có hồ sơ cấp đổi đang chờ duyệt.' USING ERRCODE = '23505';
      END IF;

      -- Số GCN mới trùng GCN đang có trong hệ thống => bắt buộc xác nhận kèm lý do
      v_ack := NULLIF(btrim(COALESCE(v_row->>'duplicate_ack_reason', '')), '');
      SELECT * INTO v_hit FROM public._find_certificate_duplicate(v_newcert, v_old.project_id, v_old.id);
      IF FOUND THEN
        IF v_ack IS NULL THEN
          RAISE EXCEPTION 'DUPLICATE_UNCONFIRMED: Số GCN mới đã tồn tại trong hệ thống. Cần điền duplicate_ack_reason (tối thiểu 10 ký tự) nếu đây là trường hợp trùng thật.' USING ERRCODE = '22023';
        END IF;
        IF char_length(v_ack) < 10 THEN
          RAISE EXCEPTION 'Lý do xác nhận trùng số GCN cần tối thiểu 10 ký tự.' USING ERRCODE = '22023';
        END IF;
        v_warn := array_append(v_warn, 'Số GCN mới trùng với GCN khác (đã xác nhận)');
      ELSE
        v_ack := NULL;
      END IF;

      -- Dữ liệu sổ mới: nhập thì dùng, không nhập thì kế thừa sổ cũ
      v_area := public._bu_num(v_row->>'area', 'area');
      IF v_area IS NOT NULL AND v_area <= 0 THEN
        RAISE EXCEPTION 'Diện tích phải lớn hơn 0.' USING ERRCODE = '22023';
      END IF;
      IF v_area IS NULL THEN
        v_area := v_old.area;
      ELSIF v_old.area IS NOT NULL AND v_old.area > 0 AND abs(v_area - v_old.area) / v_old.area > 0.2 THEN
        v_warn := array_append(v_warn, 'Diện tích mới lệch hơn 20% so với sổ cũ');
      END IF;
      v_regdate  := public._bu_date(v_row->>'registry_date', 'registry_date');
      v_termdate := public._bu_date(v_row->>'usage_term_date', 'usage_term_date');
      v_termtype := NULLIF(btrim(COALESCE(v_row->>'usage_term_type', '')), '');
      IF v_termtype IS NOT NULL AND v_termtype NOT IN ('fixed_date', 'long_term') THEN
        RAISE EXCEPTION 'usage_term_type chỉ nhận fixed_date hoặc long_term.' USING ERRCODE = '22023';
      END IF;
      IF v_termtype IS NULL THEN
        v_termtype := v_old.usage_term_type;
        v_termdate := COALESCE(v_termdate, v_old.usage_term_date);
      ELSIF v_termtype = 'fixed_date' AND v_termdate IS NULL THEN
        RAISE EXCEPTION 'Thời hạn sử dụng cố định cần có usage_term_date.' USING ERRCODE = '22023';
      ELSIF v_termtype = 'long_term' THEN
        v_termdate := NULL;
      END IF;
      v_scan := NULLIF(btrim(COALESCE(v_row->>'scan_file_url', '')), '');
      IF v_scan IS NOT NULL AND NOT (v_scan ~* v_scan_re1 OR v_scan ~ v_scan_re2) THEN
        RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
      END IF;
      v_f_land := COALESCE(NULLIF(btrim(COALESCE(v_row->>'land_lot_no', '')), ''), v_old.land_lot_no);
      v_f_map  := COALESCE(NULLIF(btrim(COALESCE(v_row->>'map_sheet_no', '')), ''), v_old.map_sheet_no);
      v_f_reg  := COALESCE(NULLIF(btrim(COALESCE(v_row->>'registry_no', '')), ''), v_old.registry_no);
      v_f_purp := COALESCE(NULLIF(btrim(COALESCE(v_row->>'usage_purpose', '')), ''), v_old.usage_purpose);
      IF v_old.mortgage_status = 'mortgaged' THEN
        v_warn := array_append(v_warn, 'GCN cũ đang thế chấp: thông tin thế chấp được kế thừa sang hồ sơ mới');
      END IF;

      IF p_apply THEN
        v_note := NULLIF(btrim(COALESCE(v_row->>'notes', '')), '');
        v_note := COALESCE(v_note || ' | ', '') || '[Cấp đổi hàng loạt] ' || v_reason;
        INSERT INTO public.asset_declaration_requests (
          request_type, status, old_asset_id, relationship_type, invalidation_type, requester_id,
          collateral_type, asset_type, project_id, warehouse_id, current_owner_entity_id, certificate_group,
          legal_lot_code, business_project_name, business_plot_code, managing_unit,
          certificate_no, registry_no, registry_date, land_lot_no, map_sheet_no, area,
          usage_purpose, usage_term_type, usage_term_date, scan_file_url, notes,
          mortgage_status, mortgage_bank, mortgage_unit, mortgage_valuation, collateral_ratio, collateral_value,
          mortgage_expected_release_date,
          duplicate_ack_reason, duplicate_ack_by, duplicate_ack_at
        ) VALUES (
          'cap_doi', 'pending', v_old.id, 'RENEW', 'NONE', v_uid,
          v_old.collateral_type, v_old.asset_type, v_old.project_id, v_old.warehouse_id, v_old.current_owner_entity_id, v_old.certificate_group,
          v_old.legal_lot_code, v_old.business_project_name, v_old.business_plot_code, v_old.managing_unit,
          v_newcert, v_f_reg, v_regdate, v_f_land, v_f_map, v_area,
          v_f_purp, v_termtype, v_termdate, COALESCE(v_scan, v_old.scan_file_url), v_note,
          COALESCE(v_old.mortgage_status, 'none'), v_old.mortgage_bank, v_old.mortgage_unit, v_old.mortgage_valuation, v_old.collateral_ratio, v_old.collateral_value,
          v_old.mortgage_expected_release_date,
          v_ack, CASE WHEN v_ack IS NOT NULL THEN v_uid END, CASE WHEN v_ack IS NOT NULL THEN now() END
        )
        RETURNING id INTO v_req_id;
        r_request_id := v_req_id;
        r_result := 'created';
      ELSE
        r_result := 'ok';
      END IF;
      r_message := CASE WHEN cardinality(v_warn) > 0 THEN 'Cảnh báo: ' || array_to_string(v_warn, '; ')
                        ELSE 'Hợp lệ, sẵn sàng tạo hồ sơ cấp đổi.' END;
    EXCEPTION WHEN OTHERS THEN
      r_result := 'error';
      r_message := SQLERRM;
      r_request_id := NULL;
    END;

    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_reissue_requests_bulk(jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reissue_requests_bulk(jsonb, text, boolean) TO authenticated;

COMMIT;