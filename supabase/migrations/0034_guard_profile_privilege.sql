-- Migration 0034: Trigger chặn nâng quyền / sửa / xóa hồ sơ người dùng vượt cấp bậc
--
-- Vấn đề: policy trên `profiles` cho nhóm quản trị (admin, btc_manager...) ghi thẳng vào bảng qua API, nên các
-- kiểm tra cấp bậc trong Edge Function KHÔNG chặn được việc gọi thẳng DB. Ví dụ btc_manager có thể tự sửa
-- role của mình thành super_admin, hoặc sửa/xóa hồ sơ super_admin.
--
-- Quy tắc (giống Edge Function admin-reset-password / admin-delete-user):
--   Cấp bậc: super_admin (100) > admin (80) > btc_manager (60) > warehouse_manager (40) > còn lại (0)
--   * Chỉ tác động lên hồ sơ có cấp bậc THẤP HƠN mình (super_admin: được tác động mọi hồ sơ).
--   * Không tự đổi vai trò của chính mình (trừ super_admin); không tự xóa hồ sơ của chính mình.
--   * Không gán / tạo vai trò ngang hoặc cao hơn vai trò của mình (trừ super_admin).
--   * Người gọi phải có hồ sơ ở trạng thái 'active'.
--
-- KHÔNG áp dụng khi không có người dùng đăng nhập (auth.uid() rỗng): SQL Editor, và Edge Function dùng
-- service_role (các function này tự kiểm tra cấp bậc).

CREATE OR REPLACE FUNCTION public.role_rank(p_role text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_role
    WHEN 'super_admin' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'btc_manager' THEN 60
    WHEN 'warehouse_manager' THEN 40
    ELSE 0
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_privilege() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_caller_status text;
  v_caller_rank integer;
  v_is_super boolean;
BEGIN
  -- Không có người dùng đăng nhập (SQL Editor, service_role/Edge Function): bỏ qua
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT p.role, p.status INTO v_caller_role, v_caller_status
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_caller_role IS NULL OR v_caller_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Tài khoản của bạn không được phép thay đổi hồ sơ người dùng.' USING ERRCODE = '42501';
  END IF;

  v_is_super := (v_caller_role = 'super_admin');
  v_caller_rank := public.role_rank(v_caller_role);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_super AND public.role_rank(NEW.role) >= v_caller_rank THEN
      RAISE EXCEPTION 'Không được tạo hồ sơ có vai trò ngang hoặc cao hơn vai trò của bạn.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.id = v_uid THEN
      RAISE EXCEPTION 'Bạn không thể tự xóa hồ sơ của chính mình.' USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_super AND public.role_rank(OLD.role) >= v_caller_rank THEN
      RAISE EXCEPTION 'Bạn không được xóa hồ sơ có cấp bậc ngang hoặc cao hơn.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Không được đổi id của hồ sơ.' USING ERRCODE = '42501';
  END IF;

  IF OLD.id <> v_uid AND NOT v_is_super AND public.role_rank(OLD.role) >= v_caller_rank THEN
    RAISE EXCEPTION 'Bạn không được sửa hồ sơ có cấp bậc ngang hoặc cao hơn.' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = v_uid AND NOT v_is_super THEN
      RAISE EXCEPTION 'Bạn không được tự thay đổi vai trò của chính mình.' USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_super AND public.role_rank(NEW.role) >= v_caller_rank THEN
      RAISE EXCEPTION 'Không được gán vai trò ngang hoặc cao hơn vai trò của bạn.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privilege ON public.profiles;
CREATE TRIGGER trg_guard_profile_privilege
BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privilege();

-- ==============================================================================
-- ROLLBACK (nếu có thao tác quản trị hợp lệ bị chặn nhầm — báo lại để chỉnh thay vì gỡ hẳn):
-- DROP TRIGGER IF EXISTS trg_guard_profile_privilege ON public.profiles;
-- DROP FUNCTION IF EXISTS public.guard_profile_privilege();
-- DROP FUNCTION IF EXISTS public.role_rank(text);
-- ==============================================================================