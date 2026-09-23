-- ==============================================================================
-- MIGRATION: 0024_fix_approve_declaration_request.sql
-- MỤC ĐÍCH:
--   1. Sửa lỗi "column subdivision of relation assets does not exist" ở RPC
--      approve_asset_declaration_request (hàm này từ 0019, còn dùng schema cũ).
--   2. Bổ sung: khi duyệt 1 yêu cầu khai báo GCN, hệ thống TỰ ĐỘNG tạo kèm
--      1 phiếu nhập kho (transactions type='checkin' + transaction_items) —
--      trước đây bị thiếu bước này, sổ được tạo ra nhưng không có phiếu nhập
--      đi kèm, không tra cứu ngược được theo phiếu.
--   3. Thêm RPC mới approve_asset_declaration_requests_bulk: duyệt nhiều yêu
--      cầu CÙNG LÚC sẽ gộp chung vào 1 phiếu nhập kho duy nhất (1 transaction,
--      nhiều transaction_items) thay vì mỗi yêu cầu 1 phiếu riêng lẻ.
-- ==============================================================================

BEGIN;

-- Đảm bảo đủ cột cần thiết trên bảng requests (phòng ngừa, giống 0023)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='asset_declaration_requests') THEN
    ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS resulting_asset_id UUID;
    ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID;
    ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Hàm nội bộ dùng chung: xử lý 1 yêu cầu đã được duyệt -> tạo/cập nhật asset
-- + tạo 1 transaction_item gắn vào transaction_id được truyền vào (dùng chung
-- cho cả duyệt đơn lẻ lẫn duyệt hàng loạt).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._process_single_declaration_approval(
  p_request_id uuid,
  p_asset_code_prefix text,
  p_transaction_id uuid
) RETURNS uuid AS $$
DECLARE
  v_req record;
  v_asset_id uuid;
  v_next_seq integer;
  v_asset_code text;
BEGIN
  SELECT * INTO v_req FROM asset_declaration_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu %', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu % đã được xử lý trước đó (trạng thái: %)', p_request_id, v_req.status;
  END IF;

  IF v_req.request_type = 'cap_doi' THEN
    -- Cấp đổi: KHÔNG tạo dòng mới, chỉ cập nhật số/ngày trên sổ cũ, giữ nguyên asset_code/lịch sử
    IF v_req.old_asset_id IS NULL THEN
      RAISE EXCEPTION 'Yêu cầu cấp đổi (%) thiếu old_asset_id', p_request_id;
    END IF;

    UPDATE assets
    SET certificate_no = v_req.certificate_no,
        registry_no = COALESCE(v_req.registry_no, registry_no),
        registry_date = COALESCE(v_req.registry_date, registry_date),
        updated_at = now()
    WHERE id = v_req.old_asset_id
    RETURNING id INTO v_asset_id;

    IF v_asset_id IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy sổ gốc % để cấp đổi', v_req.old_asset_id;
    END IF;

  ELSE
    -- cap_moi hoặc tach_so: tạo dòng asset mới
    IF p_asset_code_prefix IS NOT NULL THEN
      SELECT COALESCE(MAX(
        CASE WHEN asset_code ~ ('^' || p_asset_code_prefix || '[0-9]+$')
          THEN CAST(SUBSTRING(asset_code FROM LENGTH(p_asset_code_prefix) + 1) AS INTEGER)
          ELSE 0 END
      ), 0) + 1
      INTO v_next_seq
      FROM assets
      WHERE asset_code LIKE p_asset_code_prefix || '%';
      v_asset_code := p_asset_code_prefix || LPAD(v_next_seq::text, 8, '0');
    ELSE
      v_asset_code := 'VMT_DNG_' || COALESCE(v_req.collateral_type, 'BDS') || '_' || LPAD(FLOOR(random() * 90000000 + 10000000)::text, 8, '0');
    END IF;

    INSERT INTO assets (
      asset_code, collateral_type, certificate_no, registry_no, registry_date,
      project_id, legal_lot_code, land_lot_no, map_sheet_no,
      business_project_name, business_plot_code, area,
      current_owner_entity_id, certificate_group,
      usage_purpose, usage_term_type, usage_term_date,
      asset_type, warehouse_id, parent_asset_id,
      custody_status, lifecycle_status, sale_status, mortgage_status
    ) VALUES (
      v_asset_code, COALESCE(v_req.collateral_type, 'BDS'), v_req.certificate_no, v_req.registry_no, v_req.registry_date,
      v_req.project_id, v_req.legal_lot_code, v_req.land_lot_no, v_req.map_sheet_no,
      v_req.business_project_name, v_req.business_plot_code, v_req.area,
      v_req.current_owner_entity_id, COALESCE(v_req.certificate_group, 'so_nho'),
      v_req.usage_purpose, v_req.usage_term_type, v_req.usage_term_date,
      v_req.asset_type, v_req.warehouse_id,
      CASE WHEN v_req.request_type = 'tach_so' THEN v_req.old_asset_id ELSE NULL END,
      'in_stock', 'active', 'not_ready', 'none'
    )
    RETURNING id INTO v_asset_id;

    IF v_req.request_type = 'tach_so' AND v_req.old_asset_id IS NOT NULL THEN
      UPDATE assets SET lifecycle_status = 'invalidated', updated_at = now()
      WHERE id = v_req.old_asset_id;
    END IF;
  END IF;

  -- Tạo phiếu nhập kho (transaction_item) gắn vào transaction chung được truyền vào
  INSERT INTO transaction_items (transaction_id, asset_id, type, details, status, decided_by, decided_at, notes)
  VALUES (
    p_transaction_id, v_asset_id, 'checkin',
    jsonb_build_object('source', 'declaration_request', 'request_id', v_req.id, 'request_type', v_req.request_type),
    'approved', auth.uid(), now(),
    'Nhập kho từ đề xuất khai báo GCN #' || v_req.certificate_no
  );

  UPDATE asset_declaration_requests
  SET status = 'approved',
      resulting_asset_id = v_asset_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tự động xóa MỌI phiên bản cũ của approve_asset_declaration_request (bất kể
-- chữ ký/kiểu trả về cũ là gì) để tránh lỗi "cannot change return type of
-- existing function" như đã gặp với lookup_asset_status ở migration 0022.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'approve_asset_declaration_request'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- Hàm duyệt ĐƠN LẺ (giữ nguyên chữ ký cũ để không phá vỡ code frontend hiện tại)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_asset_declaration_request(
  p_request_id uuid,
  p_decision text,
  p_asset_code_prefix text DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_req record;
  v_tx_id uuid;
