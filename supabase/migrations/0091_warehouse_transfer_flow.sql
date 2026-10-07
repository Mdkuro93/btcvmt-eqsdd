-- 0091_warehouse_transfer_flow.sql
-- LUÂN CHUYỂN GIỮA KHO theo luồng hai bước, nguyên tử:
--   1) Kho xuất (quản lý kho xuất / admin) lập phiếu xuất luân chuyển -> hệ thống TỰ SINH phiếu xuất (đã duyệt, có mã PX) và
--      phiếu nhập chờ ở kho đích. GCN chuyển 'in_transit' (vẫn thuộc kho xuất cho tới khi nhận xong).
--   2) Kho đích (quản lý kho đích / admin) đối chiếu rồi xác nhận nhận -> phiếu nhập duyệt (mã PN), GCN về 'in_stock' tại kho đích.
--      Nếu kho đích SỬA/ĐIỀU CHỈNH hoặc có chênh lệch: gửi ĐỀ XUẤT điều chỉnh (kèm ghi chú), GCN vẫn 'in_transit';
--      kho xuất (hoặc admin) kiểm tra: chấp nhận (áp điều chỉnh, hoàn tất nhận) hoặc từ chối (trả về kho đích xử lý lại).
--   3) Kho đích có thể TỪ CHỐI NHẬN (GCN về lại kho xuất); kho xuất có thể THU HỒI lệnh khi chưa nhận (GCN về lại kho xuất).
-- Ràng buộc: mọi thay đổi trên phiếu lý do 'luân chuyển' CHỈ đi qua các RPC dưới đây (trigger chặn đường khác, gồm decide_transaction_item
-- và void_transaction_item). Phiếu khác không được duyệt khi GCN đang chờ nhận luân chuyển.
-- Cờ nội bộ app.transfer_rpc chỉ bật trong thân RPC (set_config cục bộ giao dịch) và được TẮT trước khi RPC trả kết quả.
-- Không viết lại hàm cũ. Rollback: xem cuối file.
BEGIN;

-- ============ 1. CHECK lý do: thêm 'luân chuyển' ============
ALTER TABLE public.transaction_items DROP CONSTRAINT IF EXISTS transaction_items_reason_check;
ALTER TABLE public.transaction_items ADD CONSTRAINT transaction_items_reason_check CHECK (
  reason IS NULL OR reason = ANY (ARRAY[
    'mượn','thế chấp','chuyển nhượng','xuất bán','sang tên cho khách','tách sổ','thu hồi','đổi sổ','trả',
    'giải chấp','nhập sau bán','cấp mới','khác','luân chuyển'
  ]::text[])
);

