-- rollback_0062_old_definitions.sql (KHÔNG phải migration)
-- KHÔNG đặt vào supabase/migrations/. Lưu ở docs/rollback/.
-- Nguyên văn 4 hàm đang chạy trong DB trước khi áp dụng 0062 (lấy bằng pg_get_functiondef ngày 01/10/2026).
-- Chỉ chạy khi 0062 gây lỗi nghiệp vụ và đã được xác nhận. Lưu ý: bản cũ KHÔNG kiểm tra vai trò ở lock/reopen/lookup.
BEGIN;

CREATE OR REPLACE FUNCTION public.lock_reporting_period(p_snapshot_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  
  SELECT coalesce(full_name, email, 'Quản trị viên')
  INTO v_user_name
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_name IS NULL THEN
    v_user_name := 'Admin / Người dùng hệ thống';
  END IF;

  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_snapshot.period_status = 'locked' THEN
    RAISE EXCEPTION 'Kỳ báo cáo này đã ở trạng thái khóa (locked) trước đó';
  END IF;

  UPDATE report_snapshots
  SET 
    period_status = 'locked',
    locked_at = timezone('utc'::text, now()),
    locked_by = v_user_id,
    locked_by_name = v_user_name,
    notes = coalesce(p_notes, notes),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_snapshot_id;

  INSERT INTO audit_logs (
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    changed_by_name,
    notes,
    created_at
  ) VALUES (
    p_snapshot_id::text,
    'LOCK_REPORT_PERIOD',
    jsonb_build_object('period_status', v_snapshot.period_status),
    jsonb_build_object('period_status', 'locked', 'locked_at', timezone('utc'::text, now()), 'locked_by_name', v_user_name),
    v_user_id,
    v_user_name,
    concat('Chốt và khóa kỳ báo cáo [', v_snapshot.report_code, ' - ', v_snapshot.report_period, ']. Toàn bộ dữ liệu tĩnh đã được niêm phong an toàn.'),
    timezone('utc'::text, now())
  );

  SELECT to_jsonb(r) INTO v_result
  FROM report_snapshots r
  WHERE r.id = p_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã chốt và khóa kỳ báo cáo thành công. Dữ liệu đã được niêm phong.',
    'snapshot', v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_asset_status(p_query text)
 RETURNS TABLE(certificate_no text, project_name text, legal_lot_code text, custody_status text, lifecycle_status text, sale_status text, mortgage_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        a.certificate_no,
        p.name AS project_name,
        a.legal_lot_code,
        a.custody_status,
        a.lifecycle_status,
        a.sale_status,
        a.mortgage_status
    FROM public.assets a
    LEFT JOIN public.projects p ON p.id = a.project_id
    WHERE (
        a.certificate_no ILIKE '%' || p_query || '%'
        OR a.legal_lot_code ILIKE '%' || p_query || '%'
        OR p.name ILIKE '%' || p_query || '%'
    )
    LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_reporting_period(p_snapshot_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  -- 1. Lấy thông tin người dùng đang gọi
  v_user_id := auth.uid();
  
  SELECT coalesce(full_name, email, 'Quản trị viên')
  INTO v_user_name
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_name IS NULL THEN
    v_user_name := 'Admin / Người dùng hệ thống';
  END IF;

  -- 2. Kiểm tra lý do mở khóa
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng cung cấp lý do mở khóa kỳ báo cáo hợp lệ và rõ ràng (tối thiểu 5 ký tự)';
  END IF;

  -- 3. Kiểm tra bản ghi snapshot
  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_snapshot.period_status != 'locked' THEN
    RAISE EXCEPTION 'Kỳ báo cáo "%" hiện đang ở trạng thái "%", không cần mở khóa', v_snapshot.report_period, v_snapshot.period_status;
  END IF;

  -- 4. Bật cờ session bảo mật để Trigger cho phép cập nhật trạng thái
  PERFORM set_config('app.reopening_period', 'true', true);

  -- 5. Cập nhật trạng thái kỳ báo cáo về 'open'
  UPDATE report_snapshots
  SET 
    period_status = 'open',
    reopened_at = timezone('utc'::text, now()),
    reopened_by = v_user_id,
    reopened_by_name = v_user_name,
    reopen_reason = trim(p_reason),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_snapshot_id;

  -- 6. Tắt cờ session bảo mật
  PERFORM set_config('app.reopening_period', 'false', true);

  -- 7. Ghi nhận bắt buộc vào bảng `audit_logs` để lưu vết đầy đủ
  INSERT INTO audit_logs (
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    changed_by_name,
    notes,
    created_at
  ) VALUES (
    p_snapshot_id::text,
    'REOPEN_REPORT_PERIOD',
    jsonb_build_object(
      'report_code', v_snapshot.report_code,
      'report_period', v_snapshot.report_period,
      'period_status', 'locked',
      'locked_at', v_snapshot.locked_at,
      'locked_by_name', v_snapshot.locked_by_name
    ),
    jsonb_build_object(
      'report_code', v_snapshot.report_code,
      'report_period', v_snapshot.report_period,
      'period_status', 'open',
      'reopened_at', timezone('utc'::text, now()),
      'reopened_by', v_user_id,
      'reopened_by_name', v_user_name,
      'reopen_reason', trim(p_reason)
    ),
    v_user_id,
    v_user_name,
    concat('Mở khóa kỳ báo cáo [', v_snapshot.report_code, ' - ', v_snapshot.report_period, ']. Lý do: ', trim(p_reason)),
    timezone('utc'::text, now())
  );

  -- Lấy kết quả mới nhất trả về
  SELECT to_jsonb(r) INTO v_result
  FROM report_snapshots r
  WHERE r.id = p_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã mở khóa kỳ báo cáo thành công. Trạng thái đã chuyển sang OPEN.',
    'snapshot', v_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_asset_ownership(p_asset_id uuid, p_to_entity_id uuid, p_to_role text, p_note text, p_transferred_by uuid)
 RETURNS asset_ownership_transfers
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_current_owner_entity_id uuid;
    v_current_owner_role text;
    v_caller_role text;
    v_caller_permissions text[];
    v_caller_managed_warehouses uuid[];
    v_caller_assigned_warehouses uuid[];
    v_asset_warehouse_id uuid;
    v_transfer_row asset_ownership_transfers;
BEGIN
    -- Kiểm tra thông tin user
    SELECT role, permissions, managed_warehouse_ids, assigned_warehouse_ids
    INTO v_caller_role, v_caller_permissions, v_caller_managed_warehouses, v_caller_assigned_warehouses
    FROM profiles WHERE id = auth.uid();

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy thông tin người dùng / Chưa đăng nhập';
    END IF;

    -- Đọc thông tin sở hữu hiện tại của tài sản và warehouse_id
    SELECT current_owner_entity_id, current_owner_role, warehouse_id
    INTO v_current_owner_entity_id, v_current_owner_role, v_asset_warehouse_id
    FROM assets
    WHERE id = p_asset_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tài sản không tồn tại (id = %)', p_asset_id;
    END IF;

    -- Kiểm tra quyền
    IF NOT (
      v_caller_role IN ('super_admin', 'admin', 'btc_manager')
      OR (v_caller_permissions IS NOT NULL AND 'admin.manage' = ANY(v_caller_permissions))
      OR (
        v_caller_role = 'warehouse_manager'
        AND v_asset_warehouse_id IS NOT NULL
        AND (
          v_asset_warehouse_id = ANY(COALESCE(v_caller_managed_warehouses, ARRAY[]::uuid[]))
          OR v_asset_warehouse_id = ANY(COALESCE(v_caller_assigned_warehouses, ARRAY[]::uuid[]))
        )
      )
    ) THEN
      RAISE EXCEPTION 'Bạn không có quyền chuyển nhượng tài sản này';
    END IF;

    -- Thêm bản ghi vào bảng asset_ownership_transfers
    INSERT INTO asset_ownership_transfers (
        asset_id,
        from_entity_id,
        from_role,
        to_entity_id,
        to_role,
        transferred_by,
        transferred_at,
        note
    ) VALUES (
        p_asset_id,
        v_current_owner_entity_id,
        v_current_owner_role,
        p_to_entity_id,
        p_to_role,
        p_transferred_by,
        now(),
        p_note
    ) RETURNING * INTO v_transfer_row;

    -- Cập nhật bảng assets
    UPDATE assets
    SET current_owner_entity_id = p_to_entity_id,
        current_owner_role = p_to_role,
        updated_at = now(),
        updated_by = p_transferred_by
    WHERE id = p_asset_id;

    RETURN v_transfer_row;
END;
$function$;

COMMIT;
