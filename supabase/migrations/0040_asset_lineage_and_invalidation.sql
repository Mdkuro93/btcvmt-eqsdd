-- ==============================================================================
-- Migration 0040: Quản lý Nghiệp vụ Phả hệ GCN (Tách sổ, Cấp đổi) & Vô hiệu hóa Sổ gốc
-- ==============================================================================
-- 1. Bổ sung các trường vào bảng assets:
--    - parent_asset_id: UUID trỏ tới assets.id (sổ gốc/sổ cũ)
--    - relationship_type: 'SPLIT_FULL' | 'SPLIT_PARTIAL' | 'RENEW' | 'MERGE'
--    - invalidation_type: 'NONE' | 'PARTIAL' | 'FULL' (Mặc định 'NONE')
--    - remaining_area: Diện tích còn lại của sổ gốc khi tách 1 phần
--    - original_area: Diện tích ban đầu của GCN trước khi bị tách 1 phần
--    - is_in_warehouse: Trạng thái sổ đang thực tế lưu trong kho hay đã xuất kho
--    - status: 'ACTIVE' | 'REVOKED' | 'DISPOSED' | 'PENDING'
--
-- 2. Bổ sung các trường tương ứng vào bảng asset_declaration_requests:
--    - parent_asset_id, relationship_type, invalidation_type, remaining_area, original_area
--
-- 3. Nâng cấp RPC _process_single_declaration_approval:
--    - Chặn cứng nếu Sổ gốc hiện vẫn đang lưu kho (is_in_warehouse = true hoặc custody_status = 'in_stock')
--    - Xử lý trạng thái khi Tách toàn phần / Cấp đổi (SPLIT_FULL / RENEW): Sổ cũ invalidation_type='FULL', status='REVOKED', is_in_warehouse=false
--    - Xử lý trạng thái khi Tách một phần (SPLIT_PARTIAL): Sổ cũ invalidation_type='PARTIAL', area=remaining_area, giữ is_in_warehouse=true
-- ==============================================================================

-- 1. CẬP NHẬT CỘT TRÊN BẢNG assets
ALTER TABLE public.assets 
  ADD COLUMN IF NOT EXISTS parent_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS invalidation_type TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS remaining_area NUMERIC,
  ADD COLUMN IF NOT EXISTS original_area NUMERIC,
  ADD COLUMN IF NOT EXISTS is_in_warehouse BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

-- Ràng buộc CHECK cho relationship_type và invalidation_type trên bảng assets
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_relationship_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_relationship_type_check 
  CHECK (relationship_type IS NULL OR relationship_type IN ('SPLIT_FULL', 'SPLIT_PARTIAL', 'RENEW', 'MERGE'));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_invalidation_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_invalidation_type_check 
  CHECK (invalidation_type IN ('NONE', 'PARTIAL', 'FULL'));

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_status_check 
  CHECK (status IN ('ACTIVE', 'REVOKED', 'DISPOSED', 'PENDING'));

-- Đồng bộ dữ liệu hiện hữu trên bảng assets
UPDATE public.assets 
SET is_in_warehouse = (custody_status = 'in_stock') 
WHERE is_in_warehouse IS NULL OR is_in_warehouse != (custody_status = 'in_stock');

UPDATE public.assets 
SET status = CASE 
  WHEN lifecycle_status = 'invalidated' THEN 'REVOKED' 
  ELSE 'ACTIVE' 
END
WHERE status IS NULL OR status = 'ACTIVE';

UPDATE public.assets 
SET invalidation_type = CASE 
  WHEN lifecycle_status = 'invalidated' THEN 'FULL' 
  ELSE 'NONE' 
END
WHERE invalidation_type IS NULL OR invalidation_type = 'NONE';

UPDATE public.assets 
SET original_area = area 
WHERE original_area IS NULL AND area IS NOT NULL;