-- ============ 2. Hàm phụ ============
-- Quyền theo kho: admin/super_admin/btc_manager luôn được; quản lý kho chỉ khi kho nằm trong danh sách mình quản lý. Trả về vai trò.
CREATE OR REPLACE FUNCTION public._transfer_assert_actor(p_wh uuid, p_label text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_managed uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT pf.role, pf.managed_warehouse_ids INTO v_role, v_managed
  FROM public.profiles pf WHERE pf.id = v_uid AND pf.status = 'active';
  IF v_role IN ('super_admin', 'admin', 'btc_manager') THEN
    RETURN v_role;
  END IF;
  IF v_role = 'warehouse_manager' AND p_wh IS NOT NULL AND p_wh = ANY (COALESCE(v_managed, ARRAY[]::uuid[])) THEN
    RETURN v_role;
  END IF;
  RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này (cần là quản lý %).', p_label USING ERRCODE = '42501';
END;
$function$;

-- Ảnh chụp thông tin GCN lúc xuất (để kho đích đối chiếu và kho xuất kiểm tra)
CREATE OR REPLACE FUNCTION public._transfer_snapshot(p_asset_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'certificate_no', a.certificate_no, 'legal_lot_code', a.legal_lot_code, 'area', a.area,
    'land_lot_no', a.land_lot_no, 'map_sheet_no', a.map_sheet_no, 'registry_no', a.registry_no,
    'registry_date', a.registry_date, 'usage_purpose', a.usage_purpose, 'usage_term_type', a.usage_term_type,
    'usage_term_date', a.usage_term_date, 'scan_file_url', a.scan_file_url, 'notes', a.notes)
  FROM public.assets a WHERE a.id = p_asset_id;
$function$;

-- Kiểm tra + chuẩn hóa đề xuất điều chỉnh (chỉ các trường KHÔNG định danh GCN; số GCN/mã lô/dự án phải sửa bằng chức năng riêng)
CREATE OR REPLACE FUNCTION public._transfer_validate_changes(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY['area','land_lot_no','map_sheet_no','registry_no','registry_date',
                                     'usage_purpose','usage_term_type','usage_term_date','scan_file_url','notes'];
  v_out jsonb := '{}'::jsonb;
  v_k   text;
  v_v   text;
  v_n   numeric;
BEGIN
  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Điều chỉnh phải là đối tượng JSON {trường: giá trị}.' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT (v_k = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Trường "%" không được điều chỉnh qua phiếu nhập luân chuyển (chỉ nhận: %). Số GCN, mã lô, dự án phải sửa bằng chức năng riêng.',
        v_k, array_to_string(v_allowed, ', ') USING ERRCODE = '22023';
    END IF;
    v_v := NULLIF(btrim(COALESCE(p_changes->>v_k, '')), '');
    IF v_v IS NULL THEN
      RAISE EXCEPTION 'Giá trị điều chỉnh của "%" không được để trống.', v_k USING ERRCODE = '22023';
    END IF;
    IF char_length(v_v) > 500 THEN
      RAISE EXCEPTION 'Giá trị điều chỉnh của "%" quá dài (tối đa 500 ký tự).', v_k USING ERRCODE = '22023';
    END IF;
    IF v_k = 'area' THEN
      v_n := public._bu_num(v_v, 'area');
      IF v_n IS NULL OR v_n <= 0 THEN
        RAISE EXCEPTION 'Diện tích phải lớn hơn 0.' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_k, v_n);
    ELSIF v_k IN ('registry_date', 'usage_term_date') THEN
      v_out := v_out || jsonb_build_object(v_k, public._bu_date(v_v, v_k));
    ELSIF v_k = 'usage_term_type' THEN
      IF v_v NOT IN ('fixed_date', 'long_term') THEN
        RAISE EXCEPTION 'usage_term_type chỉ nhận fixed_date hoặc long_term.' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_k, v_v);
    ELSIF v_k = 'scan_file_url' THEN
      IF NOT (v_v ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)' OR v_v ~ '^[A-Za-z0-9_./-]+$') THEN
        RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_k, v_v);
    ELSE
      v_out := v_out || jsonb_build_object(v_k, v_v);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$function$;

