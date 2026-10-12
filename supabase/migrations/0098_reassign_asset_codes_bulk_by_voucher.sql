-- 0098_reassign_asset_codes_bulk_by_voucher.sql
-- TÁI CẤP MÃ HÀNG LOẠT THEO PHIẾU NHẬP (dựa trên 0097).
-- Dùng khi nhập sai một loạt nhiều lô cùng một phiếu nhập (nhầm dự án / loại tài sản / cấu hình mã):
-- chọn theo MÃ PHIẾU NHẬP, KHÔNG cho chọn tay từng GCN để tránh nhầm sang lô khác.
-- Quy tắc:
--  * Chỉ nhận phiếu nhập loại 'checkin' lý do 'cấp mới' (phiếu sinh khi nhập mới). Phiếu có dòng khác loại/lý do bị từ chối.
--    Chỉ xét các dòng đã duyệt (status='approved').
--  * Mỗi GCN đi qua ĐÚNG hàm reassign_asset_code (0097): cùng kiểm quyền, cùng điều kiện chặn, cùng bảng lịch sử.
--    Quản lý kho: toàn bộ GCN của phiếu phải thuộc kho mình phụ trách, nếu không bị từ chối cả phiếu (không liệt kê GCN kho khác).
--  * TẤT CẢ HOẶC KHÔNG GÌ CẢ: có bất kỳ GCN nào vướng điều kiện chặn thì không GCN nào được đổi.
--    GCN đã đúng mã theo cấu hình hiện tại được BỎ QUA (skipped), không coi là lỗi.
--  * p_apply=false: xem trước toàn bộ danh sách mã cũ -> tiền tố mới, trạng thái từng GCN.
--    p_apply=true: áp dụng; nếu có GCN đã phát sinh lịch sử cần p_confirm_history=true (và chỉ admin/super_admin).
--  * Tối đa 2000 GCN mỗi phiếu.
--  * Lý do được ghi kèm "[Tái cấp theo phiếu <mã phiếu>]" vào asset_code_history và audit_logs của từng GCN;
--    thêm một dòng audit_logs tổng hợp (action 'reassign_asset_codes_bulk').
-- Rollback: ops/rollback/rollback_0098_reassign_asset_codes_bulk_by_voucher.sql
BEGIN;

DROP FUNCTION IF EXISTS public.reassign_asset_codes_bulk(text, text, uuid, text, boolean, boolean);

