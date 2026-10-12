-- 0100_lock_asset_warehouse_correct_rpc.sql
-- KIỂM SOÁT ĐỔI KHO CỦA GCN: chuyển hàng thật CHỈ đi qua phiếu (luân chuyển kho / phiếu nhập-xuất);
-- sửa sai kho (nhập nhầm kho ban đầu) CHỈ do admin/super_admin thực hiện, có lý do và nhật ký.
--  1) Trigger trg_assets_warehouse_lock: chặn mọi lần đổi assets.warehouse_id đến từ TRÌNH DUYỆT (role authenticated/anon,
--     tức PostgREST: sửa GCN, cập nhật hàng loạt, nút "Chuyển kho" cũ...). Các hàm SECURITY DEFINER (luân chuyển, duyệt phiếu,
--     nhập hàng loạt...) chạy dưới quyền chủ hàm nên KHÔNG bị ảnh hưởng; SQL Editor (postgres) cũng không bị ảnh hưởng.
--     Chỉ chặn khi kho THỰC SỰ đổi: giữ nguyên giá trị kho (form sửa GCN gửi lại kho cũ) vẫn qua.
--  2) RPC correct_asset_warehouse(p_asset_ids, p_target_warehouse_id, p_reason, p_apply): sửa kho không phiếu.
--     Vai trò: admin, super_admin. Lý do >= 10 ký tự; 1..200 GCN. Xem trước (p_apply=false) rồi áp dụng.
--     Chặn: đang luân chuyển (in_transit), còn phiếu chờ duyệt, còn hồ sơ cấp đổi/tách chờ duyệt, đang thế chấp hoặc đã xuất kho
--     (khi đó kho không phản ánh vị trí thật: xử lý bằng phiếu nhập trước). GCN đã ở đúng kho đích: bỏ qua (skipped).
--     Tất cả hoặc không gì cả (WH_BLOCKED). Ghi audit_logs từng GCN (action 'correct_asset_warehouse': kho cũ/mới, lý do).
-- Rollback: ops/rollback/rollback_0100_lock_asset_warehouse_correct_rpc.sql
BEGIN;

CREATE OR REPLACE FUNCTION public._assets_warehouse_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Không được đổi kho của GCN trực tiếp. Chuyển hàng giữa các kho: dùng Luân chuyển kho. Sửa nhập nhầm kho: quản trị viên dùng "Sửa kho (không phiếu)".'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assets_warehouse_lock ON public.assets;
CREATE TRIGGER trg_assets_warehouse_lock
  BEFORE UPDATE OF warehouse_id ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public._assets_warehouse_lock();

DROP FUNCTION IF EXISTS public.correct_asset_warehouse(uuid[], uuid, text, boolean);

