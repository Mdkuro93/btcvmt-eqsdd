-- 0095_region_code_config_fix_allocate_and_import.sql
-- (Claude) Thay thế/sửa 0093 (AI Studio) và 0094 (import_assets_bulk theo tên vùng/tỉnh).
-- Chạy được dù 0093 của AI Studio đã chạy hay chưa (idempotent).
--
--  A. regions.code = CẤU HÌNH mã vùng (không cố định 3 vùng): cho phép NULL tới khi cấu hình; chuẩn hóa IN HOA;
--     CHECK ^[A-Z0-9]{2,8}$; UNIQUE khi có giá trị. Seed MỘT LẦN cho vùng có sẵn theo tên (Bắc/Trung/Nam) nếu còn trống.
--  B. SỬA LỖI 0093: hai hàm allocate_asset_code(text) và allocate_asset_code(text,text,text DEFAULT...) gây lỗi
--     "function allocate_asset_code(text) is not unique" khi gọi trong SQL (kể cả _allocate_asset_code_by_prefix -> import_assets_bulk).
--     => khôi phục _allocate_asset_code_by_prefix bản nguyên tử của 0082 (INSERT .. ON CONFLICT DO UPDATE);
--        allocate_asset_code(p_prefix) kiểm quyền rồi gọi hàm nội bộ; bản 3 tham số KHÔNG còn giá trị mặc định (không đoán VMT/DNG).
--        Quyền cấp mã trả về danh sách của 0079 (0093 đã tự mở thêm capital_dept/project_dept/re_dept).
--        Bỏ cột last_value dư của 0093 (peek_next_asset_code chỉ đọc last_seq).
--  C. import_assets_bulk: mã vùng = regions.code của vùng chứa địa bàn của dự án; mã tỉnh = areas.province_code.
--     Thiếu cấu hình => dòng lỗi chỉ rõ chỗ cần cấu hình, KHÔNG mặc định. Bỏ _region_code_from_name/_province_code_from_name.
-- Rollback: ops/rollback/rollback_0095_region_code_config.sql
BEGIN;

-- ===== A. regions.code =====
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.regions ALTER COLUMN code DROP NOT NULL;
COMMENT ON COLUMN public.regions.code IS
  'Mã vùng (viết tắt, 2-8 ký tự chữ/số IN HOA) do quản trị cấu hình; dùng làm phần đầu của Mã Tài Sản. NULL = chưa cấu hình.';

UPDATE public.regions SET code = NULLIF(upper(btrim(code)), '') WHERE code IS NOT NULL;
UPDATE public.regions SET code = NULL WHERE code IS NOT NULL AND code !~ '^[A-Z0-9]{2,8}$';

-- Seed một lần cho vùng hiện có còn trống (cấu hình ban đầu; vùng khác/vùng mới do quản trị tự đặt)
UPDATE public.regions SET code = 'VMB' WHERE code IS NULL AND lower(name) LIKE '%bắc%'
  AND NOT EXISTS (SELECT 1 FROM public.regions x WHERE x.code = 'VMB');
UPDATE public.regions SET code = 'VMT' WHERE code IS NULL AND lower(name) LIKE '%trung%'
  AND NOT EXISTS (SELECT 1 FROM public.regions x WHERE x.code = 'VMT');
UPDATE public.regions SET code = 'VMN' WHERE code IS NULL AND lower(name) LIKE '%nam%'
  AND NOT EXISTS (SELECT 1 FROM public.regions x WHERE x.code = 'VMN');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.regions'::regclass AND conname = 'regions_code_key') THEN
    ALTER TABLE public.regions ADD CONSTRAINT regions_code_key UNIQUE (code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.regions'::regclass AND conname = 'chk_regions_code_format') THEN
    ALTER TABLE public.regions ADD CONSTRAINT chk_regions_code_format CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,8}$');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._regions_normalize_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.code := NULLIF(upper(btrim(COALESCE(NEW.code, ''))), '');
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_regions_normalize_code ON public.regions;
CREATE TRIGGER trg_regions_normalize_code BEFORE INSERT OR UPDATE OF code ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public._regions_normalize_code();
REVOKE ALL ON FUNCTION public._regions_normalize_code() FROM PUBLIC, anon, authenticated;