CREATE FUNCTION public.reassign_asset_codes_bulk(
  p_voucher_code        text,
  p_reason              text,
  p_new_project_id      uuid    DEFAULT NULL,
  p_new_collateral_type text    DEFAULT NULL,
  p_confirm_history     boolean DEFAULT false,
  p_apply               boolean DEFAULT false
)
RETURNS TABLE (
  r_asset_id       uuid,
  r_certificate_no text,
  r_old_code       text,
  r_new_prefix     text,
  r_new_code       text,
  r_status         text,     -- ready | skipped | error | applied
  r_message        text,
  r_has_history    boolean,
  r_applied        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_name     text;
  v_managed  uuid[];
  v_voucher  text := btrim(COALESCE(p_voucher_code, ''));
  v_reason   text := btrim(COALESCE(p_reason, ''));
  v_full     text;
  v_n_tx     integer;
  v_tx       uuid;
  v_n_items  integer;
  v_n_other  integer;
  v_n_out    integer;
  v_rec      record;
  v_x        record;
  v_rows     jsonb := '[]'::jsonb;
  v_n_ready  integer := 0;
  v_n_err    integer := 0;
  v_n_hist   integer := 0;
  v_errs     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, COALESCE(full_name, email), managed_warehouse_ids INTO v_role, v_name, v_managed
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền tái cấp mã tài sản.' USING ERRCODE = '42501';
  END IF;
  IF v_voucher = '' THEN
    RAISE EXCEPTION 'Cần nhập mã phiếu nhập kho.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Lý do tái cấp mã phải có ít nhất 10 ký tự.' USING ERRCODE = '22023';
  END IF;

  -- Phiếu phải thuộc đúng một giao dịch
  SELECT count(DISTINCT ti.transaction_id), min(ti.transaction_id::text)::uuid INTO v_n_tx, v_tx
    FROM public.transaction_items ti WHERE ti.voucher_code = v_voucher;
  IF v_n_tx = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu nhập "%".', v_voucher USING ERRCODE = 'P0002';
  END IF;
  IF v_n_tx > 1 THEN
    RAISE EXCEPTION 'Mã phiếu "%" thuộc nhiều giao dịch: liên hệ quản trị để xử lý.', v_voucher USING ERRCODE = '55000';
  END IF;

  -- Chỉ phiếu nhập "cấp mới"
  SELECT count(*) FILTER (WHERE ti.status = 'approved'),
         count(*) FILTER (WHERE ti.status = 'approved' AND NOT (ti.type = 'checkin' AND ti.reason = 'cấp mới'))
    INTO v_n_items, v_n_other
    FROM public.transaction_items ti WHERE ti.voucher_code = v_voucher;
  IF v_n_other > 0 THEN
    RAISE EXCEPTION 'Phiếu "%" không phải phiếu nhập cấp mới thuần: chỉ tái cấp hàng loạt theo phiếu nhập cấp mới.', v_voucher USING ERRCODE = '22023';
  END IF;
  IF v_n_items = 0 THEN
    RAISE EXCEPTION 'Phiếu "%" không có dòng đã duyệt.', v_voucher USING ERRCODE = '22023';
  END IF;
  IF v_n_items > 2000 THEN
    RAISE EXCEPTION 'Phiếu "%" có % GCN, vượt giới hạn 2000 GCN mỗi lần tái cấp.', v_voucher, v_n_items USING ERRCODE = '22023';
  END IF;

  -- Quản lý kho: cả phiếu phải thuộc kho mình phụ trách (không tiết lộ GCN kho khác)
  IF v_role = 'warehouse_manager' THEN
    SELECT count(*) INTO v_n_out
      FROM public.transaction_items ti JOIN public.assets a ON a.id = ti.asset_id
     WHERE ti.voucher_code = v_voucher AND ti.status = 'approved'
       AND (a.warehouse_id IS NULL OR NOT (a.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[]))));
    IF v_n_out > 0 THEN
      RAISE EXCEPTION 'Phiếu này có GCN ngoài kho bạn phụ trách: chỉ quản trị viên hoặc quản lý BTC được tái cấp cả phiếu.' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_full := format('[Tái cấp theo phiếu %s] %s', v_voucher, v_reason);

  -- Khóa toàn bộ GCN của phiếu theo thứ tự cố định (tránh tranh chấp)
  PERFORM 1 FROM public.assets a
   WHERE a.id IN (SELECT ti.asset_id FROM public.transaction_items ti WHERE ti.voucher_code = v_voucher AND ti.status = 'approved')
   ORDER BY a.id FOR UPDATE;

  -- Lượt 1: xem trước từng GCN qua reassign_asset_code (không ghi), gom lỗi
  FOR v_rec IN
    SELECT a.id, a.certificate_no, a.asset_code
      FROM public.transaction_items ti JOIN public.assets a ON a.id = ti.asset_id
     WHERE ti.voucher_code = v_voucher AND ti.status = 'approved'
     GROUP BY a.id, a.certificate_no, a.asset_code
     ORDER BY a.asset_code NULLS LAST, a.id
  LOOP
    BEGIN
      SELECT * INTO v_x FROM public.reassign_asset_code(v_rec.id, v_full, p_new_project_id, p_new_collateral_type, true, false);
      v_n_ready := v_n_ready + 1;
      IF v_x.r_has_history THEN v_n_hist := v_n_hist + 1; END IF;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_x.r_old_code, 'prefix', v_x.r_new_prefix,
        'status', 'ready', 'msg', CASE WHEN v_x.r_has_history THEN 'Đã phát sinh lịch sử: cần quản trị viên xác nhận' ELSE 'Sẵn sàng tái cấp' END,
        'hist', v_x.r_has_history));
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%đã đúng tiền tố%' THEN
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_rec.asset_code, 'prefix', NULL,
          'status', 'skipped', 'msg', 'Mã đã đúng theo cấu hình hiện tại: bỏ qua', 'hist', false));
      ELSE
        v_n_err := v_n_err + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_rec.asset_code, 'prefix', NULL,
          'status', 'error', 'msg', SQLERRM, 'hist', false));
      END IF;
    END;
  END LOOP;

  IF NOT p_apply THEN
    RETURN QUERY
    SELECT (j->>'id')::uuid, j->>'cert', j->>'old', j->>'prefix', NULL::text, j->>'status', j->>'msg',
           COALESCE((j->>'hist')::boolean, false), false
      FROM jsonb_array_elements(v_rows) AS j;
    RETURN;
  END IF;

  -- Áp dụng: tất cả hoặc không gì cả
  IF v_n_err > 0 THEN
    SELECT string_agg(j->>'cert' || ' (' || (j->>'msg') || ')', '; ') INTO v_errs
      FROM (SELECT j FROM jsonb_array_elements(v_rows) AS j WHERE j->>'status' = 'error' LIMIT 5) s;
    RAISE EXCEPTION 'BULK_BLOCKED: % GCN vướng điều kiện nên không GCN nào được đổi: %', v_n_err, v_errs USING ERRCODE = '55000';
  END IF;
  IF v_n_ready = 0 THEN
    RAISE EXCEPTION 'Không có GCN nào của phiếu "%" cần tái cấp (tất cả đã đúng mã theo cấu hình).', v_voucher USING ERRCODE = '22023';
  END IF;
  IF v_n_hist > 0 AND NOT COALESCE(p_confirm_history, false) THEN
    RAISE EXCEPTION 'HISTORY_UNCONFIRMED: % GCN đã phát sinh lịch sử, cần xác nhận rõ khi tái cấp mã.', v_n_hist USING ERRCODE = '22023';
  END IF;

  v_rows := '[]'::jsonb;
  FOR v_rec IN
    SELECT a.id, a.certificate_no, a.asset_code
      FROM public.transaction_items ti JOIN public.assets a ON a.id = ti.asset_id
     WHERE ti.voucher_code = v_voucher AND ti.status = 'approved'
     GROUP BY a.id, a.certificate_no, a.asset_code
     ORDER BY a.asset_code NULLS LAST, a.id
  LOOP
    BEGIN
      SELECT * INTO v_x FROM public.reassign_asset_code(v_rec.id, v_full, p_new_project_id, p_new_collateral_type, COALESCE(p_confirm_history, false), true);
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_x.r_old_code, 'prefix', v_x.r_new_prefix,
        'new', v_x.r_new_code, 'status', 'applied', 'msg', 'Đã tái cấp mã', 'hist', v_x.r_has_history));
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%đã đúng tiền tố%' THEN
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_rec.asset_code, 'prefix', NULL, 'new', NULL,
          'status', 'skipped', 'msg', 'Mã đã đúng theo cấu hình hiện tại: bỏ qua', 'hist', false));
      ELSE
        RAISE;   -- lỗi bất ngờ: hủy toàn bộ giao dịch
      END IF;
    END;
  END LOOP;

  INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
  VALUES (v_tx::text, 'reassign_asset_codes_bulk',
          jsonb_build_object('voucher_code', v_voucher),
          jsonb_build_object('voucher_code', v_voucher, 'reassigned', v_n_ready, 'skipped',
                             (SELECT count(*) FROM jsonb_array_elements(v_rows) j WHERE j->>'status' = 'skipped'),
                             'with_history', v_n_hist, 'new_project_id', p_new_project_id, 'new_collateral_type', p_new_collateral_type),
          v_uid, v_name, v_reason, now());

  RETURN QUERY
  SELECT (j->>'id')::uuid, j->>'cert', j->>'old', j->>'prefix', j->>'new', j->>'status', j->>'msg',
         COALESCE((j->>'hist')::boolean, false), (j->>'status') = 'applied'
    FROM jsonb_array_elements(v_rows) AS j;
END;
$function$;

REVOKE ALL ON FUNCTION public.reassign_asset_codes_bulk(text, text, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_asset_codes_bulk(text, text, uuid, text, boolean, boolean) TO authenticated;

COMMIT;