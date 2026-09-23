-- ==============================================================================
-- MIGRATION: 0037_activity_logs_scope_and_declaration_voucher.sql
-- MỤC ĐÍCH:
--   1. Sửa RLS SELECT trên activity_logs ("Nhật ký biến động"): hiện tại chỉ dựa vào
--      has_permission('log.view') — quyền này KHÔNG nằm trong danh sách quyền có thể
--      cấp trên giao diện (src/lib/permissions.ts) và mặc định = rỗng cho warehouse_manager,
--      nên trên thực tế CHỈ super_admin/admin/btc_manager xem được, Quản lý kho dù được
--      cấp quyền vào trang vẫn luôn thấy trống. Sửa lại theo đúng khuôn mẫu đã dùng cho
--      assets/access_requests/report_snapshots (migration 0011): kiểm tra thẳng theo
--      role + managed_warehouse_ids, không phụ thuộc permission key rời rạc.
--   2. Bổ sung "Phương án B" cho luồng duyệt "đề nghị nhập sổ" (asset_declaration_requests,
--      RPC approve_asset_declaration_request / _bulk từ migration 0024):
--      - Sinh mã chứng từ (voucher_code) đúng định dạng đang dùng cho các phiếu khác:
--        [VÙNG]-[MÃ KHO]-PN-[SỐ]/[NĂM], gán vào transaction_items.voucher_code.
--      - Ghi thêm 1 dòng vào activity_logs (action_type='Nhập sổ') để hiện đúng trong
--        "Nhật ký biến động" — trước đây RPC không hề ghi bảng này vì toàn bộ chạy trong
--        SQL, không đi qua hàm JS logActivity() như các luồng khác.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. RLS SELECT trên activity_logs — theo đúng kho phụ trách (Quản lý kho),
--    toàn quyền cho super_admin/admin/btc_manager, không ai khác xem được.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_logs_select_scoped" ON public.activity_logs;

CREATE POLICY "activity_logs_select_scoped"
ON public.activity_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role IN ('super_admin', 'admin', 'btc_manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role = 'warehouse_manager'
    AND public.activity_logs.warehouse_id = ANY(p.managed_warehouse_ids)
  )
);

-- ------------------------------------------------------------------------------
-- 2. Hàm sinh mã chứng từ tiếp theo cho 1 kho (dùng chung, tương đương
--    generateNextVoucherCode() phía JS ở src/lib/voucherEngine.ts).
--    Định dạng: [VÙNG]-[MÃ KHO 3 SỐ]-[PN|PX]-[SỐ THỨ TỰ 4 SỐ]/[NĂM]
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._next_voucher_code(
  p_warehouse_id uuid,
  p_voucher_type text -- 'PN' hoặc 'PX'
) RETURNS text AS $$
DECLARE
  v_region_code text;
  v_wh_code text;
  v_prefix text;
  v_year_suffix text;
  v_max_seq integer := 0;
  v_next_seq integer;
BEGIN
  SELECT
    UPPER(COALESCE(w.region_code, 'VMT')),
    LPAD(COALESCE(w.code, '1'), 3, '0')
  INTO v_region_code, v_wh_code
  FROM public.warehouses w WHERE w.id = p_warehouse_id;

  IF v_region_code IS NULL THEN
    v_region_code := 'VMT';
    v_wh_code := '001';
  END IF;

  v_prefix := v_region_code || '-' || v_wh_code || '-' || p_voucher_type || '-';
  v_year_suffix := '/' || EXTRACT(YEAR FROM now())::text;

  SELECT COALESCE(MAX(
    CASE
      WHEN UPPER(ti.voucher_code) LIKE v_prefix || '%' || v_year_suffix
      THEN NULLIF(regexp_replace(
             SUBSTRING(UPPER(ti.voucher_code) FROM LENGTH(v_prefix) + 1 FOR LENGTH(UPPER(ti.voucher_code)) - LENGTH(v_prefix) - LENGTH(v_year_suffix)),
             '[^0-9]', '', 'g'
           ), '')::integer
      ELSE 0
    END
  ), 0) INTO v_max_seq
  FROM public.transaction_items ti
  WHERE ti.voucher_code IS NOT NULL;

  v_next_seq := v_max_seq + 1;

  RETURN v_prefix || LPAD(v_next_seq::text, 4, '0') || v_year_suffix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 3. Viết lại _process_single_declaration_approval: thêm voucher_code +
--    ghi activity_logs (giữ nguyên toàn bộ logic tạo/cập nhật asset của 0024).
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
  v_voucher_code text;
  v_warehouse_name text;
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

  -- Ghi Nhật ký biến động (activity_logs) — trước đây bị thiếu vì RPC chạy hoàn toàn
  -- trong SQL, không đi qua hàm JS logActivity() như các luồng duyệt khác.
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

GRANT EXECUTE ON FUNCTION public._next_voucher_code(uuid, text) TO authenticated;

COMMIT;

-- ==============================================================================
-- KIỂM THỬ SAU KHI CHẠY (thực hiện thủ công trên SQL Editor hoặc app thật):
--   1. Đăng nhập 1 tài khoản warehouse_manager, quan sát managed_warehouse_ids của
--      họ (select managed_warehouse_ids from profiles where email = '...').
--      Vào trang Nhật ký biến động: phải CHỈ thấy các dòng có warehouse_id nằm trong
--      danh sách đó, KHÔNG thấy kho khác, KHÔNG còn trống trơn như trước.
--   2. Duyệt thử 1 "đề nghị nhập sổ" (Requests.tsx > tab GCN mới) bằng tài khoản admin.
--      Sau đó vào Nhật ký biến động: phải thấy ngay 1 dòng "Nhập sổ" mới, có mã chứng từ
--      dạng VMT-001-PN-000x/2026, bấm "In phiếu" phải mở được.
--   3. Duyệt hàng loạt (bulk) nhiều đề nghị cùng lúc: mỗi GCN phải có 1 mã chứng từ
--      RIÊNG (số thứ tự tăng dần), không bị trùng nhau dù cùng 1 transaction.
-- ==============================================================================

-- ROLLBACK (chỉ chạy nếu có sự cố — khôi phục policy/hàm về bản 0024, KHÔNG xóa
-- các activity_logs / voucher_code đã sinh ra):
-- DROP POLICY IF EXISTS "activity_logs_select_scoped" ON public.activity_logs;
-- CREATE POLICY "activity_logs_select_scoped" ON public.activity_logs FOR SELECT USING (has_permission('log.view'));
-- (Rồi chạy lại nguyên văn hàm _process_single_declaration_approval từ file
--  "0024 fix approve declaration request .sql" để khôi phục bản không có voucher_code/activity_logs.)