-- Ghi nhật ký hoạt động
CREATE OR REPLACE FUNCTION public._transfer_log(
  p_action text, p_doc text, p_desc text, p_notes text, p_asset uuid, p_tx uuid, p_wh uuid, p_used_by text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.activity_logs (
    log_date, action_type, document_no, description, used_by, notes, asset_id, transaction_id, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE, p_action, COALESCE(p_doc, 'CHƯA-SỐ'), p_desc, COALESCE(p_used_by, 'BTC VMT'), p_notes,
    p_asset, p_tx, p_wh, auth.uid()
  );
END;
$function$;

-- Hoàn tất nhận: cấp mã PN, phiếu nhập duyệt, GCN về kho đích. (Hàm nội bộ; luôn được gọi sau khi đã khóa dòng và kiểm quyền.)
CREATE OR REPLACE FUNCTION public._transfer_complete_receipt(p_in_item_id uuid, p_notes text, p_changes jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_in       public.transaction_items%ROWTYPE;
  v_out      public.transaction_items%ROWTYPE;
  v_asset    public.assets%ROWTYPE;
  v_t        jsonb;
  v_target   uuid;
  v_pn       text;
  v_tname    text;
  v_old      jsonb;
  v_name     text;
BEGIN
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  v_target := (v_t->>'target_warehouse_id')::uuid;
  SELECT * INTO v_out FROM public.transaction_items WHERE id = (v_t->>'pair_item_id')::uuid FOR UPDATE;
  SELECT * INTO v_asset FROM public.assets WHERE id = v_in.asset_id FOR UPDATE;
  SELECT w.name INTO v_tname FROM public.warehouses w WHERE w.id = v_target;

  -- Áp điều chỉnh đã được kho xuất chấp nhận (nếu có), ghi audit_logs (giá trị cũ/mới)
  IF p_changes IS NOT NULL AND p_changes <> '{}'::jsonb THEN
    v_old := public._transfer_snapshot(v_asset.id);
    UPDATE public.assets a SET
      area            = CASE WHEN p_changes ? 'area' THEN (p_changes->>'area')::numeric ELSE a.area END,
      land_lot_no     = CASE WHEN p_changes ? 'land_lot_no' THEN p_changes->>'land_lot_no' ELSE a.land_lot_no END,
      map_sheet_no    = CASE WHEN p_changes ? 'map_sheet_no' THEN p_changes->>'map_sheet_no' ELSE a.map_sheet_no END,
      registry_no     = CASE WHEN p_changes ? 'registry_no' THEN p_changes->>'registry_no' ELSE a.registry_no END,
      registry_date   = CASE WHEN p_changes ? 'registry_date' THEN (p_changes->>'registry_date')::date ELSE a.registry_date END,
      usage_purpose   = CASE WHEN p_changes ? 'usage_purpose' THEN p_changes->>'usage_purpose' ELSE a.usage_purpose END,
      usage_term_type = CASE WHEN p_changes ? 'usage_term_type' THEN p_changes->>'usage_term_type' ELSE a.usage_term_type END,
      usage_term_date = CASE WHEN p_changes ? 'usage_term_date' THEN (p_changes->>'usage_term_date')::date ELSE a.usage_term_date END,
      scan_file_url   = CASE WHEN p_changes ? 'scan_file_url' THEN p_changes->>'scan_file_url' ELSE a.scan_file_url END,
      notes           = CASE WHEN p_changes ? 'notes' THEN p_changes->>'notes' ELSE a.notes END
    WHERE a.id = v_asset.id;

    SELECT COALESCE(pf.full_name, pf.email) INTO v_name FROM public.profiles pf WHERE pf.id = v_uid;
    INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
    VALUES (v_asset.id::text, 'transfer_adjust',
            (SELECT jsonb_object_agg(k, v_old->k) FROM jsonb_object_keys(p_changes) k),
            p_changes, v_uid, v_name,
            'Điều chỉnh khi nhận luân chuyển, phiếu nhập ' || p_in_item_id::text, now());
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('btcvmt_voucher_code'));
  v_pn := public._next_voucher_code(v_target, 'PN');

  UPDATE public.transaction_items
  SET status = 'approved', voucher_code = v_pn, decided_by = v_uid, decided_at = now(),
      decision_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer', v_t || jsonb_build_object('stage', 'received', 'received_at', now(), 'received_by', v_uid))
  WHERE id = p_in_item_id;

  UPDATE public.transaction_items
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer',
        COALESCE(details->'transfer', '{}'::jsonb) || jsonb_build_object('stage', 'received', 'in_voucher_code', v_pn))
  WHERE id = v_out.id;

  UPDATE public.assets
  SET custody_status = 'in_stock', warehouse_id = v_target, current_holder_dept = NULL,
      expected_return_date = NULL, borrow_purpose = NULL, updated_at = now()
  WHERE id = v_asset.id;

  PERFORM public._transfer_log('Nhập kho luân chuyển', v_pn,
    'Nhập kho luân chuyển GCN ' || COALESCE(v_asset.certificate_no, '-') || ' từ phiếu xuất ' || COALESCE(v_out.voucher_code, '-')
      || CASE WHEN p_changes IS NOT NULL AND p_changes <> '{}'::jsonb THEN ' (có điều chỉnh đã được kho xuất chấp nhận)' ELSE '' END,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), v_asset.id, v_in.transaction_id, v_target, v_tname);
  RETURN v_pn;
END;
$function$;

-- Hoàn nguyên lệnh luân chuyển (từ chối nhận / thu hồi): GCN về lại kho xuất, phiếu xuất hủy, phiếu nhập từ chối/hủy
CREATE OR REPLACE FUNCTION public._transfer_revert(p_in_item_id uuid, p_reason text, p_by_receiver boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_in    public.transaction_items%ROWTYPE;
  v_out   public.transaction_items%ROWTYPE;
  v_asset public.assets%ROWTYPE;
  v_t     jsonb;
  v_src   uuid;
  v_label text;
BEGIN
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  v_src := (v_t->>'source_warehouse_id')::uuid;
  SELECT * INTO v_out FROM public.transaction_items WHERE id = (v_t->>'pair_item_id')::uuid FOR UPDATE;
  SELECT * INTO v_asset FROM public.assets WHERE id = v_in.asset_id FOR UPDATE;
  v_label := CASE WHEN p_by_receiver THEN 'Kho đích từ chối nhận' ELSE 'Kho xuất thu hồi lệnh luân chuyển' END;

  UPDATE public.transaction_items
  SET status = CASE WHEN p_by_receiver THEN 'rejected' ELSE 'cancelled' END,
      decided_by = v_uid, decided_at = now(), decision_notes = p_reason,
      details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer',
        v_t || jsonb_build_object('stage', CASE WHEN p_by_receiver THEN 'rejected_by_receiver' ELSE 'recalled' END))
  WHERE id = p_in_item_id;

  UPDATE public.transaction_items
  SET status = 'cancelled', voided_at = now(), voided_by = v_uid, void_reason = v_label || ': ' || p_reason,
      details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer',
        COALESCE(details->'transfer', '{}'::jsonb) || jsonb_build_object('stage', CASE WHEN p_by_receiver THEN 'rejected_by_receiver' ELSE 'recalled' END))
  WHERE id = v_out.id;

  UPDATE public.assets
  SET custody_status = 'in_stock', current_holder_dept = NULL, expected_return_date = NULL, borrow_purpose = NULL, updated_at = now()
  WHERE id = v_asset.id;

  PERFORM public._transfer_log('Hủy luân chuyển', v_out.voucher_code,
    v_label || ': GCN ' || COALESCE(v_asset.certificate_no, '-') || ' trở về lại kho xuất. Lý do: ' || p_reason,
    p_reason, v_asset.id, v_out.transaction_id, v_src, NULL);
