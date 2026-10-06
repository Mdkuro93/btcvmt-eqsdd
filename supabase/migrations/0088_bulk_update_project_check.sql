-- 0088_bulk_update_project_check.sql
-- Cập nhật hàng loạt (0083/0084) và cấp đổi hàng loạt (0087): ĐỐI CHIẾU DỰ ÁN của từng dòng.
-- Mỗi dòng có thể gửi thêm khóa `project_name` (tên dự án) và/hoặc `project_code` (mã dự án, nếu dự án có mã).
-- Nếu có gửi: phải khớp dự án hiện tại của GCN (tên so khớp không phân biệt hoa/thường, gộp khoảng trắng; mã so khớp không phân biệt hoa/thường),
-- sai thì dòng đó báo lỗi (22023). Nếu KHÔNG gửi cả hai: không đối chiếu (tương thích ngược). Giao diện bắt buộc có tên dự án.
-- Không đổi chữ ký hàm, không đổi logic khác: chỉ thêm 1 khối đối chiếu sau bước khớp mã pháp lý ở mỗi hàm.
-- Nội dung hai hàm lấy từ 0084 và 0087 (đã chạy và đạt test). Rollback: chạy lại 0084 và 0087 (CREATE OR REPLACE), rồi
--   DROP FUNCTION public._bu_project_mismatch(uuid, text, text);
BEGIN;

