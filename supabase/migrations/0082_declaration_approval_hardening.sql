-- 0082_declaration_approval_hardening.sql
-- Phạm vi: luồng DUYỆT HỒ SƠ KHAI BÁO GCN (approve_asset_declaration_request, approve_asset_declaration_requests_bulk,
--          _process_single_declaration_approval). KHÔNG đụng logic tách sổ / cao tầng / diện tích (việc của Prompt 7 - dev).
-- Vấn đề (đọc từ định nghĩa đang chạy trên DB):
--   1. Mã tài sản sinh bằng MAX()+1 (hai người duyệt cùng lúc => đụng mã), và khi không có tiền tố thì dùng random() 8 chữ số.
--   2. p_asset_code_prefix ghép thẳng vào biểu thức chính quy ('^' || prefix || ...) => regex injection / LIKE ký tự đại diện.
--   3. Bất kỳ ai có 'request.approve' duyệt được hồ sơ của MỌI kho (không kiểm tra phạm vi kho); approve_* thiếu search_path.
--   4. GCN trùng số (nay được phép nếu xác nhận - 0080) không có đường truyền lý do xác nhận khi duyệt: trigger sẽ chặn.
--   6. Bản 0065 ghi transaction_items.status = 'confirmed' trong khi ràng buộc transaction_items_status_check chỉ cho
--      pending/approved/rejected/completed/cancelled => hàm duyệt chưa từng chạy được. Sửa về 'approved' (như bản 0037; giao diện
--      cũng chỉ nhận biết 'approved').
--   5. DB thật thiếu 12 cột của asset_declaration_requests (0038 chưa áp dụng + voucher_code/transaction_id/review_notes chưa từng có
--      migration) => hàm duyệt lỗi 'v_req has no field managing_unit'. Thêm ở bước A0 (IF NOT EXISTS, chạy lại an toàn) kèm
--      ràng buộc link scan chk_adr_scan_link của 0071. (4 cột của bảng transactions mà nhánh dự phòng của hàm duyệt dùng
--      - transaction_code/status/confirmed_by/confirmed_at - KHÔNG thêm, vì mọi nơi gọi đều truyền sẵn mã giao dịch.)
-- Sửa:
--   A. Thêm duplicate_ack_reason/by/at cho asset_declaration_requests.
--   B. _allocate_asset_code_by_prefix(prefix): cấp mã bằng bộ đếm (nội bộ, đã kiểm tra định dạng tiền tố).
--   C. _assert_declaration_scope(warehouse_id): admin/super_admin/btc_manager mọi kho; warehouse_manager chỉ kho mình quản lý.
--   D. _process_single_declaration_approval: giữ NGUYÊN logic cũ, chỉ (i) kiểm tra phạm vi kho, (ii) cấp mã qua bộ đếm
--      (không còn random; thiếu tiền tố thì dùng tiền tố của sổ gốc, không có sổ gốc thì VMT_DNG_<loại>_), (iii) chuyển
--      duplicate_ack_reason của hồ sơ sang GCN mới.
--   E. approve_asset_declaration_request: thêm tham số p_duplicate_ack_reason (mặc định NULL, tối thiểu 10 ký tự nếu có),
--      search_path, đăng nhập, kiểm tra phạm vi kho cả khi từ chối. (Xóa bản 4 tham số cũ, tạo bản 5 tham số.)
--   F. approve_asset_declaration_requests_bulk: cùng chữ ký; thêm search_path, kiểm tra đầu vào (1..500 hồ sơ),
--      và nhận duplicate_ack_reason theo từng hồ sơ.
BEGIN;

-- ===== A0: cột mà luồng khai báo/duyệt hồ sơ cần nhưng DB thật còn THIẾU =====
-- Phát hiện khi chạy test 0082 + check_missing_columns: migration 0038 (chuẩn 27 thuộc tính) CHƯA được áp dụng trên DB thật, và
-- không có migration nào thêm voucher_code / transaction_id / review_notes cho bảng này (hàm duyệt bản 0065 của dev ghi vào các cột đó).
-- Hậu quả trước khi sửa: hàm duyệt báo 'record "v_req" has no field "managing_unit"' (không duyệt được hồ sơ nào), và tạo hồ sơ
-- khai báo có thông tin thế chấp/đơn vị quản lý/link scan cũng thất bại. Kiểu dữ liệu lấy theo 0038. Chạy lại nhiều lần vẫn an toàn.
ALTER TABLE public.asset_declaration_requests
  ADD COLUMN IF NOT EXISTS managing_unit TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS mortgage_bank TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_unit TEXT,
  ADD COLUMN IF NOT EXISTS mortgage_valuation NUMERIC,
  ADD COLUMN IF NOT EXISTS collateral_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS collateral_value NUMERIC,
  ADD COLUMN IF NOT EXISTS mortgage_expected_release_date DATE,
  ADD COLUMN IF NOT EXISTS scan_file_url TEXT,
  ADD COLUMN IF NOT EXISTS voucher_code TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Ràng buộc định dạng link scan của 0071 (0071 bị bỏ qua vì lúc đó bảng chưa có cột scan_file_url). Chỉ áp cho dữ liệu mới.