END;
$function$;

-- ============ 3. Tạo lệnh luân chuyển (kho xuất / admin) ============
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer(
  p_asset_ids uuid[],
  p_target_warehouse_id uuid,
  p_notes text DEFAULT NULL,
  p_scan_url text DEFAULT NULL
)
RETURNS TABLE (r_asset_id uuid, r_certificate_no text, r_result text, r_message text,
               r_out_item_id uuid, r_in_item_id uuid, r_out_voucher text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_aid      uuid;
  v_asset    public.assets%ROWTYPE;
  v_tname    text;
  v_sname    text;
  v_notes    text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_scan     text := NULLIF(btrim(COALESCE(p_scan_url, '')), '');
  v_px_map   jsonb := '{}'::jsonb;
  v_pn_tx    uuid;
  v_px_tx    uuid;
  v_new_px   uuid;
  v_new_pn   uuid;
  v_px_item  uuid;
  v_pn_item  uuid;
  v_px_code  text;
  v_snap     jsonb;
  v_seen     uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM set_config('app.transfer_rpc', 'on', true);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  IF p_asset_ids IS NULL OR cardinality(p_asset_ids) < 1 OR cardinality(p_asset_ids) > 200 THEN
    RAISE EXCEPTION 'Danh sách GCN phải từ 1 đến 200 mỗi lần.' USING ERRCODE = '22023';
  END IF;
  IF p_target_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Cần chọn kho đích.' USING ERRCODE = '22023';
  END IF;
  IF v_scan IS NOT NULL AND NOT (v_scan ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)' OR v_scan ~ '^[A-Za-z0-9_./-]+$') THEN
    RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
  END IF;
  SELECT w.name INTO v_tname FROM public.warehouses w WHERE w.id = p_target_warehouse_id;
  IF v_tname IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy kho đích.' USING ERRCODE = 'P0002';
  END IF;

  FOREACH v_aid IN ARRAY p_asset_ids
  LOOP
    r_asset_id := v_aid; r_certificate_no := NULL; r_result := 'error'; r_message := NULL;
    r_out_item_id := NULL; r_in_item_id := NULL; r_out_voucher := NULL;
    BEGIN
      IF v_aid = ANY (v_seen) THEN
        RAISE EXCEPTION 'GCN bị lặp trong danh sách.' USING ERRCODE = '22023';
      END IF;
      v_seen := array_append(v_seen, v_aid);

      SELECT * INTO v_asset FROM public.assets WHERE id = v_aid FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy GCN.' USING ERRCODE = 'P0002';
      END IF;
      r_certificate_no := v_asset.certificate_no;
      IF v_asset.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'GCN chưa gắn kho xuất.' USING ERRCODE = '22023';
      END IF;
      PERFORM public._transfer_assert_actor(v_asset.warehouse_id, 'kho xuất');
      IF v_asset.warehouse_id = p_target_warehouse_id THEN
        RAISE EXCEPTION 'GCN đang ở chính kho đích, không cần luân chuyển.' USING ERRCODE = '22023';
      END IF;
      IF v_asset.lifecycle_status IS DISTINCT FROM 'active' OR v_asset.invalidation_type IS DISTINCT FROM 'NONE' THEN
        RAISE EXCEPTION 'GCN không còn hiệu lực (đã tách/đổi/vô hiệu), không thể luân chuyển.' USING ERRCODE = '22023';
      END IF;
      IF v_asset.custody_status IS DISTINCT FROM 'in_stock' THEN
        RAISE EXCEPTION 'GCN không đang lưu kho (trạng thái: %), không thể luân chuyển.', COALESCE(v_asset.custody_status, 'không rõ') USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.asset_id = v_aid AND ti.status = 'pending') THEN
        RAISE EXCEPTION 'GCN đang có phiếu chờ xử lý khác; hãy xử lý hoặc hủy phiếu đó trước.' USING ERRCODE = '22023';
      END IF;
      SELECT w.name INTO v_sname FROM public.warehouses w WHERE w.id = v_asset.warehouse_id;

      -- Tiêu đề phiếu: một phiếu xuất cho mỗi kho xuất, một phiếu nhập cho kho đích (chỉ ghi nhận sau khi dòng này thành công)
      v_px_tx := NULLIF(v_px_map->>(v_asset.warehouse_id::text), '')::uuid;
      v_new_px := NULL; v_new_pn := NULL;
      IF v_px_tx IS NULL THEN
        INSERT INTO public.transactions (type, notes, scan_url, created_by, warehouse_id, details)
        VALUES ('checkout', COALESCE(v_notes, 'Xuất luân chuyển sang ' || v_tname), v_scan, v_uid, v_asset.warehouse_id,
                jsonb_build_object('transfer', true, 'target_warehouse_id', p_target_warehouse_id))
        RETURNING id INTO v_new_px;
        v_px_tx := v_new_px;
      END IF;
      IF v_pn_tx IS NULL THEN
        INSERT INTO public.transactions (type, notes, scan_url, created_by, warehouse_id, details)
        VALUES ('checkin', COALESCE(v_notes, 'Nhập luân chuyển từ kho xuất'), v_scan, v_uid, p_target_warehouse_id,
                jsonb_build_object('transfer', true))
        RETURNING id INTO v_new_pn;
      END IF;

      PERFORM pg_advisory_xact_lock(hashtext('btcvmt_voucher_code'));
      v_px_code := public._next_voucher_code(v_asset.warehouse_id, 'PX');
      v_snap := public._transfer_snapshot(v_aid);

      INSERT INTO public.transaction_items (transaction_id, asset_id, type, reason, status, voucher_code, decided_by, decided_at, decision_notes, details)
      VALUES (v_px_tx, v_aid, 'checkout', 'luân chuyển', 'approved', v_px_code, v_uid, now(),
              'Xuất luân chuyển sang kho ' || v_tname,
              jsonb_build_object('reason', 'luân chuyển', 'transfer', jsonb_build_object(
                'stage', 'in_transit', 'source_warehouse_id', v_asset.warehouse_id, 'target_warehouse_id', p_target_warehouse_id,
                'out_voucher_code', v_px_code, 'snapshot', v_snap)))
      RETURNING id INTO v_px_item;

      INSERT INTO public.transaction_items (transaction_id, asset_id, type, reason, status, details)
      VALUES (COALESCE(v_new_pn, v_pn_tx), v_aid, 'checkin', 'luân chuyển', 'pending',
              jsonb_build_object('reason', 'luân chuyển', 'targetWarehouseId', p_target_warehouse_id, 'transfer', jsonb_build_object(
                'stage', 'awaiting_receipt', 'pair_item_id', v_px_item, 'source_warehouse_id', v_asset.warehouse_id,
                'target_warehouse_id', p_target_warehouse_id, 'out_voucher_code', v_px_code, 'snapshot', v_snap)))
      RETURNING id INTO v_pn_item;

      UPDATE public.transaction_items
      SET details = details || jsonb_build_object('transfer', (details->'transfer') || jsonb_build_object('pair_item_id', v_pn_item))
      WHERE id = v_px_item;

      UPDATE public.assets
      SET custody_status = 'in_transit', current_holder_dept = 'Đang luân chuyển sang kho ' || v_tname,
          expected_return_date = NULL, borrow_purpose = 'luân chuyển', updated_at = now()
      WHERE id = v_aid;

      PERFORM public._transfer_log('Xuất kho luân chuyển', v_px_code,
        'Xuất luân chuyển GCN ' || COALESCE(v_asset.certificate_no, '-') || ' từ kho ' || COALESCE(v_sname, '-') || ' sang kho ' || v_tname || ' (chờ kho đích xác nhận nhận)',
        v_notes, v_aid, v_px_tx, v_asset.warehouse_id, v_tname);

      -- Chỉ đến đây mới ghi nhận tiêu đề phiếu vào bộ nhớ (dòng thành công)
      v_px_map := v_px_map || jsonb_build_object(v_asset.warehouse_id::text, v_px_tx);
      IF v_pn_tx IS NULL THEN v_pn_tx := v_new_pn; END IF;
      r_result := 'created'; r_message := 'Đã xuất luân chuyển, chờ kho đích xác nhận nhận.';
      r_out_item_id := v_px_item; r_in_item_id := v_pn_item; r_out_voucher := v_px_code;
    EXCEPTION WHEN OTHERS THEN
      r_result := 'error'; r_message := SQLERRM; r_out_item_id := NULL; r_in_item_id := NULL; r_out_voucher := NULL;
    END;
    RETURN NEXT;
  END LOOP;
  PERFORM set_config('app.transfer_rpc', 'off', true);
  RETURN;
