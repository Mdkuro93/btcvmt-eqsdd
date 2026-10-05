-- 0079_certificate_unique_aware_check_and_code_resync.sql
-- Xây trên 0078 (đã chạy, đạt test). Phạm vi:
--  1. check_asset_duplicate: DB có UNIQUE toàn hệ thống assets_certificate_no_key (kể cả GCN đã vô hiệu, GCN dự án khác),
--     nhưng quy tắc cũ chỉ coi trùng khi cùng dự án và bỏ qua GCN vô hiệu => kiểm tra báo "không trùng", lúc lưu DB báo lỗi unique thô.
--     Thêm quy tắc 'certificate_no_global' phản ánh đúng ràng buộc này (vai trò ngoài admin/btc chỉ nhận thông báo chung).
--  2. allocate_asset_code: khi va chạm với mã do đường khác cấp (approve_asset_declaration_request vẫn dùng MAX()+1),
--     nhảy bộ đếm tới số lớn nhất hiện có thay vì lặp tới 1.000 lần.
--  3. peek_next_asset_code: cùng cách xử lý va chạm (một truy vấn thay vì vòng lặp).
-- Không đổi chữ ký hàm. Tuyển chọn quyền gọi giữ nguyên như 0078.
BEGIN;

CREATE OR REPLACE FUNCTION public.check_asset_duplicate(
  p_certificate_no text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_legal_lot_code text DEFAULT NULL,
  p_map_sheet_no text DEFAULT NULL,
  p_land_lot_no text DEFAULT NULL,
  p_exclude_asset_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_priv     boolean;
  v_cert     text := lower(btrim(COALESCE(p_certificate_no, '')));
  v_lot      text := lower(btrim(COALESCE(p_legal_lot_code, '')));
  v_map      text := lower(btrim(COALESCE(p_map_sheet_no, '')));
  v_land     text := lower(btrim(COALESCE(p_land_lot_no, '')));
  v_exclude  uuid := COALESCE(p_exclude_asset_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_hit      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Hồ sơ người dùng không hợp lệ hoặc chưa được kích hoạt.' USING ERRCODE = '42501';
  END IF;
  v_priv := v_role IN ('super_admin', 'admin', 'btc_manager');

  -- Quy tắc 1: trùng số GCN (cùng dự án; nếu một bên chưa có dự án thì so toàn hệ thống)
  IF v_cert <> '' THEN
    SELECT a.id, a.certificate_no, pr.name AS project_name INTO v_hit
    FROM public.assets a
    LEFT JOIN public.projects pr ON pr.id = a.project_id
    WHERE a.id <> v_exclude
      AND a.lifecycle_status IS DISTINCT FROM 'invalidated'
      AND lower(btrim(a.certificate_no)) = v_cert
      AND (p_project_id IS NULL OR a.project_id IS NULL OR a.project_id = p_project_id)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'rule', 'certificate_no',
        'reason', CASE WHEN v_priv
          THEN 'Trùng số GCN: Số GCN "' || btrim(p_certificate_no) || '" đã tồn tại trong ' || COALESCE(v_hit.project_name, 'cùng dự án') || '!'
          ELSE 'Trùng số GCN: Số GCN này đã tồn tại trong hệ thống.' END
      );
    END IF;
  END IF;

  -- Quy tắc 1b: DB có chỉ mục UNIQUE toàn hệ thống trên certificate_no (assets_certificate_no_key), kể cả GCN đã vô hiệu
  -- và GCN ở dự án khác. Báo sớm bằng thông báo rõ ràng thay vì để lỗi unique thô lúc lưu.
  IF v_cert <> '' THEN
    SELECT a.id, a.certificate_no, a.lifecycle_status, pr.name AS project_name INTO v_hit
    FROM public.assets a
    LEFT JOIN public.projects pr ON pr.id = a.project_id
    WHERE a.id <> v_exclude
      AND lower(btrim(a.certificate_no)) = v_cert
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'rule', 'certificate_no_global',
        'reason', CASE WHEN v_priv
          THEN 'Trùng số GCN: Số GCN "' || btrim(p_certificate_no) || '" đã tồn tại'
               || CASE WHEN v_hit.lifecycle_status = 'invalidated' THEN ' (GCN đã vô hiệu)' ELSE '' END
               || ' trong ' || COALESCE(v_hit.project_name, 'hệ thống') || '. Hệ thống không cho phép trùng số GCN giữa các dự án.'
          ELSE 'Trùng số GCN: Số GCN này đã tồn tại trong hệ thống.' END
      );
    END IF;
  END IF;

  -- Quy tắc 2: trùng mã lô pháp lý trong cùng dự án
  IF p_project_id IS NOT NULL AND v_lot <> '' THEN
    SELECT a.id, a.certificate_no INTO v_hit
    FROM public.assets a
    WHERE a.id <> v_exclude
      AND a.lifecycle_status IS DISTINCT FROM 'invalidated'
      AND a.project_id = p_project_id
      AND lower(btrim(COALESCE(a.legal_lot_code, ''))) = v_lot
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'rule', 'legal_lot_code',
        'reason', CASE WHEN v_priv
          THEN 'Trùng Mã Lô Pháp Lý: "' || btrim(p_legal_lot_code) || '" đã được khai báo cho GCN ' || v_hit.certificate_no || ' trong dự án này!'
          ELSE 'Trùng Mã Lô Pháp Lý: mã này đã được khai báo trong dự án.' END
      );
    END IF;
  END IF;

  -- Quy tắc 3: trùng tờ bản đồ + thửa đất trong cùng dự án
  IF p_project_id IS NOT NULL AND v_map <> '' AND v_land <> '' THEN
    SELECT a.id, a.certificate_no INTO v_hit
    FROM public.assets a
    WHERE a.id <> v_exclude
      AND a.lifecycle_status IS DISTINCT FROM 'invalidated'
      AND a.project_id = p_project_id
      AND lower(btrim(COALESCE(a.map_sheet_no, ''))) = v_map
      AND lower(btrim(COALESCE(a.land_lot_no, ''))) = v_land
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'rule', 'map_land_lot',
        'reason', CASE WHEN v_priv
          THEN 'Trùng Thửa đất & Tờ bản đồ: Thửa đất số "' || btrim(p_land_lot_no) || '" - Tờ bản đồ số "' || btrim(p_map_sheet_no) || '" đã tồn tại trên hệ thống cho GCN ' || v_hit.certificate_no || '!'
          ELSE 'Trùng Thửa đất & Tờ bản đồ: đã tồn tại trong dự án.' END
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('is_duplicate', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.allocate_asset_code(
  p_region text DEFAULT 'VMT',
  p_province text DEFAULT 'DNG',
  p_type text DEFAULT 'BDS'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_region  text := upper(btrim(COALESCE(NULLIF(p_region, ''), 'VMT')));
  v_prov    text := upper(btrim(COALESCE(NULLIF(p_province, ''), 'DNG')));
  v_type    text := upper(btrim(COALESCE(NULLIF(p_type, ''), 'BDS')));
  v_prefix  text;
  v_seed    bigint;
  v_seq     bigint;
  v_code    text;
  v_try     integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly') THEN
    RAISE EXCEPTION 'Bạn không có quyền cấp mã tài sản.' USING ERRCODE = '42501';
  END IF;
  IF v_region !~ '^[A-Z0-9]{2,8}$' OR v_prov !~ '^[A-Z0-9]{2,8}$' OR v_type !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'Mã vùng/tỉnh/loại tài sản không hợp lệ (chỉ chữ và số, 2-8 ký tự).' USING ERRCODE = '22023';
  END IF;

  v_prefix := v_region || '_' || v_prov || '_' || v_type || '_';

  IF NOT EXISTS (SELECT 1 FROM public.asset_code_counters WHERE prefix = v_prefix) THEN
    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_seed
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);
  ELSE
    v_seed := 0;
  END IF;

  LOOP
    INSERT INTO public.asset_code_counters (prefix, last_seq)
    VALUES (v_prefix, v_seed + 1)
    ON CONFLICT (prefix) DO UPDATE
      SET last_seq = public.asset_code_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_code := v_prefix || lpad(v_seq::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE asset_code = v_code);

    -- Va chạm: có mã do đường khác (vd. duyệt hồ sơ khai báo) cấp. Nhảy bộ đếm tới số lớn nhất hiện có.
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

CREATE OR REPLACE FUNCTION public.peek_next_asset_code(
  p_region text DEFAULT 'VMT',
  p_province text DEFAULT 'DNG',
  p_type text DEFAULT 'BDS'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_region  text := upper(btrim(COALESCE(NULLIF(p_region, ''), 'VMT')));
  v_prov    text := upper(btrim(COALESCE(NULLIF(p_province, ''), 'DNG')));
  v_type    text := upper(btrim(COALESCE(NULLIF(p_type, ''), 'BDS')));
  v_prefix  text;
  v_last    bigint;
  v_next    bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly') THEN
    RAISE EXCEPTION 'Bạn không có quyền xem mã tài sản.' USING ERRCODE = '42501';
  END IF;
  IF v_region !~ '^[A-Z0-9]{2,8}$' OR v_prov !~ '^[A-Z0-9]{2,8}$' OR v_type !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'Mã vùng/tỉnh/loại tài sản không hợp lệ (chỉ chữ và số, 2-8 ký tự).' USING ERRCODE = '22023';
  END IF;

  v_prefix := v_region || '_' || v_prov || '_' || v_type || '_';

  SELECT last_seq INTO v_last FROM public.asset_code_counters WHERE prefix = v_prefix;
  IF v_last IS NULL THEN
    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_last
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);
  END IF;

  v_next := v_last + 1;
  IF EXISTS (SELECT 1 FROM public.assets WHERE asset_code = v_prefix || lpad(v_next::text, 8, '0')) THEN
    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0) + 1
    INTO v_next
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);
  END IF;

  RETURN v_prefix || lpad(v_next::text, 8, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.allocate_asset_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_asset_code(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.peek_next_asset_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peek_next_asset_code(text, text, text) TO authenticated;

COMMIT;

-- ROLLBACK: chạy lại nội dung 3 hàm trong 0078_asset_code_and_duplicate_rpc.sql.