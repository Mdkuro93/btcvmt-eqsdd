-- 0097_reassign_asset_code.sql
-- TÁI CẤP MÃ TÀI SẢN có kiểm soát (thay cho việc sửa asset_code từ trình duyệt).
-- Dùng khi mã sinh ra sai do: (a) chọn nhầm DỰ ÁN, (b) chọn nhầm LOẠI TÀI SẢN, (c) cấu hình mã vùng/mã tỉnh sai
-- (đã sửa cấu hình rồi cần sinh lại). Mã KHÔNG phụ thuộc kho: kho sai thì dùng Chuyển kho / Luân chuyển.
-- Quy tắc:
--  * Vai trò: admin, super_admin, btc_manager (mọi kho) và warehouse_manager (CHỈ GCN thuộc kho mình phụ trách,
--    theo profiles.managed_warehouse_ids). Lý do >= 10 ký tự. Có xem trước (p_apply=false) rồi áp dụng.
--  * Chặn cứng: đang in_transit; còn phiếu chờ duyệt; còn hồ sơ khai báo chờ duyệt; mã đã đúng theo cấu hình hiện tại.
--  * "Đã phát sinh lịch sử" (có phiếu ngoài phiếu nhập 'cấp mới', kiểm kê, cấp đổi/tách, chuyển chủ sở hữu, đang thế chấp,
--    đang xuất kho): CHỈ admin/super_admin và phải xác nhận (p_confirm_history = true).
--  * Mã mới cấp bằng bộ đếm nguyên tử; mã cũ lưu vào assets.former_asset_codes (không bao giờ cấp lại);
--    LỊCH SỬ đầy đủ lưu ở bảng asset_code_history (chỉ ghi thêm: ai, vai trò, lúc nào, lý do, mã/dự án/loại/kho trước-sau)
--    và ghi audit_logs.
-- Rollback: ops/rollback/rollback_0097_reassign_asset_code.sql
BEGIN;

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS former_asset_codes text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.assets.former_asset_codes IS 'Các mã tài sản trước đây (đã bị tái cấp mã); không bao giờ cấp lại.';
CREATE INDEX IF NOT EXISTS idx_assets_former_asset_codes ON public.assets USING gin (former_asset_codes);

CREATE TABLE IF NOT EXISTS public.asset_code_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid NOT NULL,           -- không FK: lịch sử vẫn còn nếu tài sản bị xóa
  old_code             text,
  new_code             text NOT NULL,
  old_project_id       uuid,
  new_project_id       uuid,
  old_collateral_type  text,
  new_collateral_type  text,
  warehouse_id         uuid,                    -- kho của GCN tại thời điểm tái cấp
  had_history          boolean NOT NULL DEFAULT false,
  history              jsonb,
  reason               text NOT NULL,
  changed_by           uuid,
  changed_by_name      text,
  changed_by_role      text,
  changed_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_code_history_asset ON public.asset_code_history (asset_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_code_history_old_code ON public.asset_code_history (old_code);
CREATE INDEX IF NOT EXISTS idx_asset_code_history_new_code ON public.asset_code_history (new_code);
ALTER TABLE public.asset_code_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_code_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.asset_code_history TO authenticated;
-- Chỉ đọc, và chỉ thấy lịch sử của tài sản mà người dùng được thấy (RLS của bảng assets áp dụng trong điều kiện).
DROP POLICY IF EXISTS asset_code_history_select ON public.asset_code_history;
CREATE POLICY asset_code_history_select ON public.asset_code_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_code_history.asset_id));
-- Không có chính sách INSERT/UPDATE/DELETE: chỉ RPC reassign_asset_code (SECURITY DEFINER) ghi được; không ai sửa/xóa.

DROP FUNCTION IF EXISTS public.reassign_asset_code(uuid, text, uuid, text, boolean, boolean);

