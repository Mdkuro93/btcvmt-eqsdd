-- 0078_asset_code_and_duplicate_rpc.sql
-- Phạm vi:
--  A. Prompt 5 - sinh mã tài sản và kiểm tra trùng GCN PHÍA MÁY CHỦ (client hiện so với danh sách bị Supabase cắt ở 1.000 dòng):
--     1. Bảng bộ đếm asset_code_counters (khóa theo tiền tố REGION_PROVINCE_TYPE_), không ai truy cập trực tiếp.
--     2. allocate_asset_code(region, province, type): cấp mã kế tiếp NGUYÊN TỬ; bỏ qua mã đã tồn tại; dùng khi LƯU.
--     3. peek_next_asset_code(...): xem trước mã kế tiếp, KHÔNG tăng bộ đếm (dùng để hiển thị khi đang nhập).
--     4. check_asset_duplicate(...): kiểm tra trùng theo đúng 3 quy tắc của client (số GCN, mã lô pháp lý, tờ bản đồ + thửa đất)
--        trên TOÀN BỘ dữ liệu; vai trò ngoài admin/btc chỉ nhận thông báo chung (không lộ GCN/dự án ngoài phạm vi).
--     5. 3 chỉ mục biểu thức để việc kiểm tra trùng không quét toàn bảng.
--  B. Sửa 2 lỗi nhỏ phát hiện khi kiểm thử:
--     - void_transaction_item: cột used_by của nhật ký hủy phiếu lại ghi tên người hủy (0077 vô tình ghi cố định 'BTC VMT').
--     - complete_inventory_audit: không ghi "Toàn bộ hồ sơ khớp" khi còn GCN chưa kiểm.
BEGIN;

