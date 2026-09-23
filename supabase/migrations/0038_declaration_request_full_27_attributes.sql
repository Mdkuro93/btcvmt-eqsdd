-- ==============================================================================
-- MIGRATION: 0038_declaration_request_full_27_attributes.sql
-- MỤC ĐÍCH:
--   1. Thêm các cột chuẩn 27 thuộc tính còn thiếu vào bảng `asset_declaration_requests`:
--      managing_unit, mortgage_status, mortgage_bank, mortgage_unit,
--      mortgage_valuation, collateral_ratio, collateral_value,
--      mortgage_expected_release_date, scan_file_url.
--   2. Cập nhật RLS: Cho phép vai trò 'warehouse_manager' và những user có quyền
--      'request.approve' được UPDATE `asset_declaration_requests` (bổ sung thông tin
--      khi duyệt trước khi nhập kho).
--   3. Cập nhật hàm `_process_single_declaration_approval`:
--      Map toàn bộ các trường chuẩn (đơn vị quản lý sổ, thế chấp, ngân hàng, định giá,
--      tỷ lệ đảm bảo, giá trị TSĐB, ngày giải chấp, file scan, ghi chú)
--      vào bảng `assets` khi tạo tài sản mới.
-- ==============================================================================

BEGIN;

-- 1. Bổ sung các cột thuộc chuẩn 27 thuộc tính vào bảng asset_declaration_requests
ALTER TABLE public.asset_declaration_requests
  ADD COLUMN IF NOT EXISTS managing_unit TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS mortgage_bank TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_unit TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_valuation NUMERIC,
  ADD COLUMN IF NOT EXISTS collateral_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS collateral_value NUMERIC,
  ADD COLUMN IF NOT EXISTS mortgage_expected_release_date DATE,
  ADD COLUMN IF NOT EXISTS scan_file_url TEXT;

COMMENT ON COLUMN public.asset_declaration_requests.managing_unit IS 'Đơn vị quản lý sổ (Thuộc tính 26 trong chuẩn 27)';
COMMENT ON COLUMN public.asset_declaration_requests.mortgage_status IS 'Trạng thái thế chấp: none hoặc mortgaged';
COMMENT ON COLUMN public.asset_declaration_requests.mortgage_bank IS 'Ngân hàng nhận thế chấp';
COMMENT ON COLUMN public.asset_declaration_requests.mortgage_unit IS 'Đơn vị thực hiện thế chấp (vay)';
COMMENT ON COLUMN public.asset_declaration_requests.mortgage_valuation IS 'Giá trị định giá (VNĐ)';
COMMENT ON COLUMN public.asset_declaration_requests.collateral_ratio IS 'Tỷ lệ đảm bảo (%)';
COMMENT ON COLUMN public.asset_declaration_requests.collateral_value IS 'Giá trị đảm bảo / TSĐB (VNĐ)';
COMMENT ON COLUMN public.asset_declaration_requests.mortgage_expected_release_date IS 'Ngày dự kiến giải chấp';
COMMENT ON COLUMN public.asset_declaration_requests.scan_file_url IS 'Đường dẫn file scan Giấy chứng nhận';

-- 2. Cập nhật Policy UPDATE trên asset_declaration_requests
-- Cho phép cả warehouse_manager và những ai có quyền request.approve được update thông tin đề xuất pending
DROP POLICY IF EXISTS "Admins can update asset_declaration_requests" ON public.asset_declaration_requests;
DROP POLICY IF EXISTS "Approvers can update asset_declaration_requests" ON public.asset_declaration_requests;

CREATE POLICY "Approvers can update asset_declaration_requests"
  ON public.asset_declaration_requests FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('request.approve')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
    )
  );

-- 3. Cập nhật hàm xử lý duyệt đơn lẻ _process_single_declaration_approval để map đầy đủ vào assets
CREATE OR REPLACE FUNCTION public._process_single_declaration_approval(
  p_request_id uuid,
  p_asset_code_prefix text,
  p_transaction_id uuid
) RETURNS uuid AS $$
DECLARE
  v_req record;
  v_asset_id uuid;
  v_asset_code text;
  v_next_seq integer;
  v_voucher_code text;
  v_warehouse_name text;
