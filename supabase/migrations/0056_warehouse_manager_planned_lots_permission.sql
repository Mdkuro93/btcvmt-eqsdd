-- =====================================================================================
-- 0056 — Thêm quyền "Quản lý Kho" (warehouse_manager) được QUẢN LÝ lô quy hoạch pháp lý
-- =====================================================================================
-- HIỆN TRẠNG: _planned_lots_can_view() đã cho warehouse_manager XEM, nhưng
-- _planned_lots_can_manage() chưa có warehouse_manager -> mọi thao tác ghi (thêm/sửa/xóa
-- lô, Import Excel, gán lô vào sổ lớn) đều bị RPC từ chối với lỗi "Bạn không có quyền
-- quản lý lô quy hoạch." (42501) dù giao diện có cho vào.
--
-- FILE NÀY chỉ thêm 'warehouse_manager' vào danh sách được phép trong hàm
-- _planned_lots_can_manage() — mọi RPC dùng chung hàm này (tạo/sửa/xóa lô,
-- import_planned_land_lots, import_planned_land_lots_v2, assign_planned_lots_to_master_asset)
-- tự động áp dụng theo, không cần sửa gì thêm ở tầng RPC.
-- =====================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._planned_lots_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active'
      AND p.role IN ('super_admin', 'admin', 'btc_manager', 'project_dept', 'warehouse_manager')
  );
$$;

COMMIT;

-- Kiểm tra sau khi chạy:
-- select prosrc from pg_proc where proname = '_planned_lots_can_manage';