-- ===== B. Cấp mã tài sản =====
CREATE TABLE IF NOT EXISTS public.asset_code_counters (
  prefix     text PRIMARY KEY,
  last_seq   bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_code_counters DROP COLUMN IF EXISTS last_value;
ALTER TABLE public.asset_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_code_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._allocate_asset_code_by_prefix(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prefix text := upper(btrim(COALESCE(p_prefix, '')));
  v_seed   bigint := 0;
  v_seq    bigint;
  v_code   text;
  v_try    integer := 0;
BEGIN
  IF v_prefix !~ '^[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_$' THEN
    RAISE EXCEPTION 'Tiền tố mã tài sản không hợp lệ: "%".', COALESCE(p_prefix, '') USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.asset_code_counters WHERE prefix = v_prefix) THEN
    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_seed
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);
  END IF;

  LOOP
    INSERT INTO public.asset_code_counters (prefix, last_seq)
    VALUES (v_prefix, v_seed + 1)
    ON CONFLICT (prefix) DO UPDATE
      SET last_seq = public.asset_code_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_code := v_prefix || lpad(v_seq::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE asset_code = v_code);

    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_seed
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);

    UPDATE public.asset_code_counters
    SET last_seq = GREATEST(last_seq, v_seed), updated_at = now()
    WHERE prefix = v_prefix;
    v_seed := 0;

    v_try := v_try + 1;
    IF v_try > 5 THEN
      RAISE EXCEPTION 'Không cấp được mã tài sản (xung đột liên tục với tiền tố %).', v_prefix;
    END IF;
  END LOOP;

  RETURN v_code;
END;
$function$;
REVOKE ALL ON FUNCTION public._allocate_asset_code_by_prefix(text) FROM PUBLIC, anon, authenticated;

-- Bỏ cả hai bản allocate_asset_code (bản 0093 nhập nhằng) rồi tạo lại rõ ràng
DROP FUNCTION IF EXISTS public.allocate_asset_code(text);
DROP FUNCTION IF EXISTS public.allocate_asset_code(text, text, text);

