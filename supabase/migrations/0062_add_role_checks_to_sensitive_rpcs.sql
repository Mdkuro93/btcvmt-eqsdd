-- 0062_add_role_checks_to_sensitive_rpcs.sql
-- Lý do (dựa trên pg_get_functiondef bản THẬT trong DB):
--   1. lock_reporting_period   : KHÔNG kiểm tra vai trò -> mọi tài khoản đăng nhập (viewer, investor...) khóa được kỳ báo cáo.
--   2. reopen_reporting_period : KHÔNG kiểm tra vai trò -> mọi tài khoản đăng nhập mở khóa được kỳ đã niêm phong.
--   3. lookup_asset_status     : SECURITY DEFINER bỏ qua RLS, không lọc phạm vi -> mọi tài khoản đăng nhập tra được
--                                GCN/dự án/trạng thái của TẤT CẢ kho và chủ đầu tư.
--   4. transfer_asset_ownership: đã có kiểm tra quyền, nhưng tin p_transferred_by do client gửi (giả mạo người thực hiện),
--                                không khóa dòng, thiếu search_path.
-- Phạm vi: CHỈ viết lại 4 hàm trên, GIỮ NGUYÊN chữ ký (client không phải sửa).
-- Quyền EXECUTE đặt ở 0061 được giữ nguyên (CREATE OR REPLACE không đổi ACL).
-- Bản cũ nguyên văn để hoàn tác: docs/rollback/rollback_0062_old_definitions.sql
-- GIẢ ĐỊNH NGHIỆP VỤ (cần xác nhận):
--   - Khóa kỳ : super_admin/admin/btc_manager (mọi kỳ); warehouse_manager (chỉ kỳ thuộc kho mình quản lý).
--   - Mở khóa : chỉ super_admin/admin/btc_manager.
--   - Tra cứu : theo phạm vi AGENTS #4 (admin/BTC: tất cả; quản lý kho: managed; phòng ban/supervisor: assigned;
--               investor: owner_entity_ids; viewer: viewer_warehouse_access còn hạn).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. lock_reporting_period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_reporting_period(p_snapshot_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_role TEXT;
  v_managed UUID[];
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();

  SELECT p.role, p.managed_warehouse_ids, coalesce(p.full_name, p.email, 'Quản trị viên')
  INTO v_role, v_managed, v_user_name
  FROM profiles p
  WHERE p.id = v_user_id AND p.status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập hoặc tài khoản không hoạt động';
  END IF;

  IF v_role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền khóa kỳ báo cáo';
  END IF;

  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_role = 'warehouse_manager'
     AND (v_snapshot.warehouse_id IS NULL
          OR NOT (v_snapshot.warehouse_id = ANY (coalesce(v_managed, ARRAY[]::uuid[])))) THEN
    RAISE EXCEPTION 'Bạn chỉ được khóa kỳ báo cáo thuộc kho mình quản lý';
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
    record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at
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

-- ---------------------------------------------------------------------------
-- 2. reopen_reporting_period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_reporting_period(p_snapshot_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_role TEXT;
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();

  SELECT p.role, coalesce(p.full_name, p.email, 'Quản trị viên')
  INTO v_role, v_user_name
  FROM profiles p
  WHERE p.id = v_user_id AND p.status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập hoặc tài khoản không hoạt động';
  END IF;

  IF v_role NOT IN ('super_admin', 'admin', 'btc_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền mở khóa kỳ báo cáo';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng cung cấp lý do mở khóa kỳ báo cáo hợp lệ và rõ ràng (tối thiểu 5 ký tự)';
  END IF;

  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_snapshot.period_status != 'locked' THEN
    RAISE EXCEPTION 'Kỳ báo cáo "%" hiện đang ở trạng thái "%", không cần mở khóa', v_snapshot.report_period, v_snapshot.period_status;
  END IF;

  PERFORM set_config('app.reopening_period', 'true', true);

  UPDATE report_snapshots
  SET
    period_status = 'open',
    reopened_at = timezone('utc'::text, now()),
    reopened_by = v_user_id,
    reopened_by_name = v_user_name,
    reopen_reason = trim(p_reason),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_snapshot_id;

  PERFORM set_config('app.reopening_period', 'false', true);

  INSERT INTO audit_logs (
    record_id, action, old_data, new_data, changed_by, changed_by_name, notes, created_at
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

-- ---------------------------------------------------------------------------
-- 3. lookup_asset_status: lọc theo phạm vi của người gọi (SECURITY DEFINER bỏ qua RLS nên phải tự lọc)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_asset_status(p_query text)
 RETURNS TABLE(certificate_no text, project_name text, legal_lot_code text, custody_status text, lifecycle_status text, sale_status text, mortgage_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_managed UUID[];
  v_assigned UUID[];
  v_owner UUID[];
BEGIN
  v_uid := auth.uid();

  SELECT p.role, p.managed_warehouse_ids, p.assigned_warehouse_ids, p.owner_entity_ids
  INTO v_role, v_managed, v_assigned, v_owner
  FROM profiles p
  WHERE p.id = v_uid AND p.status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập hoặc tài khoản không hoạt động';
  END IF;

  RETURN QUERY
  SELECT
      a.certificate_no,
      pr.name AS project_name,
      a.legal_lot_code,
      a.custody_status,
      a.lifecycle_status,
      a.sale_status,
      a.mortgage_status
  FROM assets a
  LEFT JOIN projects pr ON pr.id = a.project_id
  WHERE (
      a.certificate_no ILIKE '%' || p_query || '%'
      OR a.legal_lot_code ILIKE '%' || p_query || '%'
      OR pr.name ILIKE '%' || p_query || '%'
  )
  AND (
      v_role IN ('super_admin', 'admin', 'btc_manager')
      OR (v_role = 'warehouse_manager'
          AND a.warehouse_id = ANY (coalesce(v_managed, ARRAY[]::uuid[])))
      OR (v_role IN ('capital_dept', 'project_dept', 're_dept', 'supervisor')
          AND a.warehouse_id = ANY (coalesce(v_assigned, ARRAY[]::uuid[])))
      OR (v_role = 'investor'
          AND a.current_owner_entity_id = ANY (coalesce(v_owner, ARRAY[]::uuid[])))
      OR (v_role = 'viewer'
          AND EXISTS (
            SELECT 1 FROM viewer_warehouse_access v
            WHERE v.user_id = v_uid
              AND v.warehouse_id = a.warehouse_id
              AND (v.expires_at IS NULL OR v.expires_at > now())
          ))
  )
  LIMIT 50;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. transfer_asset_ownership: người thực hiện = auth.uid() (bỏ qua p_transferred_by do client gửi), khóa dòng
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_asset_ownership(p_asset_id uuid, p_to_entity_id uuid, p_to_role text, p_note text, p_transferred_by uuid)
 RETURNS asset_ownership_transfers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_actor uuid;
    v_current_owner_entity_id uuid;
    v_current_owner_role text;
    v_caller_role text;
    v_caller_permissions text[];
    v_caller_managed_warehouses uuid[];
    v_caller_assigned_warehouses uuid[];
    v_asset_warehouse_id uuid;
    v_transfer_row asset_ownership_transfers;
BEGIN
    v_actor := auth.uid();

    SELECT role, permissions, managed_warehouse_ids, assigned_warehouse_ids
    INTO v_caller_role, v_caller_permissions, v_caller_managed_warehouses, v_caller_assigned_warehouses
    FROM profiles WHERE id = v_actor;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy thông tin người dùng / Chưa đăng nhập';
    END IF;

    SELECT current_owner_entity_id, current_owner_role, warehouse_id
    INTO v_current_owner_entity_id, v_current_owner_role, v_asset_warehouse_id
    FROM assets
    WHERE id = p_asset_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tài sản không tồn tại (id = %)', p_asset_id;
    END IF;

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

    INSERT INTO asset_ownership_transfers (
        asset_id, from_entity_id, from_role, to_entity_id, to_role, transferred_by, transferred_at, note
    ) VALUES (
        p_asset_id, v_current_owner_entity_id, v_current_owner_role, p_to_entity_id, p_to_role, v_actor, now(), p_note
    ) RETURNING * INTO v_transfer_row;

    UPDATE assets
    SET current_owner_entity_id = p_to_entity_id,
        current_owner_role = p_to_role,
        updated_at = now(),
        updated_by = v_actor
    WHERE id = p_asset_id;

    RETURN v_transfer_row;
END;
$function$;

-- Tự kiểm tra: ACL của 0061 còn nguyên (anon không gọi được 4 hàm này)
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.lock_reporting_period(uuid,text)', 'execute')
     OR has_function_privilege('anon', 'public.reopen_reporting_period(uuid,text)', 'execute')
     OR has_function_privilege('anon', 'public.lookup_asset_status(text)', 'execute')
     OR has_function_privilege('anon', 'public.transfer_asset_ownership(uuid,uuid,text,text,uuid)', 'execute') THEN
    RAISE EXCEPTION '0062 dừng: anon gọi được hàm nhạy cảm (chưa chạy 0061?).';
  END IF;
END $$;

COMMIT;