ALTER TABLE public.asset_declaration_requests DROP CONSTRAINT IF EXISTS chk_adr_scan_link;
ALTER TABLE public.asset_declaration_requests ADD CONSTRAINT chk_adr_scan_link CHECK (
  scan_file_url IS NULL
  OR btrim(scan_file_url) = ''
  OR scan_file_url ~* '^https://([a-z0-9-]+\.)*(sharepoint\.com|1drv\.ms|onedrive\.live\.com)(/|$)'
  OR scan_file_url ~ '^[A-Za-z0-9_./-]+$'
) NOT VALID;

-- ===== A =====
ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS duplicate_ack_reason text;
ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS duplicate_ack_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS duplicate_ack_at timestamptz;

-- ===== B =====
CREATE OR REPLACE FUNCTION public._allocate_asset_code_by_prefix(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prefix text := upper(btrim(COALESCE(p_prefix, '')));
  v_seed   bigint := 0;
  v_seq    bigint;
  v_code   text;
  v_try    integer := 0;
BEGIN
  IF v_prefix !~ '^[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_$' THEN
    RAISE EXCEPTION 'Tiền tố mã tài sản không hợp lệ: "%".', COALESCE(p_prefix, '') USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.asset_code_counters WHERE prefix = v_prefix) THEN
    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_seed
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);
  END IF;

  LOOP
    INSERT INTO public.asset_code_counters (prefix, last_seq)
    VALUES (v_prefix, v_seed + 1)
    ON CONFLICT (prefix) DO UPDATE
      SET last_seq = public.asset_code_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_code := v_prefix || lpad(v_seq::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE asset_code = v_code);

    SELECT COALESCE(max(CASE WHEN substring(asset_code FROM length(v_prefix) + 1) ~ '^[0-9]{1,15}$'
                             THEN substring(asset_code FROM length(v_prefix) + 1)::bigint END), 0)
    INTO v_seed
    FROM public.assets
    WHERE asset_code IS NOT NULL AND starts_with(asset_code, v_prefix);

    UPDATE public.asset_code_counters
    SET last_seq = GREATEST(last_seq, v_seed), updated_at = now()
    WHERE prefix = v_prefix;
    v_seed := 0;

    v_try := v_try + 1;
    IF v_try > 5 THEN
      RAISE EXCEPTION 'Không cấp được mã tài sản (xung đột liên tục với tiền tố %).', v_prefix;
    END IF;
  END LOOP;

  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public._allocate_asset_code_by_prefix(text) FROM PUBLIC, anon, authenticated;

