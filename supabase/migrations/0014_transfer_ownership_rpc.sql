-- 0014_transfer_ownership_rpc.sql
-- Function thực hiện chuyển nhượng sở hữu (như một transaction), kiểm tra quyền và tự động cập nhật bảng assets

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
    v_transfer_row asset_ownership_transfers;
BEGIN
    -- Kiểm tra quyền
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy thông tin người dùng / Chưa đăng nhập';
    END IF;

    IF v_caller_role NOT IN ('super_admin', 'admin', 'btc_manager') THEN
        RAISE EXCEPTION 'Bạn không có quyền chuyển nhượng tài sản (yêu cầu quản trị viên)';
    END IF;

    -- Đọc thông tin sở hữu hiện tại của tài sản
    SELECT current_owner_entity_id, current_owner_role 
    INTO v_current_owner_entity_id, v_current_owner_role
    FROM assets
    WHERE id = p_asset_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tài sản không tồn tại (id = %)', p_asset_id;
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
