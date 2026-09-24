-- ==============================================================================
-- Migration 0042: Quyền Xóa Cưỡng Chế GCN (Force Delete) cho Admin / Super Admin
-- ==============================================================================
-- Nâng cấp hàm `admin_delete_asset` để hỗ trợ xóa GCN kể cả khi có liên kết
-- phả hệ (sổ mẹ / sổ con) hoặc lịch sử giao dịch:
--   Bước 1: Gỡ bỏ liên kết phả hệ parent_asset_id = NULL ở cả 2 bảng assets và
--           asset_declaration_requests đối với các sổ con liên quan.
--   Bước 2: Xóa các đề xuất liên quan trong asset_declaration_requests
--           (old_asset_id, resulting_asset_id, parent_asset_id).
--   Bước 3: Xóa các dòng lịch sử chi tiết trong transaction_items liên quan đến asset_id,
--           đồng thời dọn dẹp các transactions bị rỗng.
--   Bước 4: Xóa nhật ký hoạt động trong activity_logs liên quan đến asset_id
--           (tránh lỗi khóa ngoại activity_logs_asset_id_fkey), kèm collaterals/transfers.
--   Bước 5: Thực thi xóa tài sản trong bảng assets.
--   Bước 6: Ghi nhật ký kiểm toán vào deletion_audit để đảm bảo tính lưu vết.
-- ==============================================================================

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
  v_items jsonb;
  v_tx_ids uuid[];
  v_empty_tx uuid[];
  v_txs jsonb;
  v_collaterals jsonb;
  v_logs jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_audit_items jsonb := '[]'::jsonb;
  v_declaration_reqs jsonb := '[]'::jsonb;
  v_child_count integer := 0;
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

  -- ===== CHỤP LẠI TOÀN BỘ DỮ LIỆU SẼ BỊ XÓA / THAY ĐỔI ĐỂ LƯU VẾT KIỂM TOÁN =====
  v_items := coalesce((SELECT jsonb_agg(to_jsonb(ti)) FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id), '[]'::jsonb);
  v_tx_ids := ARRAY(SELECT DISTINCT ti.transaction_id FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id);
  v_collaterals := coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.collaterals c WHERE c.asset_id = p_asset_id), '[]'::jsonb);
  v_logs := coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.activity_logs l WHERE l.asset_id = p_asset_id), '[]'::jsonb);

  IF to_regclass('public.asset_declaration_requests') IS NOT NULL THEN
    v_declaration_reqs := coalesce((
      SELECT jsonb_agg(to_jsonb(adr))
      FROM public.asset_declaration_requests adr
      WHERE adr.old_asset_id = p_asset_id
         OR adr.resulting_asset_id = p_asset_id
         OR adr.parent_asset_id = p_asset_id
    ), '[]'::jsonb);
  END IF;

  IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.asset_ownership_transfers t WHERE t.asset_id = $1'
      INTO v_transfers USING p_asset_id;
  END IF;

  IF to_regclass('public.inventory_audit_items') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(i)), ''[]''::jsonb) FROM public.inventory_audit_items i WHERE i.asset_id = $1'
      INTO v_audit_items USING p_asset_id;
  END IF;

  -- ===== BƯỚC 1: GỠ BỎ LIÊN KẾT PHẢ HỆ (parent_asset_id = NULL) ĐỐI VỚI CÁC SỔ CON =====
  SELECT count(*) INTO v_child_count FROM public.assets WHERE parent_asset_id = p_asset_id;

  UPDATE public.assets
  SET parent_asset_id = NULL
  WHERE parent_asset_id = p_asset_id;

  IF to_regclass('public.asset_declaration_requests') IS NOT NULL THEN
    UPDATE public.asset_declaration_requests
    SET parent_asset_id = NULL
    WHERE parent_asset_id = p_asset_id;
  END IF;

  IF to_regclass('public.asset_lineage_links') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.asset_lineage_links WHERE asset_id = $1 OR parent_asset_id = $1' USING p_asset_id;
  END IF;

  -- ===== BƯỚC 2: XÓA ĐỀ XUẤT LIÊN QUAN TRONG asset_declaration_requests =====
  IF to_regclass('public.asset_declaration_requests') IS NOT NULL THEN
    DELETE FROM public.asset_declaration_requests
    WHERE old_asset_id = p_asset_id
       OR resulting_asset_id = p_asset_id
       OR parent_asset_id = p_asset_id;
  END IF;

  -- ===== BƯỚC 3: XÓA DÒNG LỊCH SỬ TRONG transaction_items LIÊN QUAN ĐẾN asset_id =====
  DELETE FROM public.transaction_items WHERE asset_id = p_asset_id;

  -- Dọn dẹp phiếu transactions nếu không còn dòng nào
  v_empty_tx := ARRAY(
    SELECT t FROM unnest(v_tx_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.transaction_items x WHERE x.transaction_id = t)
  );
  v_txs := coalesce((SELECT jsonb_agg(to_jsonb(tr)) FROM public.transactions tr WHERE tr.id = ANY(v_empty_tx)), '[]'::jsonb);

  UPDATE public.activity_logs SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
  IF to_regclass('public.collaterals') IS NOT NULL THEN
    UPDATE public.collaterals SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
  END IF;
  DELETE FROM public.transactions WHERE id = ANY(v_empty_tx);

  -- ===== BƯỚC 4: XÓA NHẬT KÝ HOẠT ĐỘNG TRONG activity_logs LIÊN QUAN ĐẾN asset_id =====
  DELETE FROM public.activity_logs WHERE asset_id = p_asset_id;

  -- Dọn dẹp các bảng phụ thuộc khác (thế chấp, kiểm kê, chuyển nhượng)
  IF to_regclass('public.collaterals') IS NOT NULL THEN
    DELETE FROM public.collaterals WHERE asset_id = p_asset_id;
  END IF;

  IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.asset_ownership_transfers WHERE asset_id = $1' USING p_asset_id;
  END IF;

  IF to_regclass('public.inventory_audit_items') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.inventory_audit_items WHERE asset_id = $1' USING p_asset_id;
  END IF;

  -- ===== BƯỚC 5: THỰC THI XÓA TÀI SẢN TRONG BẢNG assets =====
  PERFORM set_config('app.allow_asset_delete', 'on', true);
  DELETE FROM public.assets WHERE id = p_asset_id;
  PERFORM set_config('app.allow_asset_delete', 'off', true);

  -- ===== BƯỚC 6: GHI NHẬT KÝ KIỂM TOÁN VÀO deletion_audit =====
  INSERT INTO public.deletion_audit (
    entity_type, entity_id, entity_label, reason,
    deleted_by, deleted_by_email, deleted_by_role, snapshot
  ) VALUES (
    'asset', p_asset_id, v_label, v_reason,
    v_uid, v_email, v_role,
    jsonb_build_object(
      'asset', v_asset_json,
      'transaction_items', v_items,
      'transactions', v_txs,
      'collaterals', v_collaterals,
      'activity_logs', v_logs,
      'ownership_transfers', v_transfers,
      'inventory_audit_items', v_audit_items,
      'declaration_requests', v_declaration_reqs,
      'unlinked_children_count', v_child_count
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
      'activity_logs_deleted', jsonb_array_length(v_logs),
      'declaration_requests_deleted', jsonb_array_length(v_declaration_reqs),
      'unlinked_children', v_child_count
    )
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    PERFORM set_config('app.allow_asset_delete', 'off', true);
    RAISE EXCEPTION 'Không thể xóa GCN % vì còn dữ liệu khác đang tham chiếu tới (%). Vui lòng liên hệ quản trị hệ thống.', v_label, SQLERRM
      USING ERRCODE = '23503';
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_asset_delete', 'off', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_asset(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_asset(uuid, text) TO authenticated;

-- ==============================================================================
-- ROLLBACK (phiên bản hàm admin_delete_asset cũ từ migration 0035):
--
-- CREATE OR REPLACE FUNCTION public.admin_delete_asset(p_asset_id uuid, p_reason text) RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_uid uuid := auth.uid();
--   v_role text;
--   v_status text;
--   v_email text;
--   v_reason text := btrim(coalesce(p_reason, ''));
--   v_asset public.assets%ROWTYPE;
--   v_asset_json jsonb;
--   v_label text;
--   v_n integer;
--   v_items jsonb;
--   v_tx_ids uuid[];
--   v_empty_tx uuid[];
--   v_txs jsonb;
--   v_collaterals jsonb;
--   v_logs jsonb;
--   v_transfers jsonb := '[]'::jsonb;
--   v_audit_items jsonb := '[]'::jsonb;
-- BEGIN
--   SELECT p.role, p.status, p.email INTO v_role, v_status, v_email
--   FROM public.profiles p WHERE p.id = v_uid;
--   IF v_uid IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') OR v_status IS DISTINCT FROM 'active' THEN
--     RAISE EXCEPTION 'Chỉ quản trị viên (admin / super_admin) được xóa GCN.' USING ERRCODE = '42501';
--   END IF;
--   IF char_length(v_reason) < 10 THEN
--     RAISE EXCEPTION 'Vui lòng nhập lý do xóa (ít nhất 10 ký tự).' USING ERRCODE = '22023';
--   END IF;
--   SELECT * INTO v_asset FROM public.assets WHERE id = p_asset_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Không tìm thấy GCN cần xóa (có thể đã bị xóa trước đó).' USING ERRCODE = 'P0002';
--   END IF;
--   v_asset_json := to_jsonb(v_asset);
--   v_label := coalesce(v_asset_json->>'certificate_no', v_asset_json->>'asset_code', p_asset_id::text);
--   IF v_asset_json->>'parent_asset_id' IS NOT NULL THEN
--     RAISE EXCEPTION 'GCN % là sổ con (tách từ sổ khác) nên không xóa được, vì sẽ làm đứt chuỗi tách sổ.', v_label USING ERRCODE = 'P0001';
--   END IF;
--   SELECT count(*) INTO v_n FROM public.assets WHERE parent_asset_id = p_asset_id;
--   IF v_n > 0 THEN
--     RAISE EXCEPTION 'GCN % là sổ mẹ của % sổ con nên không xóa được.', v_label, v_n USING ERRCODE = 'P0001';
--   END IF;
--   IF to_regclass('public.asset_lineage_links') IS NOT NULL THEN
--     EXECUTE 'SELECT count(*) FROM public.asset_lineage_links WHERE asset_id = $1' INTO v_n USING p_asset_id;
--     IF v_n > 0 THEN
--       RAISE EXCEPTION 'GCN % có liên kết tách/gộp sổ nên không xóa được.', v_label USING ERRCODE = 'P0001';
--     END IF;
--   END IF;
--   IF coalesce(v_asset_json->>'mortgage_status', 'none') <> 'none' THEN
--     RAISE EXCEPTION 'GCN % đang thế chấp. Vui lòng giải chấp trước khi xóa.', v_label USING ERRCODE = 'P0001';
--   END IF;
--   IF coalesce(v_asset_json->>'custody_status', 'in_stock') <> 'in_stock' THEN
--     RAISE EXCEPTION 'GCN % đang xuất khỏi kho hoặc đang luân chuyển. Vui lòng hoàn tất việc trả/nhập kho trước khi xóa.', v_label USING ERRCODE = 'P0001';
--   END IF;
--   IF EXISTS (SELECT 1 FROM public.transaction_items WHERE asset_id = p_asset_id AND status = 'pending') THEN
--     RAISE EXCEPTION 'GCN % còn phiếu đang chờ duyệt. Vui lòng duyệt hoặc từ chối phiếu trước khi xóa.', v_label USING ERRCODE = 'P0001';
--   END IF;
--   IF EXISTS (SELECT 1 FROM public.collaterals WHERE asset_id = p_asset_id AND status = 'active') THEN
--     RAISE EXCEPTION 'GCN % còn hồ sơ thế chấp đang hiệu lực. Vui lòng giải chấp trước khi xóa.', v_label USING ERRCODE = 'P0001';
--   END IF;
--   v_items := coalesce((SELECT jsonb_agg(to_jsonb(ti)) FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id), '[]'::jsonb);
--   v_tx_ids := ARRAY(SELECT DISTINCT ti.transaction_id FROM public.transaction_items ti WHERE ti.asset_id = p_asset_id);
--   v_collaterals := coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.collaterals c WHERE c.asset_id = p_asset_id), '[]'::jsonb);
--   v_logs := coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.activity_logs l WHERE l.asset_id = p_asset_id), '[]'::jsonb);
--   IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
--     EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.asset_ownership_transfers t WHERE t.asset_id = $1'
--       INTO v_transfers USING p_asset_id;
--   END IF;
--   IF to_regclass('public.inventory_audit_items') IS NOT NULL THEN
--     EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(i)), ''[]''::jsonb) FROM public.inventory_audit_items i WHERE i.asset_id = $1'
--       INTO v_audit_items USING p_asset_id;
--   END IF;
--   DELETE FROM public.transaction_items WHERE asset_id = p_asset_id;
--   v_empty_tx := ARRAY(
--     SELECT t FROM unnest(v_tx_ids) AS t
--     WHERE NOT EXISTS (SELECT 1 FROM public.transaction_items x WHERE x.transaction_id = t)
--   );
--   v_txs := coalesce((SELECT jsonb_agg(to_jsonb(tr)) FROM public.transactions tr WHERE tr.id = ANY(v_empty_tx)), '[]'::jsonb);
--   UPDATE public.activity_logs SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
--   UPDATE public.collaterals SET transaction_id = NULL WHERE transaction_id = ANY(v_empty_tx);
--   DELETE FROM public.transactions WHERE id = ANY(v_empty_tx);
--   DELETE FROM public.collaterals WHERE asset_id = p_asset_id;
--   UPDATE public.activity_logs SET asset_id = NULL WHERE asset_id = p_asset_id;
--   IF to_regclass('public.asset_ownership_transfers') IS NOT NULL THEN
--     EXECUTE 'DELETE FROM public.asset_ownership_transfers WHERE asset_id = $1' USING p_asset_id;
--   END IF;
--   PERFORM set_config('app.allow_asset_delete', 'on', true);
--   DELETE FROM public.assets WHERE id = p_asset_id;
--   PERFORM set_config('app.allow_asset_delete', 'off', true);
--   INSERT INTO public.deletion_audit (entity_type, entity_id, entity_label, reason, deleted_by, deleted_by_email, deleted_by_role, snapshot)
--   VALUES (
--     'asset', p_asset_id, v_label, v_reason, v_uid, v_email, v_role,
--     jsonb_build_object('asset', v_asset_json, 'transaction_items', v_items, 'transactions', v_txs, 'collaterals', v_collaterals, 'activity_logs', v_logs, 'ownership_transfers', v_transfers, 'inventory_audit_items', v_audit_items)
--   );
--   RETURN jsonb_build_object('success', true, 'asset_id', p_asset_id, 'label', v_label);
-- END;
-- $$;
-- ==============================================================================