-- ===== C =====
CREATE OR REPLACE FUNCTION public._assert_declaration_scope(p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_managed uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role, managed_warehouse_ids INTO v_role, v_managed
  FROM public.profiles WHERE id = v_uid AND status = 'active';

  IF v_role IN ('super_admin', 'admin', 'btc_manager') THEN
    RETURN;
  ELSIF v_role = 'warehouse_manager'
        AND p_warehouse_id IS NOT NULL
        AND p_warehouse_id = ANY (COALESCE(v_managed, ARRAY[]::uuid[])) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Hồ sơ khai báo này không thuộc phạm vi duyệt của bạn.' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_declaration_scope(uuid) FROM PUBLIC, anon, authenticated;

-- ===== D: giữ nguyên logic cũ, chỉ thêm 3 thay đổi (đánh dấu [0082]) =====
CREATE OR REPLACE FUNCTION public._process_single_declaration_approval(p_request_id uuid, p_asset_code_prefix text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req public.asset_declaration_requests%ROWTYPE;
  v_asset_id UUID;
  v_asset_code TEXT;
  v_tx_id UUID;
  v_voucher_code TEXT;
  v_warehouse_name TEXT;
  v_reviewer UUID;
  v_parent_id UUID;
  v_parent public.assets%ROWTYPE;
  v_rel_type TEXT;
  v_rem_area NUMERIC;
  v_is_high_rise BOOLEAN := false;
  v_prefix TEXT;
BEGIN
  v_reviewer := auth.uid();

  SELECT * INTO v_req
  FROM public.asset_declaration_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu khai báo ID %', p_request_id;
  END IF;

  -- [0082] kiểm tra phạm vi kho của người duyệt
  PERFORM public._assert_declaration_scope(v_req.warehouse_id);

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

  -- Kiểm tra xem tài sản mới có thuộc nhóm Cao tầng / Căn hộ / Sàn 3D hay không
  IF v_req.asset_type IS NOT NULL AND (
    v_req.asset_type ILIKE '%Căn hộ%' OR
    v_req.asset_type ILIKE '%Condotel%' OR
    v_req.asset_type ILIKE '%Officetel%' OR
    v_req.asset_type ILIKE '%Sàn thương mại%' OR
    v_req.asset_type ILIKE '%khối đế%' OR
    v_req.asset_type ILIKE '%cao tầng%' OR
    v_req.asset_type ILIKE '%penthouse%' OR
    v_req.asset_type ILIKE '%duplex%'
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
  -- [0082] mã tài sản cấp bằng bộ đếm nguyên tử (thay cho MAX()+1 và random())
  IF p_asset_code_prefix IS NOT NULL AND btrim(p_asset_code_prefix) <> '' THEN
    v_prefix := p_asset_code_prefix;
  ELSE
    v_prefix := NULL;
    IF v_parent_id IS NOT NULL THEN
      IF v_parent.asset_code ~ '^[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_[0-9]+$' THEN
        v_prefix := substring(v_parent.asset_code FROM '^(.*_)[0-9]+$');
      END IF;
    END IF;
    IF v_prefix IS NULL THEN
      v_prefix := 'VMT_DNG_' || upper(COALESCE(NULLIF(btrim(v_req.collateral_type), ''), 'BDS')) || '_';
    END IF;
  END IF;
  v_asset_code := public._allocate_asset_code_by_prefix(v_prefix);

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
    custody_status, lifecycle_status, sale_status,
    duplicate_ack_reason
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
    'in_stock', 'active', 'not_ready',
    v_req.duplicate_ack_reason
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
    'approved', -- [0082] bản 0065 ghi 'confirmed' nhưng ràng buộc transaction_items_status_check (0057) không cho phép; bản 0037 cũ dùng 'approved'
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
$function$;

-- ===== E: bản 5 tham số =====
DROP FUNCTION IF EXISTS public.approve_asset_declaration_request(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.approve_asset_declaration_request(
  p_request_id uuid,
  p_decision text,
  p_asset_code_prefix text DEFAULT NULL::text,
  p_rejection_reason text DEFAULT NULL::text,
  p_duplicate_ack_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_req record;
  v_tx_id uuid;
  v_uid uuid := auth.uid();
  v_ack text := NULLIF(btrim(COALESCE(p_duplicate_ack_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission('request.approve') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.asset_declaration_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu';
  END IF;

  PERFORM public._assert_declaration_scope(v_req.warehouse_id);

  IF p_decision = 'rejected' THEN
    IF v_req.status <> 'pending' THEN
      RAISE EXCEPTION 'Yêu cầu đã được xử lý trước đó';
    END IF;
    UPDATE public.asset_declaration_requests
    SET status = 'rejected', rejection_reason = p_rejection_reason,
        reviewed_by = v_uid, reviewed_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  IF p_decision <> 'approved' THEN
    RAISE EXCEPTION 'Giá trị p_decision không hợp lệ: %', p_decision USING ERRCODE = '22023';
  END IF;

  IF v_ack IS NOT NULL THEN
    IF char_length(v_ack) < 10 THEN
      RAISE EXCEPTION 'Lý do xác nhận trùng số GCN cần tối thiểu 10 ký tự.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.asset_declaration_requests
    SET duplicate_ack_reason = v_ack, duplicate_ack_by = v_uid, duplicate_ack_at = now()
    WHERE id = p_request_id AND status = 'pending';
  END IF;

  INSERT INTO public.transactions (type, requester_id, details)
  VALUES ('checkin', v_req.requester_id, jsonb_build_object('source', 'declaration_request', 'request_id', p_request_id))
  RETURNING id INTO v_tx_id;

  PERFORM public._process_single_declaration_approval(p_request_id, p_asset_code_prefix, v_tx_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_asset_declaration_request(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_asset_declaration_request(uuid, text, text, text, text) TO authenticated;

-- ===== F: duyệt hàng loạt =====
CREATE OR REPLACE FUNCTION public.approve_asset_declaration_requests_bulk(
  p_items jsonb
) RETURNS TABLE (request_id uuid, asset_id uuid, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tx_id uuid;
  v_item jsonb;
  v_asset_id uuid;
  v_uid uuid := auth.uid();
  v_ack text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission('request.approve') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'Danh sách hồ sơ duyệt hàng loạt phải là mảng từ 1 đến 500 hồ sơ.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (type, requester_id, details)
  VALUES ('checkin', v_uid, jsonb_build_object('source', 'declaration_request_bulk', 'count', jsonb_array_length(p_items)))
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_ack := NULLIF(btrim(COALESCE(v_item->>'duplicate_ack_reason', '')), '');
      IF v_ack IS NOT NULL THEN
        IF char_length(v_ack) < 10 THEN
          RAISE EXCEPTION 'Lý do xác nhận trùng số GCN cần tối thiểu 10 ký tự.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.asset_declaration_requests AS r
        SET duplicate_ack_reason = v_ack, duplicate_ack_by = v_uid, duplicate_ack_at = now()
        WHERE r.id = (v_item->>'request_id')::uuid AND r.status = 'pending';
      END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.approve_asset_declaration_requests_bulk(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_asset_declaration_requests_bulk(jsonb) TO authenticated;

COMMIT;

-- ROLLBACK: cần định nghĩa cũ của 3 hàm (đã gửi ngày 04/10/2026; lưu thành ops/rollback/rollback_0082_declaration_approval.sql).
--   DROP FUNCTION public.approve_asset_declaration_request(uuid,text,text,text,text) rồi tạo lại bản 4 tham số cũ.