CREATE OR REPLACE FUNCTION public._bu_project_mismatch(p_project_id uuid, p_code text, p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_code  text := NULLIF(btrim(COALESCE(p_code, '')), '');
  v_name  text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_pname text;
  v_pcode text;
BEGIN
  IF v_code IS NULL AND v_name IS NULL THEN
    RETURN NULL;  -- không gửi thông tin dự án: không đối chiếu (tương thích ngược)
  END IF;
  IF p_project_id IS NULL THEN
    RETURN 'GCN này chưa gắn dự án trên hệ thống nên không đối chiếu được tên/mã dự án.';
  END IF;
  SELECT pr.name, pr.project_code INTO v_pname, v_pcode FROM public.projects pr WHERE pr.id = p_project_id;
  IF v_code IS NOT NULL AND lower(btrim(COALESCE(v_pcode, ''))) <> lower(v_code) THEN
    RETURN format('Mã dự án không khớp với GCN (hệ thống: %s - %s).', COALESCE(NULLIF(btrim(v_pcode), ''), 'chưa có mã'), COALESCE(v_pname, ''));
  END IF;
  IF v_name IS NOT NULL
     AND regexp_replace(lower(btrim(COALESCE(v_pname, ''))), '\s+', ' ', 'g') <> regexp_replace(lower(v_name), '\s+', ' ', 'g') THEN
    RETURN format('Tên dự án không khớp với GCN (hệ thống: %s).', COALESCE(v_pname, ''));
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._bu_project_mismatch(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bulk_correct_assets(
  p_mode text,
  p_rows jsonb,
  p_reason text DEFAULT NULL,
  p_apply boolean DEFAULT false
)
RETURNS TABLE (r_row integer, r_asset_code text, r_result text, r_message text, r_changes jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_role      text;
  v_managed   uuid[];
  v_name      text;
  v_reason    text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row       jsonb;
  v_i         integer := 0;
  v_code      text;
  v_lot       text;
  v_cert      text;
  v_asset     public.assets%ROWTYPE;
  v_seen      text[] := ARRAY[]::text[];
  v_changes   jsonb;
  v_new       jsonb;
  v_warn      text[];
  v_f         text;
  v_t         text;
  v_oldv      text;
  v_num       numeric;
  v_dt        date;
  v_applied   integer := 0;
  v_errors    integer := 0;
  v_scan_re1  constant text := '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)';
  v_scan_re2  constant text := '^[A-Za-z0-9_./-]+$';
  v_ent_code  text;
  v_ent_name  text;
  v_ents      uuid[];
  v_ent       uuid;
  v_ent_role  text;
  v_old_ent_name text;
  v_new_ent_name text;
  v_newcert   text;
  v_ack       text;
  v_hit       record;
  v_pmsg      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, managed_warehouse_ids, COALESCE(full_name, email) INTO v_role, v_managed, v_name
  FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật hàng loạt GCN.' USING ERRCODE = '42501';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('info', 'mortgage', 'owner', 'certificate') THEN
    RAISE EXCEPTION 'Chế độ cập nhật không hợp lệ (info | mortgage | owner | certificate).' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Danh sách dòng phải là mảng từ 1 đến 500 dòng mỗi lần gọi.' USING ERRCODE = '22023';
  END IF;
  IF p_apply AND (v_reason IS NULL OR char_length(v_reason) < 10) THEN
    RAISE EXCEPTION 'Cần nhập lý do cập nhật (tối thiểu 10 ký tự) để áp dụng.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_i := v_i + 1;
    r_row := v_i;
    r_asset_code := NULL;
    r_result := 'error';
    r_message := NULL;
    r_changes := '{}'::jsonb;
    v_changes := '{}'::jsonb;
    v_new := '{}'::jsonb;
    v_warn := ARRAY[]::text[];

    BEGIN
      IF jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Dòng không hợp lệ.' USING ERRCODE = '22023';
      END IF;
      v_code := upper(btrim(COALESCE(v_row->>'asset_code', '')));
      r_asset_code := NULLIF(v_code, '');
      v_lot  := lower(btrim(COALESCE(v_row->>'legal_lot_code', '')));
      v_cert := lower(btrim(COALESCE(v_row->>'certificate_no', '')));

      IF v_code = '' OR v_lot = '' THEN
        RAISE EXCEPTION 'Thiếu mã tài sản hoặc mã pháp lý (mã lô).' USING ERRCODE = '22023';
      END IF;
      IF v_code = ANY (v_seen) THEN
        RAISE EXCEPTION 'Mã tài sản % bị lặp trong file.', v_code USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_code;

      SELECT * INTO v_asset FROM public.assets a WHERE upper(a.asset_code) = v_code FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy GCN có mã tài sản %.', v_code USING ERRCODE = 'P0002';
      END IF;
      IF NULLIF(btrim(COALESCE(v_asset.legal_lot_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'GCN này chưa có mã pháp lý trên hệ thống; cần bổ sung mã pháp lý trước khi cập nhật hàng loạt.' USING ERRCODE = '22023';
      END IF;
      IF lower(btrim(v_asset.legal_lot_code)) <> v_lot THEN
        RAISE EXCEPTION 'Mã pháp lý không khớp với GCN (hệ thống: %).', v_asset.legal_lot_code USING ERRCODE = '22023';
      END IF;
      v_pmsg := public._bu_project_mismatch(v_asset.project_id, v_row->>'project_code', v_row->>'project_name');
      IF v_pmsg IS NOT NULL THEN
        RAISE EXCEPTION '%', v_pmsg USING ERRCODE = '22023';
      END IF;
      IF p_mode <> 'certificate' THEN
        IF v_cert = '' OR lower(btrim(v_asset.certificate_no)) <> v_cert THEN
          RAISE EXCEPTION 'Số GCN không khớp (hệ thống: %).', v_asset.certificate_no USING ERRCODE = '22023';
        END IF;
      END IF;
      IF v_asset.lifecycle_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'GCN đã vô hiệu, không thể cập nhật.' USING ERRCODE = '22023';
      END IF;
      IF v_role = 'warehouse_manager'
         AND (v_asset.warehouse_id IS NULL OR NOT (v_asset.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[])))) THEN
        RAISE EXCEPTION 'GCN này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
      END IF;

      -- ===== Tính các thay đổi theo chế độ =====
      IF p_mode = 'info' THEN
        v_num := public._bu_num(v_row->>'area', 'area');
        IF v_num IS NOT NULL THEN
          IF v_num <= 0 THEN
            RAISE EXCEPTION 'Diện tích phải lớn hơn 0.' USING ERRCODE = '22023';
          END IF;
          IF v_num IS DISTINCT FROM v_asset.area THEN
            v_new := v_new || jsonb_build_object('area', v_num);
            v_changes := v_changes || jsonb_build_object('area', jsonb_build_array(v_asset.area, v_num));
            IF v_asset.area IS NOT NULL AND v_asset.area > 0 AND abs(v_num - v_asset.area) / v_asset.area > 0.2 THEN
              v_warn := array_append(v_warn, 'Diện tích thay đổi hơn 20%');
            END IF;
            IF EXISTS (SELECT 1 FROM public.assets c WHERE c.parent_asset_id = v_asset.id) THEN
              v_warn := array_append(v_warn, 'GCN đã có sổ con liên quan, kiểm tra lại diện tích');
            END IF;
          END IF;
        END IF;

        FOREACH v_f IN ARRAY ARRAY['registry_date', 'usage_term_date'] LOOP
          v_dt := public._bu_date(v_row->>v_f, v_f);
          IF v_dt IS NOT NULL THEN
            v_oldv := to_jsonb(v_asset)->>v_f;
            IF v_oldv IS DISTINCT FROM v_dt::text THEN
              v_new := v_new || jsonb_build_object(v_f, v_dt::text);
              v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_array(v_oldv, v_dt::text));
            END IF;
          END IF;
        END LOOP;

        FOREACH v_f IN ARRAY ARRAY['land_lot_no', 'map_sheet_no', 'registry_no', 'usage_purpose', 'usage_term_type', 'asset_type',
                                   'certificate_group', 'business_plot_code', 'business_project_name', 'managing_unit',
                                   'scan_file_url', 'notes'] LOOP
          v_t := NULLIF(btrim(COALESCE(v_row->>v_f, '')), '');
          IF v_t IS NOT NULL THEN
            IF v_f = 'scan_file_url' AND NOT (v_t ~* v_scan_re1 OR v_t ~ v_scan_re2) THEN
              RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
            END IF;
            v_oldv := to_jsonb(v_asset)->>v_f;
            IF v_oldv IS DISTINCT FROM v_t THEN
              v_new := v_new || jsonb_build_object(v_f, v_t);
              v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_array(v_oldv, v_t));
            END IF;
          END IF;
        END LOOP;

      ELSIF p_mode = 'mortgage' THEN
        IF v_asset.mortgage_status IS DISTINCT FROM 'mortgaged' THEN
          RAISE EXCEPTION 'GCN không ở trạng thái thế chấp; đổi trạng thái thế chấp phải lập phiếu.' USING ERRCODE = '22023';
        END IF;
        FOREACH v_f IN ARRAY ARRAY['mortgage_valuation', 'collateral_ratio', 'collateral_value'] LOOP
          v_num := public._bu_num(v_row->>v_f, v_f);
          IF v_num IS NOT NULL THEN
            IF v_num < 0 THEN
              RAISE EXCEPTION 'Giá trị % không được âm.', v_f USING ERRCODE = '22023';
            END IF;
            IF v_f = 'collateral_ratio' AND v_num > 100 THEN
              RAISE EXCEPTION 'Tỷ lệ bảo đảm không được vượt quá 100 (đơn vị %%).' USING ERRCODE = '22023';
            END IF;
            v_oldv := to_jsonb(v_asset)->>v_f;
            IF v_oldv IS NULL OR v_oldv::numeric IS DISTINCT FROM v_num THEN
              v_new := v_new || jsonb_build_object(v_f, v_num);
              v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_array(v_oldv, v_num));
            END IF;
          END IF;
        END LOOP;
        v_dt := public._bu_date(v_row->>'mortgage_expected_release_date', 'mortgage_expected_release_date');
        IF v_dt IS NOT NULL THEN
          v_oldv := to_jsonb(v_asset)->>'mortgage_expected_release_date';
          IF v_oldv IS DISTINCT FROM v_dt::text THEN
            v_new := v_new || jsonb_build_object('mortgage_expected_release_date', v_dt::text);
            v_changes := v_changes || jsonb_build_object('mortgage_expected_release_date', jsonb_build_array(v_oldv, v_dt::text));
          END IF;
        END IF;
        FOREACH v_f IN ARRAY ARRAY['mortgage_bank', 'mortgage_unit'] LOOP
          v_t := NULLIF(btrim(COALESCE(v_row->>v_f, '')), '');
          IF v_t IS NOT NULL THEN
            v_oldv := to_jsonb(v_asset)->>v_f;
            IF v_oldv IS DISTINCT FROM v_t THEN
              v_new := v_new || jsonb_build_object(v_f, v_t);
              v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_array(v_oldv, v_t));
            END IF;
          END IF;
        END LOOP;

      ELSIF p_mode = 'owner' THEN
        v_ent_code := NULLIF(btrim(COALESCE(v_row->>'new_owner_code', '')), '');
        v_ent_name := NULLIF(btrim(COALESCE(v_row->>'new_owner_name', '')), '');
        IF v_ent_code IS NULL AND v_ent_name IS NULL THEN
          RAISE EXCEPTION 'Thiếu mã công ty hoặc tên chủ sở hữu mới.' USING ERRCODE = '22023';
        END IF;
        IF v_ent_code IS NOT NULL THEN
          SELECT array_agg(e.id) INTO v_ents FROM public.investor_entities e WHERE lower(btrim(e.company_code)) = lower(v_ent_code);
        ELSE
          SELECT array_agg(e.id) INTO v_ents FROM public.investor_entities e WHERE lower(btrim(e.name)) = lower(v_ent_name);
        END IF;
        IF v_ents IS NULL OR cardinality(v_ents) = 0 THEN
          RAISE EXCEPTION 'Không tìm thấy chủ sở hữu "%" trong danh mục.', COALESCE(v_ent_code, v_ent_name) USING ERRCODE = 'P0002';
        ELSIF cardinality(v_ents) > 1 THEN
          RAISE EXCEPTION 'Có % chủ sở hữu trùng "%"; hãy dùng mã công ty.', cardinality(v_ents), COALESCE(v_ent_code, v_ent_name) USING ERRCODE = '22023';
        END IF;
        v_ent := v_ents[1];
        v_ent_role := lower(COALESCE(NULLIF(btrim(COALESCE(v_row->>'new_owner_role', '')), ''), COALESCE(v_asset.current_owner_role, 'cdt')));
        IF v_ent_role NOT IN ('cdt', 'ndt') THEN
          RAISE EXCEPTION 'Vai trò chủ sở hữu phải là cdt hoặc ndt.' USING ERRCODE = '22023';
        END IF;
        IF v_ent IS DISTINCT FROM v_asset.current_owner_entity_id OR v_ent_role IS DISTINCT FROM v_asset.current_owner_role THEN
          SELECT name INTO v_old_ent_name FROM public.investor_entities WHERE id = v_asset.current_owner_entity_id;
          SELECT name INTO v_new_ent_name FROM public.investor_entities WHERE id = v_ent;
          v_changes := jsonb_build_object(
            'chu_so_huu', jsonb_build_array(v_old_ent_name, v_new_ent_name),
            'vai_tro', jsonb_build_array(v_asset.current_owner_role, v_ent_role));
        END IF;

      ELSE  -- certificate
        v_newcert := NULLIF(btrim(COALESCE(v_row->>'new_certificate_no', '')), '');
        IF v_newcert IS NULL THEN
          RAISE EXCEPTION 'Thiếu số GCN mới (new_certificate_no).' USING ERRCODE = '22023';
        END IF;
        IF lower(v_newcert) <> lower(btrim(v_asset.certificate_no)) THEN
          SELECT * INTO v_hit FROM public._find_certificate_duplicate(v_newcert, v_asset.project_id, v_asset.id);
          IF FOUND THEN
            v_ack := NULLIF(btrim(COALESCE(v_row->>'duplicate_ack_reason', '')), '');
            IF v_ack IS NULL OR char_length(v_ack) < 10 THEN
              RAISE EXCEPTION 'DUPLICATE_UNCONFIRMED: Số GCN mới đã tồn tại trong hệ thống. Cần điền duplicate_ack_reason (tối thiểu 10 ký tự) nếu đây là trường hợp trùng thật.' USING ERRCODE = 'P0001';
            END IF;
            v_new := v_new || jsonb_build_object('duplicate_ack_reason', v_ack);
            v_warn := array_append(v_warn, 'Số GCN mới trùng với GCN khác (đã xác nhận)');
          END IF;
          v_new := v_new || jsonb_build_object('certificate_no', v_newcert);
          v_changes := v_changes || jsonb_build_object('certificate_no', jsonb_build_array(v_asset.certificate_no, v_newcert));
        END IF;
      END IF;

      -- ===== Kết quả / áp dụng =====
      IF v_changes = '{}'::jsonb THEN
        r_result := 'unchanged';
        r_message := 'Không có thay đổi.';
      ELSE
        r_changes := v_changes;
        IF p_apply THEN
          IF p_mode = 'owner' THEN
            PERFORM public.transfer_asset_ownership(v_asset.id, v_ent, v_ent_role, 'Cập nhật hàng loạt: ' || v_reason, v_uid);
          ELSE
            EXECUTE (
              SELECT 'UPDATE public.assets SET ' || string_agg(format('%I = r.%I', k, k), ', ') ||
                     ', updated_at = now(), updated_by = $2 FROM (SELECT (jsonb_populate_record(NULL::public.assets, $1)).*) r WHERE assets.id = $3'
              FROM jsonb_object_keys(v_new) AS k
            ) USING v_new, v_uid, v_asset.id;
          END IF;

          INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
          VALUES (
            v_asset.id::text,
            'bulk_correct:' || p_mode,
            (SELECT jsonb_object_agg(key, value -> 0) FROM jsonb_each(v_changes)),
            (SELECT jsonb_object_agg(key, value -> 1) FROM jsonb_each(v_changes)),
            v_uid, v_name, v_reason, now()
          );
          v_applied := v_applied + 1;
          r_result := 'applied';
        ELSE
          r_result := 'ok';
        END IF;
        r_message := CASE WHEN cardinality(v_warn) > 0 THEN 'Cảnh báo: ' || array_to_string(v_warn, '; ')
                          ELSE 'Cập nhật ' || (SELECT count(*) FROM jsonb_object_keys(v_changes)) || ' trường.' END;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      r_result := 'error';
      r_message := SQLERRM;
      r_changes := '{}'::jsonb;
      v_errors := v_errors + 1;
    END;

    RETURN NEXT;
  END LOOP;

  IF p_apply AND v_applied > 0 THEN
    INSERT INTO public.activity_logs (log_date, action_type, document_no, description, used_by, notes, performed_by)
    VALUES (
      CURRENT_DATE, 'Cập nhật hàng loạt GCN', 'BU-' || left(gen_random_uuid()::text, 8),
      'Cập nhật hàng loạt (' || p_mode || '): áp dụng ' || v_applied || '/' || v_i || ' dòng'
        || CASE WHEN v_errors > 0 THEN ', ' || v_errors || ' dòng lỗi' ELSE '' END || '. Lý do: ' || v_reason,
      COALESCE(v_name, 'BTC VMT'), v_reason, v_uid
    );
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_correct_assets(text, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_correct_assets(text, jsonb, text, boolean) TO authenticated;

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
  v_pmsg     text;
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
      v_pmsg := public._bu_project_mismatch(v_old.project_id, v_row->>'project_code', v_row->>'project_name');
      IF v_pmsg IS NOT NULL THEN
        RAISE EXCEPTION '%', v_pmsg USING ERRCODE = '22023';
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