BEGIN
  SELECT * INTO v_req FROM asset_declaration_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu %', p_request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu % đã được xử lý (trạng thái: %)', p_request_id, v_req.status;
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
        managing_unit = COALESCE(v_req.managing_unit, managing_unit),
        scan_file_url = COALESCE(v_req.scan_file_url, scan_file_url),
        mortgage_status = COALESCE(v_req.mortgage_status, mortgage_status),
        mortgage_bank = COALESCE(v_req.mortgage_bank, mortgage_bank),
        mortgage_unit = COALESCE(v_req.mortgage_unit, mortgage_unit),
        mortgage_valuation = COALESCE(v_req.mortgage_valuation, mortgage_valuation),
        collateral_ratio = COALESCE(v_req.collateral_ratio, collateral_ratio),
        collateral_value = COALESCE(v_req.collateral_value, collateral_value),
        mortgage_expected_release_date = COALESCE(v_req.mortgage_expected_release_date, mortgage_expected_release_date),
        notes = COALESCE(v_req.notes, notes),
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
      managing_unit, scan_file_url, notes,
      mortgage_status, mortgage_bank, mortgage_unit,
      mortgage_valuation, collateral_ratio, collateral_value,
      mortgage_expected_release_date,
      custody_status, lifecycle_status, sale_status
    ) VALUES (
      v_asset_code, COALESCE(v_req.collateral_type, 'BDS'), v_req.certificate_no, v_req.registry_no, v_req.registry_date,
      v_req.project_id, v_req.legal_lot_code, v_req.land_lot_no, v_req.map_sheet_no,
      v_req.business_project_name, v_req.business_plot_code, v_req.area,
      v_req.current_owner_entity_id, COALESCE(v_req.certificate_group, 'so_nho'),
      v_req.usage_purpose, v_req.usage_term_type, v_req.usage_term_date,
      v_req.asset_type, v_req.warehouse_id,
      CASE WHEN v_req.request_type = 'tach_so' THEN v_req.old_asset_id ELSE NULL END,
      v_req.managing_unit, v_req.scan_file_url, v_req.notes,
      COALESCE(v_req.mortgage_status, 'none'), v_req.mortgage_bank, v_req.mortgage_unit,
      v_req.mortgage_valuation, v_req.collateral_ratio, v_req.collateral_value,
      v_req.mortgage_expected_release_date,
      'in_stock', 'active', 'not_ready'
    )
    RETURNING id INTO v_asset_id;

    IF v_req.request_type = 'tach_so' AND v_req.old_asset_id IS NOT NULL THEN
      UPDATE assets SET lifecycle_status = 'invalidated', updated_at = now()
      WHERE id = v_req.old_asset_id;
    END IF;
  END IF;

  -- Sinh mã chứng từ nhập kho (PN) cho kho đích của yêu cầu
  v_voucher_code := public._next_voucher_code(v_req.warehouse_id, 'PN');
  SELECT w.name INTO v_warehouse_name FROM public.warehouses w WHERE w.id = v_req.warehouse_id;

  -- Tạo phiếu nhập kho (transaction_item) gắn vào transaction chung được truyền vào
  INSERT INTO transaction_items (transaction_id, asset_id, type, details, status, decided_by, decided_at, notes, voucher_code)
  VALUES (
    p_transaction_id, v_asset_id, 'checkin',
    jsonb_build_object('source', 'declaration_request', 'request_id', v_req.id, 'request_type', v_req.request_type),
    'approved', auth.uid(), now(),
    'Nhập kho từ đề xuất khai báo GCN #' || v_req.certificate_no,
    v_voucher_code
  );

  -- Ghi Nhật ký biến động (activity_logs)
  INSERT INTO activity_logs (
    log_date, action_type, document_no, description, used_by, notes,
    asset_id, transaction_id, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE, 'Nhập sổ', v_voucher_code,
    'Nhập lưu kho GCN QSDĐ ' || v_req.certificate_no || ' về kho ' || COALESCE(v_warehouse_name, 'chưa xác định') ||
      ' (từ đề xuất khai báo GCN, loại: ' || v_req.request_type || ')',
    'BTC VMT', NULL,
    v_asset_id, p_transaction_id, v_req.warehouse_id, auth.uid()
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

COMMIT;
