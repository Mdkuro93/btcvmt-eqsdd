-- Migration 0106: gỡ policy assets_select_scoped (có từ 0000) làm lộ GCN cho mọi vai trò khác viewer.
-- Nguyên nhân: project_in_scope() trả TRUE khi region_id/area_id/project_ids của profile đều NULL (mặc định) -> tài khoản
--   capital_dept / supervisor chưa gán phạm vi vẫn thấy toàn bộ GCN (kết quả kiểm tra: thấy 3, được phép 0).
-- Phạm vi xem GCN đã được các policy theo kho đảm nhiệm, không cần policy này:
--   "Xem assets theo phạm vi vai trò và quyền kho" (admin/btc_manager, warehouse_manager, viewer có vwa, capital/project/re_dept theo kho gán, investor theo chủ sở hữu)
--   assets_select_supervisor_assigned (0103).
BEGIN;
DROP POLICY IF EXISTS "assets_select_scoped" ON public.assets;
COMMIT;

-- KIỂM TRA: SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='assets' AND cmd='SELECT';  -- không còn assets_select_scoped
-- Sau đó chạy lại kiem_tra_pham_vi_du_lieu_theo_tai_khoan.sql: ngoctb03 và trangntt phải thấy 0.