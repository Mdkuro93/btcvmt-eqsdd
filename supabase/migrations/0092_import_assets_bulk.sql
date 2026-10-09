-- 0092_import_assets_bulk.sql
-- NHẬP MỚI GCN HÀNG LOẠT từ Excel (thay trang Import cũ và modal nhập Excel). Xem trước + áp dụng, lỗi độc lập từng dòng, tối đa 500 dòng/lần gọi.
-- Quy tắc từng dòng:
--  * Bắt buộc: certificate_no (số GCN), project_name (tên dự án, khớp CHÍNH XÁC 1 dự án), warehouse_name (kho lưu trữ, khớp 1 kho),
--    legal_lot_code (mã pháp lý/mã lô), area (>0), certificate_group (so_lon|so_nho), asset_type.
--  * Phạm vi: admin/super_admin/btc_manager nhập vào mọi kho; warehouse_manager CHỈ nhập vào kho mình quản lý.
--  * Số GCN trùng GCN đang có HOẶC trùng trong cùng file => bắt buộc duplicate_ack_reason (>=10 ký tự); máy chủ ghi người/thời điểm xác nhận (trigger 0080).
--  * Mã tài sản cấp bằng bộ đếm (không bịa số GCN, không cấp ở trình duyệt). Tiền tố: <vùng của kho: VMB|VMT|VMN, mặc định VMT>_<province_code mặc định DNG>_<collateral_type mặc định BDS>_.
--  * Thế chấp: nếu có BẤT KỲ cột thế chấp nào thì bắt buộc mortgage_bank. GCN đã thế chấp được ghi nhận ĐÃ XUẤT THẾ CHẤP (custody_status='checked_out',
--    mortgage_status='mortgaged', người giữ = ngân hàng, KHÔNG ở kho), cùng trạng thái với GCN được thế chấp bằng phiếu; giải chấp sau này bằng phiếu nhập 'giải chấp'.
--  * generate_receipt = true: sinh phiếu nhập kho đã duyệt (reason 'cấp mới', mã PN) cho GCN; false/trống = tồn đầu kỳ (không sinh phiếu).
--    Không áp dụng cho GCN đã thế chấp (đang ở ngân hàng, không nhập kho).
--  * Liên kết lô quy hoạch: trigger sẵn có (0050) tự đánh dấu lô 'đã cấp GCN' theo dự án + mã lô; xem trước cho biết khớp hay không.
--  * Ghi 1 dòng audit_logs tổng cho mỗi lần áp dụng (kèm lý do/nguồn dữ liệu >=10 ký tự).
-- Rollback: DROP FUNCTION public.import_assets_bulk(jsonb, text, boolean);
BEGIN;

