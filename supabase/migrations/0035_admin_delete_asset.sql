-- Migration 0035: Chức năng "Xóa GCN" chỉ dành cho admin, có lưu vết
--
-- Mục tiêu (theo yêu cầu vận hành): dữ liệu NHẬP SAI cần xóa được, nhưng CHỈ admin / super_admin được xóa,
-- có lý do bắt buộc, và mọi thứ bị xóa đều được chụp lại vào bảng lưu vết `deletion_audit`.
--
-- Gồm:
--   1. Bảng `deletion_audit`     : nhật ký xóa (chỉ admin đọc được; app không sửa/xóa được).
--   2. Trigger `guard_asset_delete`: chặn MỌI lệnh xóa trực tiếp trên `assets` (kể cả btc_manager hay tài khoản có
--                                   quyền asset.edit). Chỉ hai hàm dưới đây mới xóa được.
--   3. `admin_delete_asset(id, lý_do)`   : xóa 1 GCN + dữ liệu phụ thuộc, trong 1 giao dịch (lỗi là hoàn tác hết).
--   4. `admin_delete_assets(ids, lý_do)` : xóa nhiều GCN (tối đa 50), tất cả hoặc không gì cả.
--
-- KHÔNG xóa được (báo lỗi rõ ràng): sổ con hoặc sổ mẹ (tách sổ), GCN có liên kết tách/gộp, đang thế chấp,
-- đang xuất khỏi kho, còn phiếu chờ duyệt, có hồ sơ thế chấp còn hiệu lực.
-- Khi xóa: xóa các dòng phiếu (và phiếu nếu hết dòng), hồ sơ thế chấp đã giải chấp, lịch sử chuyển sở hữu;
-- nhật ký hoạt động được GIỮ LẠI (chỉ bỏ liên kết tới GCN); dòng kiểm kê của GCN bị xóa theo (đã có sẵn ON DELETE CASCADE).
--
-- Lưu ý mã phiếu: hệ thống tính mã phiếu kế tiếp từ mã lớn nhất còn tồn tại. Nếu xóa phiếu mới nhất thì mã đó có
-- thể được cấp lại cho phiếu sau.

-- ---------------------------------------------------------------------------
-- 1. Bảng lưu vết xóa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL DEFAULT 'asset',
  entity_id uuid NOT NULL,
  entity_label text,
  reason text NOT NULL,
  deleted_by uuid,
  deleted_by_email text,
  deleted_by_role text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);

ALTER TABLE public.deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deletion_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.deletion_audit TO authenticated;
GRANT ALL ON TABLE public.deletion_audit TO service_role;

DROP POLICY IF EXISTS "Admin xem nhat ky xoa" ON public.deletion_audit;
CREATE POLICY "Admin xem nhat ky xoa"
ON public.deletion_audit FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin') AND p.status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Chặn xóa trực tiếp trên assets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_asset_delete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Không có người dùng đăng nhập (SQL Editor / service_role): cho phép (người vận hành DB)
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  IF current_setting('app.allow_asset_delete', true) = 'on'
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin') AND p.status = 'active'
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Không được xóa GCN trực tiếp. Chỉ quản trị viên (admin) được xóa qua chức năng "Xóa GCN" có lưu vết.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_asset_delete ON public.assets;
CREATE TRIGGER trg_guard_asset_delete
BEFORE DELETE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.guard_asset_delete();