BEGIN
  IF NOT has_permission('request.approve') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_req FROM asset_declaration_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu';
  END IF;

  IF p_decision = 'rejected' THEN
    IF v_req.status <> 'pending' THEN
      RAISE EXCEPTION 'Yêu cầu đã được xử lý trước đó';
    END IF;
    UPDATE asset_declaration_requests
    SET status = 'rejected', rejection_reason = p_rejection_reason,
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  IF p_decision <> 'approved' THEN
    RAISE EXCEPTION 'Giá trị p_decision không hợp lệ: %', p_decision;
  END IF;

  INSERT INTO transactions (type, requester_id, details)
  VALUES ('checkin', v_req.requester_id, jsonb_build_object('source', 'declaration_request', 'request_id', p_request_id))
  RETURNING id INTO v_tx_id;

  PERFORM public._process_single_declaration_approval(p_request_id, p_asset_code_prefix, v_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- Hàm duyệt HÀNG LOẠT MỚI: gộp chung tất cả vào 1 phiếu nhập kho duy nhất.
-- p_items: jsonb array dạng [{"request_id": "...", "asset_code_prefix": "..."}]
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_asset_declaration_requests_bulk(
  p_items jsonb
) RETURNS TABLE (request_id uuid, asset_id uuid, error_message text) AS $$
DECLARE
  v_tx_id uuid;
  v_item jsonb;
  v_asset_id uuid;
BEGIN
  IF NOT has_permission('request.approve') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO transactions (type, requester_id, details)
  VALUES ('checkin', auth.uid(), jsonb_build_object('source', 'declaration_request_bulk', 'count', jsonb_array_length(p_items)))
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_asset_id := public._process_single_declaration_approval(
        (v_item->>'request_id')::uuid,
        v_item->>'asset_code_prefix',
        v_tx_id
      );
      request_id := (v_item->>'request_id')::uuid;
      asset_id := v_asset_id;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      request_id := (v_item->>'request_id')::uuid;
      asset_id := NULL;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.approve_asset_declaration_request(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_asset_declaration_requests_bulk(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) TO authenticated;

COMMIT;