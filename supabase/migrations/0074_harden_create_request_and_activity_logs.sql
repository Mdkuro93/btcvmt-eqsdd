-- 0074_harden_create_request_and_activity_logs.sql
-- PHẦN A: public.create_transaction_request(text,text,jsonb,text)
--   Trước: SECURITY DEFINER, chỉ kiểm tra "hồ sơ active" => bất kỳ vai trò nào (kể cả supervisor/quan_ly/chuyen_vien)
--          tạo được phiếu cho MỌI GCN với MỌI lý do; không kiểm tra p_type, số lượng, GCN tồn tại/còn hiệu lực,
--          link scan, trùng phiếu chờ duyệt. Quy tắc RLS ở 0039 bị bỏ qua vì hàm chạy quyền chủ sở hữu.
--   Sau: đưa quy tắc 0039 vào RPC:
--        - admin/super_admin/btc_manager/warehouse_manager: mọi lý do (như 0039).
--        - capital_dept / project_dept / re_dept: đúng bảng lý do theo vai trò + trong phạm vi assigned_warehouse_ids
--          (rỗng/NULL = mọi kho, như 0039).
--        - investor: mượn/trả/khác, CHỈ GCN thuộc owner_entity_ids (bắt buộc khác rỗng; chặt hơn 0039).
--        - vai trò khác: bị chặn.
--        - p_type ∈ {checkout, checkin}; 1..500 mục; mỗi mục: GCN tồn tại + lifecycle 'active', reason hợp lệ (13 lý do),
--          không trùng GCN trong phiếu, không có phiếu CHỜ DUYỆT cùng loại cho GCN đó, link scan đúng định dạng 0071.
--   Giữ nguyên chữ ký và định dạng kết quả JSON.
-- PHẦN B: ràng buộc định dạng cho transactions.scan_url (NOT VALID: chỉ áp cho dòng mới).
-- PHẦN C: activity_logs chỉ thêm, không sửa/xóa:
--        - bỏ policy ALL/UPDATE/DELETE; chỉ cho INSERT khi has_permission('request.approve') (giữ như hiện tại);
--        - trigger ép performed_by = auth.uid() với ghi trực tiếp từ trình duyệt (chống giả mạo người thực hiện);
--        - trigger chặn UPDATE/DELETE từ authenticated/anon; thu hồi quyền UPDATE/DELETE/TRUNCATE.
--        - Hàm SECURITY DEFINER (void_transaction_item, xóa GCN của quản trị...) KHÔNG bị ảnh hưởng.
BEGIN;