-- ---------------------------------------------------------------------------
-- 3. Xóa 1 GCN
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_asset(p_asset_id uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_status text;
  v_email text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_asset public.assets%ROWTYPE;
  v_asset_json jsonb;
  v_label text;
  v_n integer;
  v_items jsonb;
  v_tx_ids uuid[];
  v_empty_tx uuid[];
  v_txs jsonb;
  v_collaterals jsonb;
  v_logs jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_audit_items jsonb := '[]'::jsonb;
BEGIN
  -- Quyền: chỉ admin / super_admin đang active
  SELECT p.role, p.status, p.email INTO v_role, v_status, v_email
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_uid IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Chỉ quản trị viên (admin / super_admin) được xóa GCN.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do xóa (ít nhất 10 ký tự).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_asset FROM public.assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy GCN cần xóa (có thể đã bị xóa trước đó).' USING ERRCODE = 'P0002';
  END IF;

  v_asset_json := to_jsonb(v_asset);
  v_label := coalesce(v_asset_json->>'certificate_no', v_asset_json->>'asset_code', p_asset_id::text);

  -- ===== Các trường hợp KHÔNG được xóa =====
  IF v_asset_json->>'parent_asset_id' IS NOT NULL THEN
    RAISE EXCEPTION 'GCN % là sổ con (tách từ sổ khác) nên không xóa được, vì sẽ làm đứt chuỗi tách sổ.', v_label
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_n FROM public.assets WHERE parent_asset_id = p_asset_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GCN % là sổ mẹ của % sổ con nên không xóa được.', v_label, v_n USING ERRCODE = 'P0001';
  END IF;

  IF to_regclass('public.asset_lineage_links') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.asset_lineage_links WHERE asset_id = $1' INTO v_n USING p_asset_id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'GCN % có liên kết tách/gộp sổ nên không xóa được.', v_label USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF coalesce(v_asset_json->>'mortgage_status', 'none') <> 'none' THEN
    RAISE EXCEPTION 'GCN % đang thế chấp. Vui lòng giải chấp trước khi xóa.', v_label USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_asset_json->>'custody_status', 'in_stock') <> 'in_stock' THEN
    RAISE EXCEPTION 'GCN % đang xuất khỏi kho hoặc đang luân chuyển. Vui lòng hoàn tất việc trả/nhập kho trước khi xóa.', v_label
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transaction_items WHERE asset_id = p_asset_id AND status = 'pending') THEN
    RAISE EXCEPTION 'GCN % còn phiếu đang chờ duyệt. Vui lòng duyệt hoặc từ chối phiếu trước khi xóa.', v_label
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.collaterals WHERE asset_id = p_asset_id AND status = 'active') THEN
    RAISE EXCEPTION 'GCN % còn hồ sơ thế chấp đang hiệu lực. Vui lòng giải chấp trước khi xóa.', v_label
      USING ERRCODE = 'P0001';
  END IF;

  -- ===== Chụp lại dữ liệu sẽ bị xóa =====
  v_items := coalesce((SELECT jsonb_agg(to_jsonb(ti)) FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id), '[]'::jsonb);
  v_tx_ids := ARRAY(SELECT DISTINCT ti.transaction_id FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id);
  v_collaterals := coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.collaterals c WHERE c.asset_id = p_asset_id), '[]'::jsonb);
  v_logs := coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.activity_logs l WHERE l.asset_id = p_asset_id), '[]'::jsonb);

  IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.asset_ownership_transfers t WHERE t.asset_id = $1'
      INTO v_transfers USING p_asset_id;
  END IF;

  IF to_regclass('public.inventory_audit_items') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(i)), ''[]''::jsonb) FROM public.inventory_audit_items i WHERE i.asset_id = $1'
      INTO v_audit_items USING p_asset_id;
  END IF;

  -- ===== Xóa theo đúng thứ tự =====
  DELETE FROM public.transaction_items WHERE asset_id = p_asset_id;

  -- Phiếu chỉ bị xóa khi không còn dòng nào (phiếu nhiều GCN vẫn giữ lại cho các GCN khác)
  v_empty_tx := ARRAY(
    SELECT t FROM unnest(v_tx_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.transaction_items x WHERE x.transaction_id = t)
  );
  v_txs := coalesce((SELECT jsonb_agg(to_jsonb(tr)) FROM public.transactions tr WHERE tr.id = ANY(v_empty_tx)), '[]'::jsonb);

  UPDATE public.activity_logs SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
  UPDATE public.collaterals SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
  DELETE FROM public.transactions WHERE id = ANY(v_empty_tx);

  DELETE FROM public.collaterals WHERE asset_id = p_asset_id;
  UPDATE public.activity_logs SET asset_id = NULL WHERE asset_id = p_asset_id;

  IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.asset_ownership_transfers WHERE asset_id = $1' USING p_asset_id;
  END IF;

  PERFORM set_config('app.allow_asset_delete', 'on', true);
  DELETE FROM public.assets WHERE id = p_asset_id;
  PERFORM set_config('app.allow_asset_delete', 'off', true);

  INSERT INTO public.deletion_audit (entity_type, entity_id, entity_label, reason, deleted_by, deleted_by_email, deleted_by_role, snapshot)
  VALUES (
    'asset', p_asset_id, v_label, v_reason, v_uid, v_email, v_role,
    jsonb_build_object(
      'asset', v_asset_json,
      'transaction_items', v_items,
      'transactions', v_txs,
      'collaterals', v_collaterals,
      'activity_logs', v_logs,
      'ownership_transfers', v_transfers,
      'inventory_audit_items', v_audit_items
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'label', v_label,
    'removed', jsonb_build_object(
      'transaction_items', jsonb_array_length(v_items),
      'transactions', jsonb_array_length(v_txs),
      'collaterals', jsonb_array_length(v_collaterals),
      'ownership_transfers', jsonb_array_length(v_transfers),
      'inventory_audit_items', jsonb_array_length(v_audit_items),
      'activity_logs_unlinked', jsonb_array_length(v_logs)
    )
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Không thể xóa GCN % vì còn dữ liệu khác đang tham chiếu tới (%). Vui lòng liên hệ quản trị hệ thống.', v_label, SQLERRM
      USING ERRCODE = '23503';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Xóa nhiều GCN (tất cả hoặc không gì cả)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_assets(p_asset_ids uuid[], p_reason text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_asset_ids, '{}'::uuid[])) AS x);

  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn GCN nào để xóa.' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Mỗi lần chỉ được xóa tối đa 50 GCN.' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_results := v_results || jsonb_build_array(public.admin_delete_asset(v_id, p_reason));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'deleted', jsonb_array_length(v_results), 'items', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_asset(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_assets(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_asset(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_assets(uuid[], text) TO authenticated;

-- ==============================================================================
-- ROLLBACK (không xóa bảng deletion_audit để giữ dữ liệu lưu vết):
-- DROP TRIGGER IF EXISTS trg_guard_asset_delete ON public.assets;
-- DROP FUNCTION IF EXISTS public.guard_asset_delete();
-- DROP FUNCTION IF EXISTS public.admin_delete_assets(uuid[], text);
-- DROP FUNCTION IF EXISTS public.admin_delete_asset(uuid, text);
-- ==============================================================================