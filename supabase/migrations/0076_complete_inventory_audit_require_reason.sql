-- 0076_complete_inventory_audit_require_reason.sql
-- Phạm vi: CHỈ viết lại public.complete_inventory_audit(uuid,text) (giữ nguyên chữ ký, xây trên 0075).
-- Bổ sung: nếu còn GCN CHƯA KIỂM (finding_status='pending') khi hoàn tất thì BẮT BUỘC phải có lý do (p_notes, tối thiểu
--   10 ký tự). Thiếu lý do => lỗi 22023, không đổi gì. Lý do được ghi vào activity_logs để truy vết.
-- Phần còn lại giữ nguyên như 0075.
BEGIN;

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
    v_desc := v_desc || ' Toàn bộ hồ sơ khớp, không phát hiện chênh lệch.';
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

REVOKE ALL ON FUNCTION public.complete_inventory_audit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_inventory_audit(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK: chạy lại nội dung hàm trong 0075_complete_inventory_audit_rpc.sql