CREATE FUNCTION public.correct_asset_warehouse(
  p_asset_ids           uuid[],
  p_target_warehouse_id uuid,
  p_reason              text,
  p_apply               boolean DEFAULT false
)
RETURNS TABLE (
  r_asset_id       uuid,
  r_certificate_no text,
  r_old_warehouse  text,
  r_new_warehouse  text,
  r_status         text,     -- ready | skipped | error | applied
  r_message        text,
  r_applied        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_name    text;
  v_reason  text := btrim(COALESCE(p_reason, ''));
  v_ids     uuid[];
  v_wh_name text;
  v_rec     record;
  v_rows    jsonb := '[]'::jsonb;
  v_n_err   integer := 0;
  v_n_ready integer := 0;
  v_msg     text;
  v_st      text;
  v_errs    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, COALESCE(full_name, email) INTO v_role, v_name FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Chỉ quản trị viên được sửa kho không phiếu. Chuyển hàng giữa các kho: dùng Luân chuyển kho.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Lý do sửa kho phải có ít nhất 10 ký tự.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(COALESCE(p_asset_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR cardinality(v_ids) < 1 OR cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'Danh sách GCN phải từ 1 đến 200 mỗi lần.' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = p_target_warehouse_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kho đích.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.assets WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOR v_rec IN
    SELECT a.id, a.certificate_no, a.warehouse_id, a.custody_status, a.mortgage_status, w.name AS wh_name
      FROM public.assets a LEFT JOIN public.warehouses w ON w.id = a.warehouse_id
     WHERE a.id = ANY (v_ids)
     ORDER BY a.certificate_no, a.id
  LOOP
    v_st := 'ready'; v_msg := 'Sẵn sàng sửa kho';
    IF v_rec.warehouse_id IS NOT DISTINCT FROM p_target_warehouse_id THEN
      v_st := 'skipped'; v_msg := 'Đã ở kho đích: bỏ qua';
    ELSIF v_rec.custody_status = 'in_transit' THEN
      v_st := 'error'; v_msg := 'Đang luân chuyển giữa các kho: hoàn tất hoặc thu hồi lệnh luân chuyển trước';
    ELSIF EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.asset_id = v_rec.id AND ti.status = 'pending') THEN
      v_st := 'error'; v_msg := 'Còn phiếu chờ duyệt: xử lý phiếu trước';
    ELSIF EXISTS (SELECT 1 FROM public.asset_declaration_requests r WHERE r.old_asset_id = v_rec.id AND r.status = 'pending') THEN
      v_st := 'error'; v_msg := 'Còn hồ sơ cấp đổi/tách chờ duyệt: xử lý hồ sơ trước';
    ELSIF v_rec.mortgage_status = 'mortgaged' OR v_rec.custody_status = 'checked_out' THEN
      v_st := 'error'; v_msg := 'GCN đang thế chấp hoặc đã xuất kho (không ở kho): làm phiếu nhập trước rồi mới đổi kho';
    END IF;
    IF v_st = 'error' THEN v_n_err := v_n_err + 1; END IF;
    IF v_st = 'ready' THEN v_n_ready := v_n_ready + 1; END IF;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_rec.id, 'cert', v_rec.certificate_no, 'old', v_rec.wh_name, 'old_id', v_rec.warehouse_id,
      'new', v_wh_name, 'status', v_st, 'msg', v_msg));
  END LOOP;

  IF jsonb_array_length(v_rows) < cardinality(v_ids) THEN
    RAISE EXCEPTION 'Có GCN không tồn tại trong danh sách đã chọn.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_apply THEN
    RETURN QUERY
    SELECT (j->>'id')::uuid, j->>'cert', j->>'old', j->>'new', j->>'status', j->>'msg', false
      FROM jsonb_array_elements(v_rows) AS j;
    RETURN;
  END IF;

  IF v_n_err > 0 THEN
    SELECT string_agg(j->>'cert' || ' (' || (j->>'msg') || ')', '; ') INTO v_errs
      FROM (SELECT j FROM jsonb_array_elements(v_rows) AS j WHERE j->>'status' = 'error' LIMIT 5) s;
    RAISE EXCEPTION 'WH_BLOCKED: % GCN vướng điều kiện nên không GCN nào được đổi: %', v_n_err, v_errs USING ERRCODE = '55000';
  END IF;
  IF v_n_ready = 0 THEN
    RAISE EXCEPTION 'Không có GCN nào cần sửa kho (tất cả đã ở kho đích).' USING ERRCODE = '22023';
  END IF;

  FOR v_rec IN SELECT j FROM jsonb_array_elements(v_rows) AS j WHERE j->>'status' = 'ready' LOOP
    UPDATE public.assets SET warehouse_id = p_target_warehouse_id WHERE id = (v_rec.j->>'id')::uuid;
    INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
    VALUES (v_rec.j->>'id', 'correct_asset_warehouse',
            jsonb_build_object('warehouse_id', NULLIF(v_rec.j->>'old_id', '')::uuid, 'warehouse_name', v_rec.j->>'old'),
            jsonb_build_object('warehouse_id', p_target_warehouse_id, 'warehouse_name', v_wh_name),
            v_uid, v_name, v_reason, now());
  END LOOP;

  RETURN QUERY
  SELECT (j->>'id')::uuid, j->>'cert', j->>'old', j->>'new',
         CASE WHEN j->>'status' = 'ready' THEN 'applied' ELSE j->>'status' END,
         CASE WHEN j->>'status' = 'ready' THEN 'Đã sửa kho' ELSE j->>'msg' END,
         j->>'status' = 'ready'
    FROM jsonb_array_elements(v_rows) AS j;
END;
$function$;

REVOKE ALL ON FUNCTION public.correct_asset_warehouse(uuid[], uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_asset_warehouse(uuid[], uuid, text, boolean) TO authenticated;

COMMIT;