CREATE OR REPLACE FUNCTION public.import_assets_bulk(
  p_rows jsonb,
  p_reason text DEFAULT NULL,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (r_row integer, r_certificate_no text, r_result text, r_message text,
               r_asset_id uuid, r_asset_code text, r_voucher text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_managed  uuid[];
  v_name     text;
  v_reason   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row      jsonb;
  v_i        integer := 0;
  v_cert     text;
  v_pname    text;
  v_wname    text;
  v_ids      uuid[];
  v_proj     uuid;
  v_wh       uuid;
  v_whreg    text;
  v_lot      text;
  v_area     numeric;
  v_group    text;
  v_atype    text;
  v_ctype    text;
  v_prov     text;
  v_prefix   text;
  v_company  text;
  v_ent      uuid;
  v_ents     uuid[];
  v_orole    text;
  v_regdate  date;
  v_termtype text;
  v_termdate date;
  v_scan     text;
  v_bank     text;
  v_munit    text;
  v_mval     numeric;
  v_mratio   numeric;
  v_mcoll    numeric;
  v_mrel     date;
  v_mort     boolean;
  v_gen      boolean;
  v_gen_txt  text;
  v_ack      text;
  v_dup      boolean;
  v_hit      record;
  v_warn     text[];
  v_seen     text[] := ARRAY[]::text[];
  v_seen_c   text[] := ARRAY[]::text[];
  v_code     text;
  v_aid      uuid;
  v_pn       text;
  v_tx_map   jsonb := '{}'::jsonb;
  v_tx       uuid;
  v_new_tx   uuid;
  v_created  integer := 0;
  v_receipts integer := 0;
  v_errors   integer := 0;
  v_plots    integer;
  v_plot_ok  integer;
  v_plot_dn  integer;
  v_key      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT pf.role, pf.managed_warehouse_ids, COALESCE(pf.full_name, pf.email) INTO v_role, v_managed, v_name
  FROM public.profiles pf WHERE pf.id = v_uid AND pf.status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền nhập GCN hàng loạt.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Danh sách dòng phải là mảng từ 1 đến 500 dòng mỗi lần gọi.' USING ERRCODE = '22023';
  END IF;
  IF p_apply AND (v_reason IS NULL OR char_length(v_reason) < 10) THEN
    RAISE EXCEPTION 'Cần nhập lý do/nguồn dữ liệu nhập (tối thiểu 10 ký tự) để áp dụng.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_i := v_i + 1;
    r_row := v_i; r_certificate_no := NULL; r_result := 'error'; r_message := NULL;
    r_asset_id := NULL; r_asset_code := NULL; r_voucher := NULL;
    v_warn := ARRAY[]::text[];

    BEGIN
      IF jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Dòng không hợp lệ.' USING ERRCODE = '22023';
      END IF;
      v_cert  := btrim(COALESCE(v_row->>'certificate_no', ''));
      r_certificate_no := NULLIF(v_cert, '');
      v_pname := btrim(COALESCE(v_row->>'project_name', ''));
      v_wname := btrim(COALESCE(v_row->>'warehouse_name', ''));
      v_lot   := btrim(COALESCE(v_row->>'legal_lot_code', ''));
      v_atype := btrim(COALESCE(v_row->>'asset_type', ''));
      v_group := lower(btrim(COALESCE(v_row->>'certificate_group', '')));

      IF v_cert = '' THEN RAISE EXCEPTION 'Thiếu số GCN (certificate_no).' USING ERRCODE = '22023'; END IF;
      IF v_pname = '' THEN RAISE EXCEPTION 'Thiếu tên dự án (project_name).' USING ERRCODE = '22023'; END IF;
      IF v_wname = '' THEN RAISE EXCEPTION 'Thiếu kho lưu trữ (warehouse_name).' USING ERRCODE = '22023'; END IF;
      IF v_lot = '' THEN RAISE EXCEPTION 'Thiếu mã pháp lý/mã lô (legal_lot_code).' USING ERRCODE = '22023'; END IF;
      IF v_atype = '' THEN RAISE EXCEPTION 'Thiếu loại tài sản (asset_type).' USING ERRCODE = '22023'; END IF;
      IF v_group NOT IN ('so_lon', 'so_nho') THEN
        RAISE EXCEPTION 'certificate_group chỉ nhận so_lon (Sổ lớn) hoặc so_nho (Sổ nhỏ/Sổ con).' USING ERRCODE = '22023';
      END IF;
      IF char_length(v_atype) > 200 OR char_length(v_cert) > 200 OR char_length(v_lot) > 200 THEN
        RAISE EXCEPTION 'Giá trị quá dài (tối đa 200 ký tự cho số GCN, mã lô, loại tài sản).' USING ERRCODE = '22023';
      END IF;
      v_area := public._bu_num(v_row->>'area', 'area');
      IF v_area IS NULL OR v_area <= 0 THEN
        RAISE EXCEPTION 'Diện tích phải lớn hơn 0.' USING ERRCODE = '22023';
      END IF;

      -- Dự án (khớp đúng 1)
      SELECT array_agg(p.id) INTO v_ids FROM public.projects p
      WHERE regexp_replace(lower(btrim(p.name)), '\s+', ' ', 'g') = regexp_replace(lower(v_pname), '\s+', ' ', 'g');
      IF v_ids IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy dự án "%".', v_pname USING ERRCODE = 'P0002';
      ELSIF cardinality(v_ids) > 1 THEN
        RAISE EXCEPTION 'Có % dự án trùng tên "%"; liên hệ quản trị để đổi tên khác nhau.', cardinality(v_ids), v_pname USING ERRCODE = '22023';
      END IF;
      v_proj := v_ids[1];

      -- Kho (khớp đúng 1) + phạm vi
      SELECT array_agg(w.id) INTO v_ids FROM public.warehouses w
      WHERE regexp_replace(lower(btrim(w.name)), '\s+', ' ', 'g') = regexp_replace(lower(v_wname), '\s+', ' ', 'g');
      IF v_ids IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy kho "%".', v_wname USING ERRCODE = 'P0002';
      ELSIF cardinality(v_ids) > 1 THEN
        RAISE EXCEPTION 'Có % kho trùng tên "%"; liên hệ quản trị để đổi tên khác nhau.', cardinality(v_ids), v_wname USING ERRCODE = '22023';
      END IF;
      v_wh := v_ids[1];
      IF v_role = 'warehouse_manager' AND NOT (v_wh = ANY (COALESCE(v_managed, ARRAY[]::uuid[]))) THEN
        RAISE EXCEPTION 'Bạn chỉ được nhập GCN vào kho mình quản lý (kho "%" không thuộc quyền).', v_wname USING ERRCODE = '42501';
      END IF;
      SELECT w.region_code INTO v_whreg FROM public.warehouses w WHERE w.id = v_wh;

      -- Chủ sở hữu (tùy chọn)
      v_company := btrim(COALESCE(v_row->>'company_code', ''));
      v_ent := NULL; v_orole := NULL;
      IF v_company <> '' THEN
        SELECT array_agg(e.id) INTO v_ents FROM public.investor_entities e WHERE lower(btrim(e.company_code)) = lower(v_company);
        IF v_ents IS NULL THEN
          RAISE EXCEPTION 'Không tìm thấy pháp nhân có mã công ty "%".', v_company USING ERRCODE = 'P0002';
        ELSIF cardinality(v_ents) > 1 THEN
          RAISE EXCEPTION 'Mã công ty "%" trùng ở nhiều pháp nhân.', v_company USING ERRCODE = '22023';
        END IF;
        v_ent := v_ents[1];
        v_orole := lower(btrim(COALESCE(v_row->>'owner_role', '')));
        IF v_orole = '' THEN
          v_orole := 'cdt';
          v_warn := array_append(v_warn, 'Chưa ghi phân loại chủ sở hữu, mặc định CĐT');
        ELSIF v_orole NOT IN ('cdt', 'ndt') THEN
          RAISE EXCEPTION 'owner_role chỉ nhận cdt hoặc ndt.' USING ERRCODE = '22023';
        END IF;
      ELSE
        v_warn := array_append(v_warn, 'Chưa có chủ sở hữu (mã công ty)');
      END IF;

      -- Ngày, thời hạn, scan
      v_regdate  := public._bu_date(v_row->>'registry_date', 'registry_date');
      v_termdate := public._bu_date(v_row->>'usage_term_date', 'usage_term_date');
      v_termtype := NULLIF(btrim(COALESCE(v_row->>'usage_term_type', '')), '');
      IF v_termtype IS NOT NULL AND v_termtype NOT IN ('fixed_date', 'long_term') THEN
        RAISE EXCEPTION 'usage_term_type chỉ nhận fixed_date hoặc long_term.' USING ERRCODE = '22023';
      END IF;
      IF v_termtype = 'fixed_date' AND v_termdate IS NULL THEN
        RAISE EXCEPTION 'Thời hạn sử dụng cố định cần có usage_term_date.' USING ERRCODE = '22023';
      END IF;
      IF v_termtype = 'long_term' THEN v_termdate := NULL; END IF;
      v_scan := NULLIF(btrim(COALESCE(v_row->>'scan_file_url', '')), '');
      IF v_scan IS NOT NULL AND NOT (v_scan ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)' OR v_scan ~ '^[A-Za-z0-9_./-]+$') THEN
        RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
      END IF;

      -- Thế chấp
      v_bank  := NULLIF(btrim(COALESCE(v_row->>'mortgage_bank', '')), '');
      v_munit := NULLIF(btrim(COALESCE(v_row->>'mortgage_unit', '')), '');
      v_mval   := public._bu_num(v_row->>'mortgage_valuation', 'mortgage_valuation');
      v_mratio := public._bu_num(v_row->>'collateral_ratio', 'collateral_ratio');
      v_mcoll  := public._bu_num(v_row->>'collateral_value', 'collateral_value');
      v_mrel   := public._bu_date(v_row->>'mortgage_expected_release_date', 'mortgage_expected_release_date');
      v_mort := (v_bank IS NOT NULL OR v_munit IS NOT NULL OR v_mval IS NOT NULL OR v_mratio IS NOT NULL OR v_mcoll IS NOT NULL OR v_mrel IS NOT NULL);
      IF v_mort AND v_bank IS NULL THEN
        RAISE EXCEPTION 'GCN đã thế chấp cần có ngân hàng thế chấp (mortgage_bank).' USING ERRCODE = '22023';
      END IF;
      IF v_mval IS NOT NULL AND v_mval < 0 THEN RAISE EXCEPTION 'Định giá thế chấp không được âm.' USING ERRCODE = '22023'; END IF;
      IF v_mcoll IS NOT NULL AND v_mcoll < 0 THEN RAISE EXCEPTION 'Giá trị bảo đảm không được âm.' USING ERRCODE = '22023'; END IF;
      IF v_mratio IS NOT NULL AND (v_mratio < 0 OR v_mratio > 100) THEN
        RAISE EXCEPTION 'Tỷ lệ bảo đảm phải từ 0 đến 100.' USING ERRCODE = '22023';
      END IF;
      IF v_mort THEN
        v_warn := array_append(v_warn, 'GCN đã thế chấp: ghi nhận ĐÃ XUẤT THẾ CHẤP (đang ở ngân hàng, không ở kho)');
      END IF;

      -- Phiếu nhập kho
      v_gen_txt := lower(btrim(COALESCE(v_row->>'generate_receipt', '')));
      IF v_gen_txt IN ('', 'false', '0', 'không', 'khong', 'no', 'n') THEN
        v_gen := false;
      ELSIF v_gen_txt IN ('true', '1', 'có', 'co', 'yes', 'y') THEN
        v_gen := true;
      ELSE
        RAISE EXCEPTION 'generate_receipt chỉ nhận Có/Không (true/false).' USING ERRCODE = '22023';
      END IF;
      IF v_gen AND v_mort THEN
        RAISE EXCEPTION 'GCN đã thế chấp đang ở ngân hàng, không sinh phiếu nhập kho (phiếu nhập sẽ phát sinh khi giải chấp).' USING ERRCODE = '22023';
      END IF;

      -- Mã tài sản: tiền tố
      v_ctype := upper(btrim(COALESCE(NULLIF(btrim(COALESCE(v_row->>'collateral_type', '')), ''), 'BDS')));
      v_prov  := upper(btrim(COALESCE(NULLIF(btrim(COALESCE(v_row->>'province_code', '')), ''), 'DNG')));
      IF v_ctype !~ '^[A-Z0-9]{2,8}$' OR v_prov !~ '^[A-Z0-9]{2,8}$' THEN
        RAISE EXCEPTION 'collateral_type/province_code chỉ gồm chữ và số, 2-8 ký tự.' USING ERRCODE = '22023';
      END IF;
      v_prefix := CASE WHEN v_whreg IN ('VMB', 'VMT', 'VMN') THEN v_whreg ELSE 'VMT' END || '_' || v_prov || '_' || v_ctype || '_';

      -- Trùng số GCN (đang có trong hệ thống hoặc trong cùng file)
      v_ack := NULLIF(btrim(COALESCE(v_row->>'duplicate_ack_reason', '')), '');
      v_key := lower(v_cert) || '|' || v_proj::text;
      SELECT * INTO v_hit FROM public._find_certificate_duplicate(v_cert, v_proj, NULL);
      v_dup := FOUND OR (v_key = ANY (v_seen_c));
      IF v_dup THEN
        IF v_ack IS NULL THEN
          RAISE EXCEPTION 'DUPLICATE_UNCONFIRMED: Số GCN đã tồn tại (trong hệ thống hoặc lặp trong file). Cần điền duplicate_ack_reason (tối thiểu 10 ký tự) nếu đây là trường hợp trùng thật.' USING ERRCODE = '22023';
        END IF;
        IF char_length(v_ack) < 10 THEN
          RAISE EXCEPTION 'Lý do xác nhận trùng số GCN cần tối thiểu 10 ký tự.' USING ERRCODE = '22023';
        END IF;
        v_warn := array_append(v_warn, 'Số GCN trùng (đã xác nhận)');
      ELSE
        v_ack := NULL;
      END IF;

      -- Lô quy hoạch (chỉ thông tin; liên kết do trigger)
      SELECT count(*), count(*) FILTER (WHERE lower(btrim(l.legal_lot_code)) = lower(v_lot) AND l.status = 'chưa cấp GCN'),
             count(*) FILTER (WHERE lower(btrim(l.legal_lot_code)) = lower(v_lot) AND l.status = 'đã cấp GCN')
        INTO v_plots, v_plot_ok, v_plot_dn
      FROM public.planned_land_lots l WHERE l.project_id = v_proj;
      IF v_plots > 0 THEN
        IF v_plot_ok > 0 THEN
          v_warn := array_append(v_warn, 'Khớp lô quy hoạch (sẽ tự đánh dấu đã cấp GCN)');
        ELSIF v_plot_dn > 0 THEN
          v_warn := array_append(v_warn, 'Lô quy hoạch này đã được cấp GCN trước đó');
        ELSE
          v_warn := array_append(v_warn, 'Mã lô pháp lý chưa có trong danh mục lô quy hoạch của dự án');
        END IF;
      END IF;

      IF p_apply THEN
        PERFORM pg_advisory_xact_lock(hashtext('btcvmt_voucher_code'));
        v_code := public._allocate_asset_code_by_prefix(v_prefix);
        INSERT INTO public.assets (
          asset_code, collateral_type, certificate_no, registry_no, registry_date,
          project_id, legal_lot_code, land_lot_no, map_sheet_no,
          business_project_name, business_plot_code, area,
          current_owner_entity_id, current_owner_role, certificate_group,
          usage_purpose, usage_term_type, usage_term_date,
          asset_type, warehouse_id, invalidation_type, original_area, status,
          managing_unit, scan_file_url, notes,
          mortgage_status, mortgage_bank, mortgage_unit, mortgage_valuation, collateral_ratio, collateral_value, mortgage_expected_release_date,
          custody_status, lifecycle_status, sale_status, current_holder_dept, borrow_purpose,
          duplicate_ack_reason, updated_at, updated_by
        ) VALUES (
          v_code, v_ctype, v_cert, NULLIF(btrim(COALESCE(v_row->>'registry_no', '')), ''), v_regdate,
          v_proj, v_lot, NULLIF(btrim(COALESCE(v_row->>'land_lot_no', '')), ''), NULLIF(btrim(COALESCE(v_row->>'map_sheet_no', '')), ''),
          NULLIF(btrim(COALESCE(v_row->>'business_project_name', '')), ''), NULLIF(btrim(COALESCE(v_row->>'business_plot_code', '')), ''), v_area,
          v_ent, v_orole, v_group,
          NULLIF(btrim(COALESCE(v_row->>'usage_purpose', '')), ''), v_termtype, v_termdate,
          v_atype, v_wh, 'NONE', v_area, 'ACTIVE',
          NULLIF(btrim(COALESCE(v_row->>'managing_unit', '')), ''), v_scan, NULLIF(btrim(COALESCE(v_row->>'notes', '')), ''),
          CASE WHEN v_mort THEN 'mortgaged' ELSE 'none' END, v_bank, v_munit, v_mval, v_mratio, v_mcoll, v_mrel,
          CASE WHEN v_mort THEN 'checked_out' ELSE 'in_stock' END, 'active', 'not_ready',
          CASE WHEN v_mort THEN v_bank END, CASE WHEN v_mort THEN 'thế chấp' END,
          v_ack, now(), v_uid
        )
        RETURNING id INTO v_aid;
        r_asset_id := v_aid; r_asset_code := v_code;

        IF v_gen THEN
          v_pn := public._next_voucher_code(v_wh, 'PN');
          v_new_tx := NULL;
          v_tx := NULLIF(v_tx_map->>(v_wh::text), '')::uuid;
          IF v_tx IS NULL THEN
            INSERT INTO public.transactions (type, notes, created_by, warehouse_id, details)
            VALUES ('checkin', 'Nhập kho GCN hàng loạt từ Excel: ' || COALESCE(v_reason, ''), v_uid, v_wh, jsonb_build_object('source', 'import_assets_bulk'))
            RETURNING id INTO v_new_tx;
            v_tx := v_new_tx;
          END IF;
          INSERT INTO public.transaction_items (transaction_id, asset_id, type, reason, status, voucher_code, decision_notes, decided_at, decided_by)
          VALUES (v_tx, v_aid, 'checkin', 'cấp mới', 'approved', v_pn, 'Nhập kho GCN mới (nhập hàng loạt từ Excel)', now(), v_uid);
          v_tx_map := v_tx_map || jsonb_build_object(v_wh::text, v_tx);
          r_voucher := v_pn;
          v_receipts := v_receipts + 1;
        END IF;
        r_result := 'created';
        v_created := v_created + 1;
      ELSE
        r_result := 'ok';
      END IF;
      v_seen_c := array_append(v_seen_c, v_key);
      r_message := CASE WHEN cardinality(v_warn) > 0 THEN 'Cảnh báo: ' || array_to_string(v_warn, '; ')
                        ELSE 'Hợp lệ, sẵn sàng nhập mới.' END;
    EXCEPTION WHEN OTHERS THEN
      r_result := 'error'; r_message := SQLERRM; r_asset_id := NULL; r_asset_code := NULL; r_voucher := NULL;
      v_errors := v_errors + 1;
    END;
    RETURN NEXT;
  END LOOP;

  IF p_apply AND v_created > 0 THEN
    INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
    VALUES ('bulk_import:' || gen_random_uuid()::text, 'bulk_import', NULL,
            jsonb_build_object('rows', jsonb_array_length(p_rows), 'created', v_created, 'receipts', v_receipts, 'errors', v_errors),
            v_uid, v_name, v_reason, now());
  END IF;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_assets_bulk(jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_assets_bulk(jsonb, text, boolean) TO authenticated;

COMMIT;