CREATE FUNCTION public.reassign_asset_code(
  p_asset_id          uuid,
  p_reason            text,
  p_new_project_id    uuid    DEFAULT NULL,
  p_new_collateral_type text  DEFAULT NULL,
  p_confirm_history   boolean DEFAULT false,
  p_apply             boolean DEFAULT false
)
RETURNS TABLE (
  r_old_code         text,
  r_new_prefix       text,
  r_new_code         text,
  r_has_history      boolean,
  r_history          jsonb,
  r_requires_confirm boolean,
  r_applied          boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_name    text;
  v_managed uuid[];
  v_reason  text := btrim(COALESCE(p_reason, ''));
  a         public.assets%ROWTYPE;
  v_proj    uuid;
  v_pname   text;
  v_area    uuid;
  v_aname   text;
  v_rname   text;
  v_rcode   text;
  v_pcode   text;
  v_ctype   text;
  v_prefix  text;
  v_n_tx    integer;
  v_n_audit integer;
  v_n_lin   integer;
  v_n_decl  integer;
  v_n_own   integer;
  v_hist    jsonb;
  v_has     boolean;
  v_new     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, COALESCE(full_name, email), managed_warehouse_ids INTO v_role, v_name, v_managed
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền tái cấp mã tài sản.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Lý do tái cấp mã phải có ít nhất 10 ký tự.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO a FROM public.assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài sản.' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'warehouse_manager'
     AND (a.warehouse_id IS NULL OR NOT (a.warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[])))) THEN
    RAISE EXCEPTION 'Bạn chỉ được tái cấp mã cho GCN thuộc kho mình phụ trách.' USING ERRCODE = '42501';
  END IF;
  IF a.custody_status = 'in_transit' THEN
    RAISE EXCEPTION 'GCN đang luân chuyển giữa các kho: hoàn tất hoặc thu hồi lệnh luân chuyển trước khi tái cấp mã.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.asset_id = a.id AND ti.status = 'pending') THEN
    RAISE EXCEPTION 'GCN còn phiếu chờ duyệt: xử lý phiếu trước khi tái cấp mã.' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.asset_declaration_requests r WHERE r.old_asset_id = a.id AND r.status = 'pending') THEN
    RAISE EXCEPTION 'GCN còn hồ sơ cấp đổi/tách chờ duyệt: xử lý hồ sơ trước khi tái cấp mã.' USING ERRCODE = '55000';
  END IF;

  -- Cấu hình mã theo DỰ ÁN (mới hoặc hiện tại) và LOẠI TÀI SẢN
  v_proj := COALESCE(p_new_project_id, a.project_id);
  IF v_proj IS NULL THEN
    RAISE EXCEPTION 'GCN chưa gắn dự án: chọn dự án để tái cấp mã.' USING ERRCODE = '22023';
  END IF;
  SELECT pr.name, ar.id, ar.name, rg.name,
         NULLIF(upper(btrim(COALESCE(rg.code, ''))), ''), NULLIF(upper(btrim(COALESCE(ar.province_code, ''))), '')
    INTO v_pname, v_area, v_aname, v_rname, v_rcode, v_pcode
  FROM public.projects pr
  LEFT JOIN public.areas ar ON ar.id = pr.area_id
  LEFT JOIN public.regions rg ON rg.id = ar.region_id
  WHERE pr.id = v_proj;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy dự án.' USING ERRCODE = 'P0002';
  END IF;
  IF v_area IS NULL THEN
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
  v_ctype := upper(btrim(COALESCE(NULLIF(btrim(COALESCE(p_new_collateral_type, '')), ''), a.collateral_type, 'BDS')));
  IF v_ctype !~ '^[A-Z0-9]{2,8}$' OR v_rcode !~ '^[A-Z0-9]{2,8}$' OR v_pcode !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'Mã vùng/mã tỉnh/loại tài sản không hợp lệ (2-8 ký tự chữ/số).' USING ERRCODE = '22023';
  END IF;
  v_prefix := v_rcode || '_' || v_pcode || '_' || v_ctype || '_';

  IF a.asset_code IS NOT NULL AND starts_with(a.asset_code, v_prefix) THEN
    RAISE EXCEPTION 'Mã hiện tại (%) đã đúng tiền tố theo cấu hình hiện tại (%): không cần tái cấp.', a.asset_code, v_prefix USING ERRCODE = '22023';
  END IF;

  -- Lịch sử đã phát sinh (phiếu nhập khởi tạo "cấp mới" không tính)
  SELECT count(*) INTO v_n_tx FROM public.transaction_items ti
   WHERE ti.asset_id = a.id AND NOT (ti.type = 'checkin' AND ti.reason = 'cấp mới');
  SELECT count(*) INTO v_n_audit FROM public.inventory_audit_items x WHERE x.asset_id = a.id;
  SELECT count(*) INTO v_n_lin   FROM public.asset_lineage_links x WHERE x.asset_id = a.id;
  SELECT count(*) INTO v_n_decl  FROM public.asset_declaration_requests x WHERE x.old_asset_id = a.id;
  SELECT count(*) INTO v_n_own   FROM public.asset_ownership_transfers x WHERE x.asset_id = a.id;
  v_hist := jsonb_build_object('transactions', v_n_tx, 'inventory_audits', v_n_audit, 'lineage', v_n_lin,
                               'declaration_requests', v_n_decl, 'ownership_transfers', v_n_own,
                               'mortgaged', (a.mortgage_status = 'mortgaged'),
                               'checked_out', (a.custody_status = 'checked_out'));
  v_has := (v_n_tx + v_n_audit + v_n_lin + v_n_decl + v_n_own) > 0
           OR a.mortgage_status = 'mortgaged' OR a.custody_status = 'checked_out';

  IF v_has AND v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'GCN đã phát sinh giao dịch/lịch sử: chỉ quản trị viên được tái cấp mã.' USING ERRCODE = '42501';
  END IF;

  r_old_code := a.asset_code;
  r_new_prefix := v_prefix;
  r_has_history := v_has;
  r_history := v_hist;
  r_requires_confirm := v_has;
  r_applied := false;
  r_new_code := NULL;

  IF p_apply THEN
    IF v_has AND NOT COALESCE(p_confirm_history, false) THEN
      RAISE EXCEPTION 'HISTORY_UNCONFIRMED: GCN đã phát sinh lịch sử, cần xác nhận rõ khi tái cấp mã.' USING ERRCODE = '22023';
    END IF;
    v_new := public._allocate_asset_code_by_prefix(v_prefix);
    UPDATE public.assets
       SET asset_code = v_new,
           project_id = v_proj,
           collateral_type = v_ctype,
           former_asset_codes = CASE WHEN a.asset_code IS NULL OR btrim(a.asset_code) = '' THEN former_asset_codes
                                     ELSE array_append(COALESCE(former_asset_codes, '{}'::text[]), a.asset_code) END
     WHERE id = a.id;
    INSERT INTO public.audit_logs (record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at)
    VALUES (a.id::text, 'reassign_asset_code',
            jsonb_build_object('asset_code', a.asset_code, 'project_id', a.project_id, 'collateral_type', a.collateral_type),
            jsonb_build_object('asset_code', v_new, 'project_id', v_proj, 'collateral_type', v_ctype, 'history', v_hist),
            v_uid, v_name, v_reason, now());
    INSERT INTO public.asset_code_history (asset_id, old_code, new_code, old_project_id, new_project_id,
           old_collateral_type, new_collateral_type, warehouse_id, had_history, history, reason,
           changed_by, changed_by_name, changed_by_role, changed_at)
    VALUES (a.id, a.asset_code, v_new, a.project_id, v_proj, a.collateral_type, v_ctype, a.warehouse_id,
            v_has, v_hist, v_reason, v_uid, v_name, v_role, now());
    r_new_code := v_new;
    r_applied := true;
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.reassign_asset_code(uuid, text, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_asset_code(uuid, text, uuid, text, boolean, boolean) TO authenticated;

COMMIT;