CREATE FUNCTION public.allocate_asset_code(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly') THEN
    RAISE EXCEPTION 'Bạn không có quyền cấp mã tài sản.' USING ERRCODE = '42501';
  END IF;
  RETURN public._allocate_asset_code_by_prefix(p_prefix);
END;
$function$;

-- Bản 3 tham số (tương thích giao diện cũ): KHÔNG có giá trị mặc định, thiếu thì báo lỗi
CREATE FUNCTION public.allocate_asset_code(p_region text, p_province text, p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_r text := upper(btrim(COALESCE(p_region, '')));
  v_p text := upper(btrim(COALESCE(p_province, '')));
  v_t text := upper(btrim(COALESCE(p_type, '')));
BEGIN
  IF v_r = '' OR v_p = '' OR v_t = '' THEN
    RAISE EXCEPTION 'Thiếu mã vùng, mã tỉnh hoặc loại tài sản để cấp mã (không dùng giá trị mặc định).' USING ERRCODE = '22023';
  END IF;
  RETURN public.allocate_asset_code(v_r || '_' || v_p || '_' || v_t || '_');
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_asset_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_asset_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.allocate_asset_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_asset_code(text, text, text) TO authenticated;

-- ===== C. import_assets_bulk theo cấu hình =====
DROP FUNCTION IF EXISTS public._region_code_from_name(text);
DROP FUNCTION IF EXISTS public._province_code_from_name(text);

DROP FUNCTION IF EXISTS public.import_assets_bulk(jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.import_assets_bulk(
  p_rows jsonb,
  p_reason text DEFAULT NULL,
  p_apply boolean DEFAULT false,
  p_batch_id uuid DEFAULT NULL
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
  v_rcode    text;
  v_pcode    text;
  v_aname    text;
  v_rname    text;
  v_proj_area uuid;
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

      -- Mã tài sản: tiền tố theo DỰ ÁN (vùng của dự án + mã tỉnh của địa bàn dự án), KHÔNG dùng mặc định
      v_ctype := upper(btrim(COALESCE(NULLIF(btrim(COALESCE(v_row->>'collateral_type', '')), ''), 'BDS')));
      IF v_ctype !~ '^[A-Z0-9]{2,8}$' THEN
        RAISE EXCEPTION 'collateral_type chỉ gồm chữ và số, 2-8 ký tự.' USING ERRCODE = '22023';
      END IF;
      SELECT ar.id, ar.name, rg.name, NULLIF(upper(btrim(COALESCE(rg.code, ''))), ''), NULLIF(upper(btrim(COALESCE(ar.province_code, ''))), '')
        INTO v_proj_area, v_aname, v_rname, v_rcode, v_pcode
      FROM public.projects pr
      LEFT JOIN public.areas ar ON ar.id = pr.area_id
      LEFT JOIN public.regions rg ON rg.id = ar.region_id
      WHERE pr.id = v_proj;
      IF v_proj_area IS NULL THEN
        RAISE EXCEPTION 'Dự án "%" chưa gắn địa bàn: cấu hình tại Danh mục > Dự án.', v_pname USING ERRCODE = '22023';
      END IF;
      IF v_rname IS NULL THEN
        RAISE EXCEPTION 'Địa bàn "%" chưa thuộc vùng nào: cấu hình tại Danh mục > Địa bàn.', COALESCE(v_aname, '?') USING ERRCODE = '22023';
      END IF;
      IF v_rcode IS NULL THEN
        RAISE EXCEPTION 'Vùng "%" chưa có mã vùng: cấu hình tại Danh mục > Vùng.', v_rname USING ERRCODE = '22023';
      END IF;
      IF v_pcode IS NULL THEN
        RAISE EXCEPTION 'Địa bàn "%" chưa có mã tỉnh: cấu hình tại Danh mục > Địa bàn.', COALESCE(v_aname, '?') USING ERRCODE = '22023';
      END IF;
      IF v_rcode !~ '^[A-Z0-9]{2,8}$' THEN
        RAISE EXCEPTION 'Mã vùng "%" của vùng "%" không hợp lệ (2-8 ký tự chữ/số).', v_rcode, v_rname USING ERRCODE = '22023';
      END IF;
      IF v_pcode !~ '^[A-Z0-9]{2,8}$' THEN
        RAISE EXCEPTION 'Mã tỉnh "%" của địa bàn "%" không hợp lệ (2-8 ký tự chữ/số).', v_pcode, v_aname USING ERRCODE = '22023';
      END IF;
      v_prefix := v_rcode || '_' || v_pcode || '_' || v_ctype || '_';

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
          -- MỘT phiếu nhập chung cho mọi GCN cùng kho trong cùng đợt: dùng chung giao dịch và mã phiếu.
          -- Cùng p_batch_id (nhiều lần gọi chia lô) thì tiếp tục dùng phiếu của đợt đó.
          v_new_tx := NULL;
          v_tx := NULLIF(v_tx_map->(v_wh::text)->>'tx', '')::uuid;
          v_pn := v_tx_map->(v_wh::text)->>'voucher';
          IF v_tx IS NULL AND p_batch_id IS NOT NULL THEN
            SELECT t.id INTO v_tx FROM public.transactions t
            WHERE t.type = 'checkin' AND t.warehouse_id = v_wh AND t.created_by = v_uid
              AND t.details->>'batch_id' = p_batch_id::text
            ORDER BY t.created_at LIMIT 1;
            IF v_tx IS NOT NULL THEN
              SELECT ti.voucher_code INTO v_pn FROM public.transaction_items ti
              WHERE ti.transaction_id = v_tx AND ti.voucher_code IS NOT NULL LIMIT 1;
            END IF;
          END IF;
          IF v_tx IS NULL OR v_pn IS NULL THEN
            v_pn := public._next_voucher_code(v_wh, 'PN');
            INSERT INTO public.transactions (type, notes, created_by, warehouse_id, details)
            VALUES ('checkin', 'Nhập kho GCN hàng loạt từ Excel: ' || COALESCE(v_reason, ''), v_uid, v_wh,
                    jsonb_build_object('source', 'import_assets_bulk', 'batch_id', p_batch_id))
            RETURNING id INTO v_new_tx;
            v_tx := v_new_tx;
          END IF;
          INSERT INTO public.transaction_items (transaction_id, asset_id, type, reason, status, voucher_code, decision_notes, decided_at, decided_by)
          VALUES (v_tx, v_aid, 'checkin', 'cấp mới', 'approved', v_pn, 'Nhập kho GCN mới (nhập hàng loạt từ Excel)', now(), v_uid);
          v_tx_map := v_tx_map || jsonb_build_object(v_wh::text, jsonb_build_object('tx', v_tx, 'voucher', v_pn));
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
            jsonb_build_object('rows', jsonb_array_length(p_rows), 'created', v_created, 'receipts', v_receipts, 'errors', v_errors, 'batch_id', p_batch_id),
            v_uid, v_name, v_reason, now());
  END IF;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_assets_bulk(jsonb, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_assets_bulk(jsonb, text, boolean, uuid) TO authenticated;

COMMIT;
