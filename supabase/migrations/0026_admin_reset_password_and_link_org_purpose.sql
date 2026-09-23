-- Migration 0026: Admin Reset Password & Link Organization / Purpose to Profiles
-- 1. Hàm admin_reset_user_password: Cho phép Admin/Super Admin/Ban TC đặt lại mật khẩu cho tài khoản
-- 2. Cập nhật hàm approve_viewer_access_request: Đồng bộ Cơ quan (organization), Mục đích (purpose), SĐT (phone) sang profiles

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Hàm admin đặt lại mật khẩu cho tài khoản người dùng
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_email TEXT;
  v_target_username TEXT;
BEGIN
  -- Kiểm tra vai trò của người thực hiện
  SELECT role INTO v_caller_role 
  FROM public.profiles 
  WHERE id = auth.uid() AND status = 'active';

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'btc_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền đặt lại mật khẩu người dùng.';
  END IF;

  IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'Mật khẩu mới phải có ít nhất 6 ký tự.';
  END IF;

  -- Lấy thông tin tài khoản đích
  SELECT email, username INTO v_target_email, v_target_username
  FROM public.profiles
  WHERE id = p_user_id;

  -- Cập nhật mật khẩu trong auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  -- Cập nhật mật khẩu trong public.app_users nếu tồn tại
  UPDATE public.app_users
  SET password = trim(p_new_password)
  WHERE id = p_user_id 
     OR (v_target_username IS NOT NULL AND LOWER(username) = LOWER(v_target_username))
     OR (v_target_email IS NOT NULL AND LOWER(username) = LOWER(SPLIT_PART(v_target_email, '@', 1)));

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'message', 'Đã đặt lại mật khẩu thành công'
  );
END;
$$;

-- 2. Cập nhật approve_viewer_access_request để liên kết tự động Cơ quan & Mục đích vào hồ sơ (profiles)
CREATE OR REPLACE FUNCTION public.approve_viewer_access_request(
  p_request_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_req RECORD;
  v_reviewer RECORD;
  v_user_id UUID;
BEGIN
  -- Lấy thông tin người thực hiện
  SELECT * INTO v_reviewer FROM profiles WHERE id = auth.uid() AND status = 'active';
  IF NOT FOUND OR v_reviewer.role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt yêu cầu truy cập kho';
  END IF;

  -- Lấy thông tin yêu cầu
  SELECT * INTO v_req FROM access_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu truy cập';
  END IF;

  -- Kiểm tra quyền của quản lý kho với kho yêu cầu
  IF v_reviewer.role = 'warehouse_manager' AND NOT (v_req.warehouse_id = ANY(v_reviewer.managed_warehouse_ids)) THEN
    RAISE EXCEPTION 'Quản lý kho chỉ được duyệt yêu cầu thuộc kho do mình phụ trách';
  END IF;

  -- Tìm user profile theo email
  SELECT id INTO v_user_id FROM profiles WHERE LOWER(email) = LOWER(v_req.email);

  -- Nếu chưa có profile, tạo profile mới với role viewer và kế thừa đầy đủ organization, purpose, phone
  IF v_user_id IS NULL THEN
    INSERT INTO profiles (
      email,
      full_name,
      role,
      status,
      permissions,
      organization,
      purpose,
      phone
    ) VALUES (
      LOWER(v_req.email),
      v_req.full_name,
      'viewer',
      'active',
      ARRAY['asset.view'],
      v_req.organization,
      v_req.purpose,
      v_req.phone
    )
    RETURNING id INTO v_user_id;
  ELSE
    -- Cập nhật profile hiện có sang active và đồng bộ thông tin nếu chưa có
    UPDATE profiles 
    SET status = 'active',
        organization = COALESCE(profiles.organization, v_req.organization),
        purpose = COALESCE(profiles.purpose, v_req.purpose),
        phone = COALESCE(profiles.phone, v_req.phone)
    WHERE id = v_user_id;
  END IF;

  -- Cấp quyền xem kho trong bảng `viewer_warehouse_access` (UPSERT)
  INSERT INTO viewer_warehouse_access (
    user_id,
    warehouse_id,
    approved_by,
    approved_at,
    expires_at,
    notes
  ) VALUES (
    v_user_id,
    v_req.warehouse_id,
    auth.uid(),
    timezone('utc'::text, now()),
    p_expires_at,
    p_notes
  )
  ON CONFLICT (user_id, warehouse_id) 
  DO UPDATE SET
    approved_by = auth.uid(),
    approved_at = timezone('utc'::text, now()),
    expires_at = p_expires_at,
    notes = p_notes;

  -- Cập nhật trạng thái access_requests
  UPDATE access_requests
  SET 
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'warehouse_id', v_req.warehouse_id,
    'expires_at', p_expires_at
  );
END;
$$;