-- Index hỗ trợ truy vấn phả hệ sổ (Lineage)
CREATE INDEX IF NOT EXISTS idx_assets_parent_asset_id ON public.assets(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_relationship_type ON public.assets(relationship_type);
CREATE INDEX IF NOT EXISTS idx_assets_invalidation_type ON public.assets(invalidation_type);
CREATE INDEX IF NOT EXISTS idx_assets_is_in_warehouse ON public.assets(is_in_warehouse);

-- 2. CẬP NHẬT CỘT TRÊN BẢNG asset_declaration_requests
ALTER TABLE public.asset_declaration_requests 
  ADD COLUMN IF NOT EXISTS parent_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS invalidation_type TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS remaining_area NUMERIC,
  ADD COLUMN IF NOT EXISTS original_area NUMERIC;

-- Ràng buộc CHECK cho bảng asset_declaration_requests
ALTER TABLE public.asset_declaration_requests DROP CONSTRAINT IF EXISTS adr_relationship_type_check;
ALTER TABLE public.asset_declaration_requests ADD CONSTRAINT adr_relationship_type_check 
  CHECK (relationship_type IS NULL OR relationship_type IN ('SPLIT_FULL', 'SPLIT_PARTIAL', 'RENEW', 'MERGE'));

ALTER TABLE public.asset_declaration_requests DROP CONSTRAINT IF EXISTS adr_invalidation_type_check;
ALTER TABLE public.asset_declaration_requests ADD CONSTRAINT adr_invalidation_type_check 
  CHECK (invalidation_type IN ('NONE', 'PARTIAL', 'FULL'));

-- Đồng bộ parent_asset_id từ old_asset_id hiện tại (nếu có)
UPDATE public.asset_declaration_requests 
SET parent_asset_id = old_asset_id 
WHERE parent_asset_id IS NULL AND old_asset_id IS NOT NULL;

UPDATE public.asset_declaration_requests 
SET relationship_type = CASE 
  WHEN request_type = 'tach_so' THEN 'SPLIT_FULL' 
  WHEN request_type = 'cap_doi' THEN 'RENEW' 
  ELSE NULL 
END 
WHERE relationship_type IS NULL AND request_type IN ('tach_so', 'cap_doi');

-- 3. NÂNG CẤP RPC _process_single_declaration_approval ĐỂ XỬ LÝ PHẢ HỆ VÀ VÔ HIỆU HÓA
-- Xóa signature cũ để tránh lỗi "ERROR: 42P13: cannot change name of input parameter"
DROP FUNCTION IF EXISTS public._process_single_declaration_approval(uuid, text, uuid);

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

  -- ============================================================================
  -- CHẶN CỨNG BẢO MẬT & NGHIỆP VỤ: SỔ GỐC KHÔNG ĐƯỢC PHÉP ĐANG LƯU TRONG KHO
  -- Nếu GCN gốc vẫn đang lưu kho, bắt buộc người dùng/thủ kho phải làm phiếu
  -- Xuất kho GCN gốc trước khi làm thủ tục nhập kho GCN mới.
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
      -- B. TÁCH MỘT PHẦN:
      -- Sổ cũ: invalidation_type = 'PARTIAL', cập nhật area = remaining_area, giữ is_in_warehouse = true
      UPDATE public.assets 
      SET invalidation_type = 'PARTIAL',
          remaining_area = COALESCE(v_rem_area, (area - v_req.area)),
          area = COALESCE(v_rem_area, (area - v_req.area)),
          is_in_warehouse = true,
          custody_status = 'in_stock',
          updated_at = now(),
          updated_by = v_reviewer
      WHERE id = v_parent_id;
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
    INSERT INTO public.transactions (type, status, notes, created_by, warehouse_id)
    VALUES (
      'checkin',
      'completed',
      'Nhập kho tự động sau khi phê duyệt yêu cầu khai báo GCN ' || v_req.certificate_no ||
        CASE 
          WHEN v_rel_type = 'SPLIT_FULL' THEN ' (Tách toàn phần từ sổ gốc)'
          WHEN v_rel_type = 'SPLIT_PARTIAL' THEN ' (Tách một phần từ sổ gốc)'
          WHEN v_rel_type = 'RENEW' THEN ' (Cấp đổi từ sổ cũ)'
          ELSE ' (Cấp mới)'
        END,
      v_reviewer,
      v_req.warehouse_id
    )
    RETURNING id INTO v_tx_id;
  END IF;

  INSERT INTO public.transaction_items (
    transaction_id, asset_id, type, details, status, 
    decided_by, decided_at, notes, voucher_code, reason
  ) VALUES (
    v_tx_id,
    v_asset_id,
    'checkin',
    jsonb_build_object(
      'request_id', v_req.id,
      'request_type', v_req.request_type,
      'relationship_type', v_rel_type,
      'parent_asset_id', v_parent_id,
      'remaining_area', v_rem_area,
      'certificate_no', v_req.certificate_no,
      'land_lot_no', v_req.land_lot_no,
      'map_sheet_no', v_req.map_sheet_no,
      'area', v_req.area,
      'warehouse_id', v_req.warehouse_id,
      'voucher_code', v_voucher_code
    ),
    'approved',
    v_reviewer,
    now(),
    'Phê duyệt và tự động nhập kho theo đề xuất khai báo GCN',
    v_voucher_code,
    CASE 
      WHEN v_rel_type IN ('SPLIT_FULL', 'SPLIT_PARTIAL') THEN 'tách sổ'
      WHEN v_rel_type = 'RENEW' THEN 'đổi sổ'
      ELSE 'cấp mới'
    END
  );

  -- 4. GHI NHẬT KÝ BIẾN ĐỘNG (ACTIVITY_LOGS)
  SELECT w.name INTO v_warehouse_name FROM public.warehouses w WHERE w.id = v_req.warehouse_id;

  INSERT INTO public.activity_logs (
    log_date, action_type, document_no, description, used_by, notes,
    asset_id, transaction_id, warehouse_id, performed_by
  ) VALUES (
    CURRENT_DATE, 'Nhập sổ', v_voucher_code,
    'Nhập lưu kho GCN QSDĐ ' || v_req.certificate_no || ' về kho ' || COALESCE(v_warehouse_name, 'chưa xác định') ||
      CASE 
        WHEN v_rel_type = 'SPLIT_FULL' THEN ' (Tách toàn phần từ sổ gốc)'
        WHEN v_rel_type = 'SPLIT_PARTIAL' THEN ' (Tách một phần từ sổ gốc)'
        WHEN v_rel_type = 'RENEW' THEN ' (Cấp đổi từ sổ cũ)'
        ELSE ' (Cấp mới)'
      END,
    'BTC VMT', NULL,
    v_asset_id, v_tx_id, v_req.warehouse_id, v_reviewer
  );

  -- 5. CẬP NHẬT TRẠNG THÁI YÊU CẦU KHAI BÁO
  UPDATE public.asset_declaration_requests
  SET status = 'approved',
      resulting_asset_id = v_asset_id,
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      voucher_code = v_voucher_code,
      parent_asset_id = v_parent_id,
      relationship_type = v_rel_type
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) TO authenticated;