-- ========================= PHẦN A =========================
CREATE OR REPLACE FUNCTION public.create_transaction_request(
  p_type text,
  p_notes text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_scan_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_profile       public.profiles%ROWTYPE;
  v_tx_id         uuid;
  v_item          jsonb;
  v_asset_id      uuid;
  v_asset         record;
  v_item_type     text;
  v_reason        text;
  v_details       jsonb;
  v_new_item_id   uuid;
  v_items_result  jsonb := '[]'::jsonb;
  v_seen          uuid[] := ARRAY[]::uuid[];
  v_allowed       text[];
  v_all_reasons   constant text[] := ARRAY['mượn','thế chấp','chuyển nhượng','xuất bán','sang tên cho khách',
                                           'tách sổ','thu hồi','đổi sổ','trả','giải chấp','nhập sau bán','cấp mới','khác'];
  v_scan_re1      constant text := '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)';
  v_scan_re2      constant text := '^[A-Za-z0-9_./-]+$';
  v_s             text;
  v_n             integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa xác thực người dùng (unauthenticated)' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hồ sơ người dùng không hợp lệ hoặc tài khoản chưa được kích hoạt' USING ERRCODE = '42501';
  END IF;

  IF v_profile.role IS NULL OR v_profile.role NOT IN
     ('super_admin','admin','btc_manager','warehouse_manager','capital_dept','project_dept','re_dept','investor') THEN
    RAISE EXCEPTION 'Vai trò của bạn không được phép tạo phiếu yêu cầu.' USING ERRCODE = '42501';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('checkout','checkin') THEN
    RAISE EXCEPTION 'Loại phiếu không hợp lệ (chỉ nhận checkout hoặc checkin).' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Danh sách GCN của phiếu phải là một mảng.' USING ERRCODE = '22023';
  END IF;
  v_n := jsonb_array_length(p_items);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'Phiếu phải có ít nhất 1 GCN.' USING ERRCODE = '22023';
  END IF;
  IF v_n > 500 THEN
    RAISE EXCEPTION 'Một phiếu tối đa 500 GCN (hiện có %). Vui lòng chia nhỏ.', v_n USING ERRCODE = '22023';
  END IF;

  IF p_scan_url IS NOT NULL AND btrim(p_scan_url) <> ''
     AND NOT (p_scan_url ~* v_scan_re1 OR p_scan_url ~ v_scan_re2) THEN
    RAISE EXCEPTION 'Link bản scan không hợp lệ (chỉ nhận link SharePoint/OneDrive).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (type, notes, scan_url, created_by)
  VALUES (p_type, p_notes, NULLIF(btrim(p_scan_url), ''), v_uid)
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Mỗi mục trong phiếu phải là đối tượng JSON.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_asset_id := (v_item->>'asset_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'asset_id không phải UUID hợp lệ.' USING ERRCODE = '22023';
    END;
    IF v_asset_id IS NULL THEN
      RAISE EXCEPTION 'Thiếu asset_id trong một mục của phiếu.' USING ERRCODE = '22023';
    END IF;
    IF v_asset_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'GCN bị lặp trong cùng một phiếu.' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_asset_id;

    SELECT id, certificate_no, lifecycle_status, warehouse_id, current_owner_entity_id
    INTO v_asset FROM public.assets WHERE id = v_asset_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy GCN (id = %).', v_asset_id USING ERRCODE = 'P0002';
    END IF;
    IF v_asset.lifecycle_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'GCN % không còn hiệu lực (trạng thái: %), không thể lập phiếu.',
        v_asset.certificate_no, v_asset.lifecycle_status USING ERRCODE = '22023';
    END IF;

    v_item_type := COALESCE(NULLIF(v_item->>'type', ''), p_type);
    IF v_item_type NOT IN ('checkout','checkin') THEN
      RAISE EXCEPTION 'Loại mục không hợp lệ: %.', v_item_type USING ERRCODE = '22023';
    END IF;

    v_details := COALESCE(v_item->'details', '{}'::jsonb);
    IF jsonb_typeof(v_details) <> 'object' THEN
      RAISE EXCEPTION 'details của mục phải là đối tượng JSON.' USING ERRCODE = '22023';
    END IF;

    v_reason := COALESCE(NULLIF(v_item->>'reason', ''), NULLIF(v_details->>'reason', ''));
    IF v_reason IS NULL OR NOT (v_reason = ANY (v_all_reasons)) THEN
      RAISE EXCEPTION 'Lý do "%" không hợp lệ hoặc bị thiếu (GCN %).', COALESCE(v_reason, ''), v_asset.certificate_no
        USING ERRCODE = '22023';
    END IF;

    FOREACH v_s IN ARRAY ARRAY[v_details->>'scan_url', v_details->>'scanUrl']
    LOOP
      IF v_s IS NOT NULL AND btrim(v_s) <> '' AND NOT (v_s ~* v_scan_re1 OR v_s ~ v_scan_re2) THEN
        RAISE EXCEPTION 'Link bản scan trong chi tiết phiếu không hợp lệ (GCN %).', v_asset.certificate_no
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- Bảng lý do theo vai trò (khớp RLS 0039)
    v_allowed := NULL;
    IF v_profile.role IN ('super_admin','admin','btc_manager','warehouse_manager') THEN
      v_allowed := v_all_reasons;
    ELSIF v_profile.role = 'capital_dept' THEN
      v_allowed := CASE v_item_type
        WHEN 'checkout' THEN ARRAY['mượn','thế chấp','chuyển nhượng','khác']
        ELSE ARRAY['trả','giải chấp','chuyển nhượng','khác'] END;
    ELSIF v_profile.role = 'project_dept' THEN
      v_allowed := CASE v_item_type
        WHEN 'checkout' THEN ARRAY['mượn','sang tên cho khách','tách sổ','thu hồi','đổi sổ','khác']
        ELSE ARRAY['trả','tách sổ','đổi sổ','khác'] END;
    ELSIF v_profile.role = 're_dept' THEN
      v_allowed := CASE v_item_type
        WHEN 'checkout' THEN ARRAY['mượn','xuất bán','khác']
        ELSE ARRAY['trả','nhập sau bán','khác'] END;
    ELSIF v_profile.role = 'investor' THEN
      v_allowed := CASE v_item_type
        WHEN 'checkout' THEN ARRAY['mượn','khác']
        ELSE ARRAY['trả','khác'] END;
    END IF;

    IF v_allowed IS NULL OR NOT (v_reason = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Vai trò % không được tạo phiếu % với lý do "%".', v_profile.role, v_item_type, v_reason
        USING ERRCODE = '42501';
    END IF;

    -- Phạm vi
    IF v_profile.role IN ('capital_dept','project_dept','re_dept') THEN
      IF NOT (
        v_profile.assigned_warehouse_ids IS NULL
        OR cardinality(v_profile.assigned_warehouse_ids) = 0
        OR v_asset.warehouse_id IS NULL
        OR v_asset.warehouse_id = ANY (v_profile.assigned_warehouse_ids)
      ) THEN
        RAISE EXCEPTION 'GCN % không thuộc kho bạn được phụ trách.', v_asset.certificate_no USING ERRCODE = '42501';
      END IF;
    ELSIF v_profile.role = 'investor' THEN
      IF v_profile.owner_entity_ids IS NULL
         OR cardinality(v_profile.owner_entity_ids) = 0
         OR v_asset.current_owner_entity_id IS NULL
         OR NOT (v_asset.current_owner_entity_id = ANY (v_profile.owner_entity_ids)) THEN
        RAISE EXCEPTION 'GCN % không thuộc quyền sở hữu của bạn.', v_asset.certificate_no USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Chống gửi trùng: đã có phiếu CHỜ DUYỆT cùng loại cho GCN này
    IF EXISTS (
      SELECT 1 FROM public.transaction_items ti
      WHERE ti.asset_id = v_asset_id AND ti.type = v_item_type AND ti.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'GCN % đã có phiếu % đang chờ duyệt.', v_asset.certificate_no, v_item_type USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.transaction_items (transaction_id, asset_id, type, reason, details, status)
    VALUES (v_tx_id, v_asset_id, v_item_type, v_reason, v_details, 'pending')
    RETURNING id INTO v_new_item_id;

    v_items_result := v_items_result || jsonb_build_object(
      'id', v_new_item_id,
      'transaction_id', v_tx_id,
      'asset_id', v_asset_id,
      'type', v_item_type,
      'reason', v_reason,
      'details', v_details,
      'status', 'pending'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_tx_id,
    'type', p_type,
    'notes', p_notes,
    'scan_url', NULLIF(btrim(p_scan_url), ''),
    'created_by', v_uid,
    'items', v_items_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_transaction_request(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_request(text, text, jsonb, text) TO authenticated;

-- ========================= PHẦN B =========================
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_scan_link;
ALTER TABLE public.transactions ADD CONSTRAINT chk_transactions_scan_link CHECK (
  scan_url IS NULL
  OR btrim(scan_url) = ''
  OR scan_url ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)'
  OR scan_url ~ '^[A-Za-z0-9_./-]+$'
) NOT VALID;

-- ========================= PHẦN C =========================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'activity_logs' AND cmd IN ('ALL','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.activity_logs', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS activity_logs_insert_approver ON public.activity_logs;
CREATE POLICY activity_logs_insert_approver
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (public.has_permission('request.approve'));

REVOKE UPDATE, DELETE, TRUNCATE ON public.activity_logs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.activity_logs_force_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND current_user IN ('authenticated', 'anon') THEN
    NEW.performed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_logs_force_actor ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_force_actor
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.activity_logs_force_actor();

CREATE OR REPLACE FUNCTION public.activity_logs_block_client_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Nhật ký biến động chỉ được thêm, không được sửa hoặc xóa.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_logs_block_client_change ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_block_client_change
BEFORE UPDATE OR DELETE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.activity_logs_block_client_change();

COMMIT;

-- ROLLBACK (phần C): DROP TRIGGER trg_activity_logs_force_actor / trg_activity_logs_block_client_change ON public.activity_logs;
--   DROP POLICY activity_logs_insert_approver ON public.activity_logs;
--   CREATE POLICY activity_logs_write_admin ON public.activity_logs FOR ALL USING (has_permission('request.approve'));
--   GRANT UPDATE, DELETE ON public.activity_logs TO authenticated;
-- ROLLBACK (phần A): chạy lại định nghĩa cũ của create_transaction_request đã lưu từ pg_get_functiondef.
-- ROLLBACK (phần B): ALTER TABLE public.transactions DROP CONSTRAINT chk_transactions_scan_link;