-- ===== A.1 Bộ đếm =====
CREATE TABLE IF NOT EXISTS public.asset_code_counters (
  prefix     text PRIMARY KEY,
  last_seq   bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_code_counters FROM PUBLIC, anon, authenticated;

-- ===== A.2 Cấp mã (nguyên tử) =====
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

    v_try := v_try + 1;
    IF v_try > 1000 THEN
      RAISE EXCEPTION 'Không cấp được mã tài sản (quá nhiều mã đã tồn tại với tiền tố %).', v_prefix;
    END IF;
  END LOOP;

  RETURN v_code;
END;
$function$;

-- ===== A.3 Xem trước (không tăng bộ đếm) =====
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
  v_try     integer := 0;
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
  WHILE EXISTS (SELECT 1 FROM public.assets WHERE asset_code = v_prefix || lpad(v_next::text, 8, '0')) LOOP
    v_next := v_next + 1;
    v_try := v_try + 1;
    EXIT WHEN v_try > 1000;
  END LOOP;

  RETURN v_prefix || lpad(v_next::text, 8, '0');
END;
$function$;

-- ===== A.4 Kiểm tra trùng GCN =====
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

-- ===== A.5 Chỉ mục cho kiểm tra trùng =====
CREATE INDEX IF NOT EXISTS idx_assets_cert_norm
  ON public.assets (lower(btrim(certificate_no)));
CREATE INDEX IF NOT EXISTS idx_assets_project_lot_norm
  ON public.assets (project_id, lower(btrim(legal_lot_code)));
CREATE INDEX IF NOT EXISTS idx_assets_project_map_land_norm
  ON public.assets (project_id, lower(btrim(map_sheet_no)), lower(btrim(land_lot_no)));

-- ===== Quyền gọi =====
REVOKE ALL ON FUNCTION public.allocate_asset_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_asset_code(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.peek_next_asset_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peek_next_asset_code(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) TO authenticated;

-- ===== B. Sửa 2 lỗi nhỏ =====
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
  v_name         text;
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

  SELECT role, managed_warehouse_ids, COALESCE(full_name, email) INTO v_role, v_managed, v_name
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
    COALESCE(v_name, 'BTC VMT'),
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

CREATE OR REPLACE FUNCTION public.complete_inventory_audit(
  p_audit_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_role       text;
  v_managed    uuid[];
  v_audit      record;
  v_expected   integer;
  v_found      integer;
  v_missing    integer;
  v_misplaced  integer;
  v_surplus    integer;
  v_pending    integer;
  v_marked     integer := 0;
  v_relocated  integer := 0;
  v_stamp      text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY');
  v_tag_missing text;
  v_wh_name    text;
  v_list_miss  text;
  v_list_mis   text;
  v_list_sur   text;
  v_desc       text;
  v_notes_clean text := NULLIF(btrim(p_notes), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  SELECT role, managed_warehouse_ids INTO v_role, v_managed
  FROM public.profiles WHERE id = v_uid AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'quan_ly', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền hoàn tất đợt kiểm kê.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_audit FROM public.inventory_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đợt kiểm kê.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'warehouse_manager'
     AND NOT (v_audit.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'Đợt kiểm kê này không thuộc kho bạn quản lý.' USING ERRCODE = '42501';
  END IF;

  IF v_audit.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Đợt kiểm kê này đã hoàn tất, không thể hoàn tất lại.' USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE finding_status IN ('matched', 'misplaced', 'surplus')),
    count(*) FILTER (WHERE finding_status = 'missing'),
    count(*) FILTER (WHERE finding_status = 'misplaced'),
    count(*) FILTER (WHERE finding_status = 'surplus'),
    count(*) FILTER (WHERE finding_status = 'pending')
  INTO v_expected, v_found, v_missing, v_misplaced, v_surplus, v_pending
  FROM public.inventory_audit_items WHERE audit_id = p_audit_id;

  IF v_pending > 0 AND (v_notes_clean IS NULL OR char_length(v_notes_clean) < 10) THEN
    RAISE EXCEPTION 'Còn % GCN chưa kiểm. Cần nhập lý do chốt (tối thiểu 10 ký tự) để hoàn tất đợt kiểm kê.', v_pending
      USING ERRCODE = '22023';
  END IF;

  -- 3. GCN khuyết thiếu
  v_tag_missing := '[KIỂM KÊ KHO] Đánh dấu khuyết thiếu/thất lạc tại đợt kiểm kê ngày ' || v_stamp;
  WITH upd AS (
    UPDATE public.assets a
    SET custody_status = 'missing',
        notes = CASE WHEN a.notes IS NULL OR btrim(a.notes) = '' THEN v_tag_missing
                     ELSE a.notes || E'\n' || v_tag_missing END,
        updated_at = now()
    FROM public.inventory_audit_items i
    WHERE i.audit_id = p_audit_id
      AND i.finding_status = 'missing'
      AND i.asset_id = a.id
      AND (a.custody_status = 'in_stock' OR a.custody_status IS NULL)
    RETURNING a.id
  )
  SELECT count(*) INTO v_marked FROM upd;

  -- 4. GCN sai vị trí: cập nhật thẻ vị trí, giữ nguyên phần ghi chú khác
  WITH upd AS (
    UPDATE public.assets a
    SET notes = CASE
          WHEN a.notes ~ '\[Vị trí kho thực tế:[^\]]*\]' THEN
            regexp_replace(a.notes, '\[Vị trí kho thực tế:[^\]]*\]',
                           '[Vị trí kho thực tế: ' || left(translate(btrim(i.actual_location), E'\\[]', '/()'), 200) || ']')
          WHEN a.notes IS NULL OR btrim(a.notes) = '' THEN
            '[Vị trí kho thực tế: ' || left(translate(btrim(i.actual_location), E'\\[]', '/()'), 200) || ']'
          ELSE
            a.notes || E'\n' || '[Vị trí kho thực tế: ' || left(translate(btrim(i.actual_location), E'\\[]', '/()'), 200) || ']'
        END,
        updated_at = now()
    FROM public.inventory_audit_items i
    WHERE i.audit_id = p_audit_id
      AND i.finding_status = 'misplaced'
      AND i.asset_id = a.id
      AND i.actual_location IS NOT NULL AND btrim(i.actual_location) <> ''
    RETURNING a.id
  )
  SELECT count(*) INTO v_relocated FROM upd;

  -- 5. Chốt đợt kiểm kê
  UPDATE public.inventory_audits
  SET status = 'completed',
      completed_at = now(),
      notes = COALESCE(v_notes_clean, notes),
      total_expected = v_expected,
      total_found = v_found,
      total_missing = v_missing,
      total_misplaced = v_misplaced,
      total_surplus = v_surplus,
      updated_at = now()
  WHERE id = p_audit_id;

  -- 6. Nhật ký
  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = v_audit.warehouse_id;

  SELECT string_agg(certificate_no, ', ') INTO v_list_miss FROM (
    SELECT a.certificate_no FROM public.inventory_audit_items i JOIN public.assets a ON a.id = i.asset_id
    WHERE i.audit_id = p_audit_id AND i.finding_status = 'missing' ORDER BY a.certificate_no LIMIT 20) s;
  SELECT string_agg(certificate_no, ', ') INTO v_list_mis FROM (
    SELECT a.certificate_no FROM public.inventory_audit_items i JOIN public.assets a ON a.id = i.asset_id
    WHERE i.audit_id = p_audit_id AND i.finding_status = 'misplaced' ORDER BY a.certificate_no LIMIT 20) s;
  SELECT string_agg(certificate_no, ', ') INTO v_list_sur FROM (
    SELECT a.certificate_no FROM public.inventory_audit_items i JOIN public.assets a ON a.id = i.asset_id
    WHERE i.audit_id = p_audit_id AND i.finding_status = 'surplus' ORDER BY a.certificate_no LIMIT 20) s;

  v_desc := 'Hoàn tất đợt kiểm kê kho ' || COALESCE(v_wh_name, p_audit_id::text) ||
            '. Tìm thấy ' || v_found || '/' || v_expected || ' GCN.';
  IF v_missing + v_misplaced + v_surplus = 0 THEN
    IF v_pending = 0 THEN
      v_desc := v_desc || ' Toàn bộ hồ sơ khớp, không phát hiện chênh lệch.';
    ELSE
      v_desc := v_desc || ' Chưa phát hiện chênh lệch trong phần đã kiểm.';
    END IF;
  ELSE
    v_desc := v_desc || ' Chênh lệch:'
      || ' khuyết thiếu ' || v_missing || COALESCE(' [' || v_list_miss || CASE WHEN v_missing > 20 THEN ', ...' ELSE '' END || ']', '')
      || '; sai vị trí ' || v_misplaced || COALESCE(' [' || v_list_mis || CASE WHEN v_misplaced > 20 THEN ', ...' ELSE '' END || ']', '')
      || '; thừa ' || v_surplus || COALESCE(' [' || v_list_sur || CASE WHEN v_surplus > 20 THEN ', ...' ELSE '' END || ']', '')
      || '.';
  END IF;
  IF v_pending > 0 THEN
    v_desc := v_desc || ' Còn ' || v_pending || ' GCN chưa kiểm tại thời điểm hoàn tất. Lý do chốt khi chưa kiểm hết: ' || v_notes_clean || '.';
  END IF;
  IF v_missing > v_marked THEN
    v_desc := v_desc || ' ' || (v_missing - v_marked) || ' GCN khuyết thiếu không được đánh dấu do đã đổi trạng thái giữ trong lúc kiểm kê.';
  END IF;

  INSERT INTO public.activity_logs (
    log_date, action_type, document_no, description, used_by, notes, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE, 'Hoàn tất kiểm kê kho', 'KK-' || left(p_audit_id::text, 8), v_desc, 'Kiểm kê kho',
    COALESCE(v_notes_clean, 'Hoàn tất đối soát hiện trạng kho'), v_audit.warehouse_id, v_uid
  );

  RETURN jsonb_build_object(
    'audit_id', p_audit_id,
    'total_expected', v_expected,
    'total_found', v_found,
    'total_missing', v_missing,
    'total_misplaced', v_misplaced,
    'total_surplus', v_surplus,
    'total_pending', v_pending,
    'assets_marked_missing', v_marked,
    'assets_missing_skipped', v_missing - v_marked,
    'assets_relocated', v_relocated
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.void_transaction_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_transaction_item(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_inventory_audit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_inventory_audit(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK: DROP FUNCTION public.allocate_asset_code(text,text,text); DROP FUNCTION public.peek_next_asset_code(text,text,text);
--   DROP FUNCTION public.check_asset_duplicate(text,uuid,text,text,text,uuid); DROP TABLE public.asset_code_counters;
--   DROP INDEX public.idx_assets_cert_norm, public.idx_assets_project_lot_norm, public.idx_assets_project_map_land_norm;
--   Phần B: chạy lại nội dung hàm trong 0077_void_transaction_item_scoped.sql và 0076_complete_inventory_audit_require_reason.sql.