END;
$function$;

-- ============ 4. Kho đích xác nhận nhận / gửi đề xuất điều chỉnh ============
CREATE OR REPLACE FUNCTION public.confirm_warehouse_transfer_receipt(
  p_in_item_id uuid,
  p_notes text DEFAULT NULL,
  p_proposed_changes jsonb DEFAULT NULL,
  p_discrepancy_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_in      public.transaction_items%ROWTYPE;
  v_asset   public.assets%ROWTYPE;
  v_t       jsonb;
  v_target  uuid;
  v_changes jsonb;
  v_note    text := NULLIF(btrim(COALESCE(p_discrepancy_note, '')), '');
  v_pn      text;
BEGIN
  PERFORM set_config('app.transfer_rpc', 'on', true);
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id FOR UPDATE;
  IF NOT FOUND OR v_in.reason IS DISTINCT FROM 'luân chuyển' OR v_in.type IS DISTINCT FROM 'checkin' THEN
    RAISE EXCEPTION 'Không phải phiếu nhập luân chuyển.' USING ERRCODE = 'P0002';
  END IF;
  IF v_in.status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu nhập này không còn chờ xử lý (hiện là: %).', v_in.status USING ERRCODE = '22023';
  END IF;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  IF v_t->>'stage' NOT IN ('awaiting_receipt', 'adjustment_rejected') THEN
    RAISE EXCEPTION 'Phiếu đang chờ kho xuất kiểm tra đề xuất điều chỉnh, chưa thể xác nhận lại.' USING ERRCODE = '22023';
  END IF;
  v_target := (v_t->>'target_warehouse_id')::uuid;
  PERFORM public._transfer_assert_actor(v_target, 'kho đích');

  SELECT * INTO v_asset FROM public.assets WHERE id = v_in.asset_id FOR UPDATE;
  IF v_asset.custody_status IS DISTINCT FROM 'in_transit' THEN
    RAISE EXCEPTION 'GCN không ở trạng thái đang luân chuyển (hiện là: %).', COALESCE(v_asset.custody_status, 'không rõ') USING ERRCODE = '22023';
  END IF;

  v_changes := public._transfer_validate_changes(p_proposed_changes);
  IF v_changes <> '{}'::jsonb AND (v_note IS NULL OR char_length(v_note) < 10) THEN
    RAISE EXCEPTION 'Khi đề xuất điều chỉnh cần ghi chú chênh lệch (tối thiểu 10 ký tự).' USING ERRCODE = '22023';
  END IF;

  IF v_changes = '{}'::jsonb AND v_note IS NULL THEN
    -- Nhận đúng như lệnh xuất: hoàn tất
    v_pn := public._transfer_complete_receipt(p_in_item_id, p_notes, NULL);
    PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'received', 'voucher_code', v_pn);
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) < 10 THEN
    RAISE EXCEPTION 'Ghi chú chênh lệch cần tối thiểu 10 ký tự.' USING ERRCODE = '22023';
  END IF;

  -- Có sửa/điều chỉnh/chênh lệch: gửi cho kho xuất kiểm tra; GCN giữ nguyên in_transit
  UPDATE public.transaction_items
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer', v_t || jsonb_build_object(
        'stage', 'adjustment_proposed',
        'proposal', jsonb_build_object('changes', v_changes, 'discrepancy_note', v_note, 'notes', NULLIF(btrim(COALESCE(p_notes, '')), ''),
                                       'proposed_by', v_uid, 'proposed_at', now())))
  WHERE id = p_in_item_id;
  UPDATE public.transaction_items
  SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('transfer',
        COALESCE(details->'transfer', '{}'::jsonb) || jsonb_build_object('stage', 'adjustment_proposed'))
  WHERE id = (v_t->>'pair_item_id')::uuid;

  PERFORM public._transfer_log('Đề xuất điều chỉnh luân chuyển', v_t->>'out_voucher_code',
    'Kho đích đề xuất điều chỉnh khi nhận GCN ' || COALESCE(v_asset.certificate_no, '-') || ': ' || COALESCE(v_note, '(không có ghi chú)'),
    v_note, v_asset.id, v_in.transaction_id, v_target, NULL);
  PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'adjustment_proposed');
