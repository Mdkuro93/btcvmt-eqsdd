-- =====================================================================================
-- 0067 — Cập nhật Logic Kiểm Tra Loại Tài Sản Cao Tầng / Thấp Tầng (Hybrid Approach)
-- =====================================================================================
-- BỐI CẢNH & YÊU CẦU:
--   Đồng bộ danh mục Loại Tài Sản mới giữa Frontend và Backend SQL:
--   - Nhóm Cao Tầng (Bảo toàn diện tích đất Sổ mẹ khi tách 1 phần):
--     'Căn hộ chung cư', 'Condotel / Căn hộ TMDV', 'Căn hộ khách sạn Condotel',
--     'Officetel / Căn hộ văn phòng', 'Sàn thương mại', 'Sàn trung tâm thương mại',
--     'Shophouse khối đế', 'Cao tầng Khác'
--   - Nhóm Thấp Tầng (Trừ lùi diện tích đất Sổ mẹ khi tách 1 phần):
--     'Đất nền', 'Biệt thự', 'Nhà phố / Liền kề', 'Thấp tầng khác', v.v.
-- =====================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._process_single_declaration_approval(
  p_request_id UUID,
  p_asset_code_prefix TEXT DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.asset_declaration_requests%ROWTYPE;
  v_asset_id UUID;
  v_asset_code TEXT;
  v_next_seq INTEGER;
  v_tx_id UUID;
  v_voucher_code TEXT;
  v_warehouse_name TEXT;
  v_reviewer UUID;
  v_parent_id UUID;
  v_parent public.assets%ROWTYPE;
  v_rel_type TEXT;
  v_rem_area NUMERIC;
  v_is_high_rise BOOLEAN := false;
BEGIN
  v_reviewer := auth.uid();

  SELECT * INTO v_req
  FROM public.asset_declaration_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu khai báo ID %', p_request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý trước đó (trạng thái: %)', v_req.status;
  END IF;

  -- Xác định ID sổ gốc và quan hệ
  v_parent_id := COALESCE(v_req.parent_asset_id, v_req.old_asset_id);
  v_rel_type := v_req.relationship_type;
  IF v_rel_type IS NULL THEN
    IF v_req.request_type = 'tach_so' THEN
      v_rel_type := 'SPLIT_FULL';
    ELSIF v_req.request_type = 'cap_doi' THEN
      v_rel_type := 'RENEW';
    END IF;
  END IF;
  v_rem_area := v_req.remaining_area;

  -- Kiểm tra phân loại Cao tầng (High Rise) vs Thấp tầng (Low Rise):
  -- Cao tầng: Bảo toàn diện tích đất Sổ mẹ (không trừ lùi).
  -- Thấp tầng: Trừ lùi diện tích đất Sổ mẹ.
  IF v_req.asset_type IS NOT NULL AND (
    v_req.asset_type ILIKE '%Căn hộ%' OR
    v_req.asset_type ILIKE '%Condotel%' OR
    v_req.asset_type ILIKE '%Officetel%' OR
    v_req.asset_type ILIKE '%Sàn thương mại%' OR
    v_req.asset_type ILIKE '%khối đế%' OR
    v_req.asset_type ILIKE '%cao tầng%' OR
    v_req.asset_type ILIKE '%penthouse%' OR
    v_req.asset_type ILIKE '%duplex%' OR
    v_req.asset_type = ANY (ARRAY[
      'Căn hộ chung cư',
      'Condotel / Căn hộ TMDV',
      'Căn hộ khách sạn Condotel',
      'Officetel / Căn hộ văn phòng',
      'Sàn thương mại',
      'Sàn trung tâm thương mại',
      'Shophouse khối đế',
      'Cao tầng Khác',
      'Cao tầng khác'
    ])
  ) AND NOT (
    v_req.asset_type ILIKE '%thấp tầng%'
  ) THEN
    v_is_high_rise := true;
  END IF;

  -- ============================================================================
  -- CHẶN CỨNG BẢO MẬT & NGHIỆP VỤ: SỔ GỐC KHÔNG ĐƯỢC PHÉP ĐANG LƯU TRONG KHO
  -- ============================================================================
  IF v_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.assets
    WHERE id = v_parent_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy GCN gốc (ID: %) được tham chiếu trong hệ thống', v_parent_id;
    END IF;

    -- Kiểm tra trạng thái kho của sổ gốc
    IF (v_parent.is_in_warehouse = true OR v_parent.custody_status = 'in_stock') THEN
      RAISE EXCEPTION '⚠️ KHÔNG THỂ THỰC HIỆN: GCN gốc hiện vẫn đang LƯU KHO. Nếu chọn nhầm sổ: Vui lòng chọn lại đúng Mã TSĐB. Nếu đúng sổ: Vui lòng lập Phiếu Xuất Kho cho GCN gốc trước khi làm thủ tục nhập kho GCN mới!';
    END IF;
  END IF;

  -- 1. TẠO TÀI SẢN MỚI
  IF p_asset_code_prefix IS NOT NULL THEN
    SELECT COALESCE(MAX(
      CASE WHEN asset_code ~ ('^' || p_asset_code_prefix || '[0-9]+$')
        THEN CAST(SUBSTRING(asset_code FROM LENGTH(p_asset_code_prefix) + 1) AS INTEGER)
        ELSE 0 END
    ), 0) + 1
    INTO v_next_seq
    FROM public.assets
    WHERE asset_code LIKE p_asset_code_prefix || '%';
    v_asset_code := p_asset_code_prefix || LPAD(v_next_seq::text, 8, '0');
  ELSE
    v_asset_code := 'VMT_DNG_' || COALESCE(v_req.collateral_type, 'BDS') || '_' || LPAD(FLOOR(random() * 90000000 + 10000000)::text, 8, '0');
  END IF;

  INSERT INTO public.assets (
    asset_code, collateral_type, certificate_no, registry_no, registry_date,
    project_id, legal_lot_code, land_lot_no, map_sheet_no,
    business_project_name, business_plot_code, area,
    current_owner_entity_id, certificate_group,
    usage_purpose, usage_term_type, usage_term_date,
    asset_type, warehouse_id, parent_asset_id,
    relationship_type, invalidation_type, original_area, remaining_area,
    is_in_warehouse, status,
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
    v_req.asset_type, v_req.warehouse_id, v_parent_id,
    v_rel_type, 'NONE', v_req.area, NULL,
    true, 'ACTIVE',
    v_req.managing_unit, v_req.scan_file_url, v_req.notes,
    COALESCE(v_req.mortgage_status, 'none'), v_req.mortgage_bank, v_req.mortgage_unit,
    v_req.mortgage_valuation, v_req.collateral_ratio, v_req.collateral_value,
    v_req.mortgage_expected_release_date,
    'in_stock', 'active', 'not_ready'
  )
  RETURNING id INTO v_asset_id;

  -- 2. XỬ LÝ TRẠNG THÁI SỔ GỐC (NẾU CÓ)
  IF v_parent_id IS NOT NULL THEN
    IF v_rel_type = 'SPLIT_PARTIAL' THEN
      -- B. TÁCH MỘT PHẦN (HYBRID LOGIC):
      IF v_is_high_rise THEN
        -- B1. CAO TẦNG / SÀN 3D:
        -- Sổ cũ: invalidation_type = 'PARTIAL', GIỮ NGUYÊN diện tích Sổ mẹ (không trừ lùi), giữ is_in_warehouse = true
        UPDATE public.assets 
        SET invalidation_type = 'PARTIAL',
            is_in_warehouse = true,
            custody_status = 'in_stock',
            updated_at = now(),
            updated_by = v_reviewer
        WHERE id = v_parent_id;
      ELSE
        -- B2. THẤP TẦNG / ĐẤT NỀN:
        -- Sổ cũ: invalidation_type = 'PARTIAL', cập nhật area = remaining_area (trừ lùi), giữ is_in_warehouse = true
        UPDATE public.assets 
        SET invalidation_type = 'PARTIAL',
            remaining_area = COALESCE(v_rem_area, (area - v_req.area)),
            area = COALESCE(v_rem_area, (area - v_req.area)),
            is_in_warehouse = true,
            custody_status = 'in_stock',
            updated_at = now(),
            updated_by = v_reviewer
        WHERE id = v_parent_id;
      END IF;
    ELSE
      -- A. TÁCH TOÀN PHẦN / CẤP ĐỔI (SPLIT_FULL / RENEW):
      -- Sổ cũ: invalidation_type = 'FULL', status = 'REVOKED' (Thu hồi/Vô hiệu toàn phần), is_in_warehouse = false.
      UPDATE public.assets 
      SET invalidation_type = 'FULL',
          status = 'REVOKED',
          lifecycle_status = 'invalidated',
          is_in_warehouse = false,
          custody_status = 'checked_out',
          updated_at = now(),
          updated_by = v_reviewer
      WHERE id = v_parent_id;
    END IF;
  END IF;

  -- 3. SINH MÃ CHỨNG TỪ NHẬP KHO (PN) & TẠO PHIẾU GIAO DỊCH
  v_voucher_code := public._next_voucher_code(v_req.warehouse_id, 'PN');

  IF p_transaction_id IS NOT NULL THEN
    v_tx_id := p_transaction_id;
  ELSE
    SELECT name INTO v_warehouse_name FROM public.warehouses WHERE id = v_req.warehouse_id;
    INSERT INTO public.transactions (
      transaction_code, type, status, warehouse_id, notes, created_by, confirmed_by, confirmed_at
    ) VALUES (
      'TX-DEC-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
      'checkin',
      'confirmed',
      v_req.warehouse_id,
      'Nhập kho GCN mới theo yêu cầu khai báo #' || v_req.id || 
        CASE 
          WHEN v_rel_type = 'RENEW' THEN ' (Cấp đổi từ GCN gốc)'
          WHEN v_rel_type = 'SPLIT_FULL' THEN ' (Tách toàn phần từ Sổ gốc)'
          WHEN v_rel_type = 'SPLIT_PARTIAL' AND v_is_high_rise THEN ' (Cấp căn hộ/sàn cao tầng từ Sổ lớn)'
          WHEN v_rel_type = 'SPLIT_PARTIAL' THEN ' (Tách một phần đất từ Sổ gốc)'
          ELSE ''
        END,
      v_req.requester_id,
      v_reviewer,
      now()
    ) RETURNING id INTO v_tx_id;
  END IF;

  -- Ghi nhận dòng giao dịch chi tiết
  INSERT INTO public.transaction_items (
    transaction_id, asset_id, type, reason, status, voucher_code, decision_notes, decided_at, decided_by
  ) VALUES (
    v_tx_id,
    v_asset_id,
    'checkin',
    CASE 
      WHEN v_rel_type = 'RENEW' THEN 'đổi sổ'
      WHEN v_rel_type IN ('SPLIT_FULL', 'SPLIT_PARTIAL') THEN 'tách sổ'
      ELSE 'cấp mới'
    END,
    'confirmed',
    v_voucher_code,
    'Duyệt khai báo GCN ' || v_req.certificate_no,
    now(),
    v_reviewer
  );

  -- 4. CẬP NHẬT TRẠNG THÁI YÊU CẦU KHAI BÁO
  UPDATE public.asset_declaration_requests
  SET status = 'approved',
      resulting_asset_id = v_asset_id,
      voucher_code = v_voucher_code,
      transaction_id = v_tx_id,
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      review_notes = COALESCE(review_notes, '') || 
        CASE 
          WHEN v_rel_type = 'RENEW' THEN ' (Đã cấp đổi từ sổ gốc)'
          WHEN v_rel_type = 'SPLIT_FULL' THEN ' (Đã tách toàn phần & thu hồi sổ gốc)'
          WHEN v_rel_type = 'SPLIT_PARTIAL' AND v_is_high_rise THEN ' (Đã cấp căn hộ cao tầng, bảo toàn diện tích đất sổ gốc)'
          WHEN v_rel_type = 'SPLIT_PARTIAL' THEN ' (Đã tách 1 phần & giảm diện tích sổ gốc)'
          ELSE ''
        END
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$;

-- Bảo mật quyền thực thi: hàm nội bộ chỉ dành cho service_role và các hàm bọc SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) TO service_role;

COMMIT;
