-- 0015_fix_transfer_rpc_permission.sql
-- Function thực hiện chuyển nhượng sở hữu (như một transaction), kiểm tra quyền và tự động cập nhật bảng assets
-- Cập nhật: Cho phép warehouse_manager (quản lý kho) và user có 'admin.manage' thực hiện chuyển nhượng

CREATE OR REPLACE FUNCTION transfer_asset_ownership(
    p_asset_id uuid,
    p_to_entity_id uuid,
    p_to_role text,
    p_note text,
    p_transferred_by uuid
)
RETURNS asset_ownership_transfers
SECURITY DEFINER
AS $$
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
$$ LANGUAGE plpgsql;