END;
$function$;

-- ============ 5. Kho xuất (hoặc admin) kiểm tra đề xuất điều chỉnh ============
CREATE OR REPLACE FUNCTION public.review_warehouse_transfer_adjustment(
  p_in_item_id uuid,
  p_accept boolean,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_in     public.transaction_items%ROWTYPE;
  v_t      jsonb;
  v_src    uuid;
  v_note   text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_pn     text;
  v_asset  public.assets%ROWTYPE;
BEGIN
  PERFORM set_config('app.transfer_rpc', 'on', true);
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Cần chọn chấp nhận hoặc từ chối.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id FOR UPDATE;
  IF NOT FOUND OR v_in.reason IS DISTINCT FROM 'luân chuyển' OR v_in.type IS DISTINCT FROM 'checkin' THEN
    RAISE EXCEPTION 'Không phải phiếu nhập luân chuyển.' USING ERRCODE = 'P0002';
  END IF;
  IF v_in.status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu nhập này không còn chờ xử lý (hiện là: %).', v_in.status USING ERRCODE = '22023';
  END IF;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  IF v_t->>'stage' IS DISTINCT FROM 'adjustment_proposed' THEN
    RAISE EXCEPTION 'Phiếu không có đề xuất điều chỉnh nào đang chờ kiểm tra.' USING ERRCODE = '22023';
  END IF;
  v_src := (v_t->>'source_warehouse_id')::uuid;
  PERFORM public._transfer_assert_actor(v_src, 'kho xuất');
  SELECT * INTO v_asset FROM public.assets WHERE id = v_in.asset_id FOR UPDATE;
  IF v_asset.custody_status IS DISTINCT FROM 'in_transit' THEN
    RAISE EXCEPTION 'GCN không ở trạng thái đang luân chuyển (hiện là: %).', COALESCE(v_asset.custody_status, 'không rõ') USING ERRCODE = '22023';
  END IF;

  IF p_accept THEN
    v_pn := public._transfer_complete_receipt(p_in_item_id, COALESCE(v_note, v_t#>>'{proposal,notes}'), COALESCE(v_t#>'{proposal,changes}', '{}'::jsonb));
    UPDATE public.transaction_items
    SET details = details || jsonb_build_object('transfer', (details->'transfer') || jsonb_build_object(
          'review', jsonb_build_object('accepted', true, 'notes', v_note, 'reviewed_by', v_uid, 'reviewed_at', now())))
    WHERE id = p_in_item_id;
    PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'received', 'voucher_code', v_pn);
  END IF;

  IF v_note IS NULL OR char_length(v_note) < 10 THEN
    RAISE EXCEPTION 'Khi từ chối đề xuất cần ghi rõ lý do (tối thiểu 10 ký tự).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.transaction_items
  SET details = details || jsonb_build_object('transfer', (details->'transfer') || jsonb_build_object(
        'stage', 'adjustment_rejected',
        'review', jsonb_build_object('accepted', false, 'notes', v_note, 'reviewed_by', v_uid, 'reviewed_at', now())))
  WHERE id = p_in_item_id;
  UPDATE public.transaction_items
  SET details = details || jsonb_build_object('transfer', (details->'transfer') || jsonb_build_object('stage', 'adjustment_rejected'))
  WHERE id = (v_t->>'pair_item_id')::uuid;

  PERFORM public._transfer_log('Từ chối điều chỉnh luân chuyển', v_t->>'out_voucher_code',
    'Kho xuất từ chối đề xuất điều chỉnh GCN ' || COALESCE(v_asset.certificate_no, '-') || ': ' || v_note,
    v_note, v_asset.id, v_in.transaction_id, v_src, NULL);
  PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'adjustment_rejected');
END;
$function$;

-- ============ 6. Kho đích từ chối nhận / kho xuất thu hồi lệnh ============
CREATE OR REPLACE FUNCTION public.reject_warehouse_transfer_receipt(p_in_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_in     public.transaction_items%ROWTYPE;
  v_t      jsonb;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM set_config('app.transfer_rpc', 'on', true);
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Cần ghi rõ lý do từ chối nhận (tối thiểu 10 ký tự).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id FOR UPDATE;
  IF NOT FOUND OR v_in.reason IS DISTINCT FROM 'luân chuyển' OR v_in.type IS DISTINCT FROM 'checkin' THEN
    RAISE EXCEPTION 'Không phải phiếu nhập luân chuyển.' USING ERRCODE = 'P0002';
  END IF;
  IF v_in.status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu nhập này không còn chờ xử lý (hiện là: %).', v_in.status USING ERRCODE = '22023';
  END IF;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  PERFORM public._transfer_assert_actor((v_t->>'target_warehouse_id')::uuid, 'kho đích');
  PERFORM public._transfer_revert(p_in_item_id, v_reason, true);
  PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'rejected_by_receiver');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_warehouse_transfer(p_in_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_in     public.transaction_items%ROWTYPE;
  v_t      jsonb;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM set_config('app.transfer_rpc', 'on', true);
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Cần ghi rõ lý do thu hồi lệnh (tối thiểu 10 ký tự).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_in FROM public.transaction_items WHERE id = p_in_item_id FOR UPDATE;
  IF NOT FOUND OR v_in.reason IS DISTINCT FROM 'luân chuyển' OR v_in.type IS DISTINCT FROM 'checkin' THEN
    RAISE EXCEPTION 'Không phải phiếu nhập luân chuyển.' USING ERRCODE = 'P0002';
  END IF;
  IF v_in.status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu nhập này không còn chờ xử lý (hiện là: %), không thu hồi được.', v_in.status USING ERRCODE = '22023';
  END IF;
  v_t := COALESCE(v_in.details->'transfer', '{}'::jsonb);
  PERFORM public._transfer_assert_actor((v_t->>'source_warehouse_id')::uuid, 'kho xuất');
  PERFORM public._transfer_revert(p_in_item_id, v_reason, false);
  PERFORM set_config('app.transfer_rpc', 'off', true);
    RETURN jsonb_build_object('stage', 'recalled');
END;
$function$;

-- ============ 7. Chốt chặn: phiếu luân chuyển chỉ đi qua RPC ở trên ============
CREATE OR REPLACE FUNCTION public.transaction_items_transfer_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(current_setting('app.transfer_rpc', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- 1) Phiếu lý do 'luân chuyển' không được tạo/sửa ngoài RPC chuyên dụng
  IF NEW.reason = 'luân chuyển' THEN
    RAISE EXCEPTION 'Phiếu luân chuyển giữa kho chỉ xử lý qua chức năng Luân chuyển kho (xác nhận nhận, từ chối, thu hồi), không dùng duyệt/hủy phiếu thông thường.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.reason = 'luân chuyển' THEN
      RAISE EXCEPTION 'Phiếu luân chuyển giữa kho chỉ xử lý qua chức năng Luân chuyển kho (xác nhận nhận, từ chối, thu hồi), không dùng duyệt/hủy phiếu thông thường.'
        USING ERRCODE = '42501';
    END IF;
    -- 2) Phiếu khác không được duyệt khi GCN đang chờ nhận luân chuyển
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
       AND EXISTS (SELECT 1 FROM public.transaction_items t
                   WHERE t.asset_id = NEW.asset_id AND t.id <> NEW.id
                     AND t.reason = 'luân chuyển' AND t.type = 'checkin' AND t.status = 'pending') THEN
      RAISE EXCEPTION 'GCN đang trong quá trình luân chuyển giữa kho, chưa thể duyệt phiếu khác. Hoàn tất hoặc thu hồi lệnh luân chuyển trước.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_transaction_items_transfer_guard ON public.transaction_items;
CREATE TRIGGER trg_transaction_items_transfer_guard
  BEFORE INSERT OR UPDATE ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION public.transaction_items_transfer_guard();

-- ============ 8. Quyền thực thi ============
REVOKE ALL ON FUNCTION public._transfer_assert_actor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transfer_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transfer_validate_changes(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transfer_log(text, text, text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transfer_complete_receipt(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transfer_revert(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_warehouse_transfer(uuid[], uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_warehouse_transfer_receipt(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_warehouse_transfer_adjustment(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_warehouse_transfer_receipt(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_warehouse_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_warehouse_transfer(uuid[], uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_warehouse_transfer_receipt(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_warehouse_transfer_adjustment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_warehouse_transfer_receipt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_warehouse_transfer(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK (trước khi có phiếu luân chuyển nào; nếu đã có phiếu thì xử lý/hủy chúng trước):
--   DROP TRIGGER trg_transaction_items_transfer_guard ON public.transaction_items;
--   DROP FUNCTION public.transaction_items_transfer_guard();
--   DROP FUNCTION public.cancel_warehouse_transfer(uuid, text);
--   DROP FUNCTION public.reject_warehouse_transfer_receipt(uuid, text);
--   DROP FUNCTION public.review_warehouse_transfer_adjustment(uuid, boolean, text);
--   DROP FUNCTION public.confirm_warehouse_transfer_receipt(uuid, text, jsonb, text);
--   DROP FUNCTION public.create_warehouse_transfer(uuid[], uuid, text, text);
--   DROP FUNCTION public._transfer_revert(uuid, text, boolean);
--   DROP FUNCTION public._transfer_complete_receipt(uuid, text, jsonb);
--   DROP FUNCTION public._transfer_log(text, text, text, text, uuid, uuid, uuid, text);
--   DROP FUNCTION public._transfer_validate_changes(jsonb);
--   DROP FUNCTION public._transfer_snapshot(uuid);
--   DROP FUNCTION public._transfer_assert_actor(uuid, text);
--   rồi khôi phục CHECK transaction_items_reason_check về bản không có 'luân chuyển' (xem inventory_functions_and_constraints.sql).