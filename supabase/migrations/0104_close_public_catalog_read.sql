-- Migration 0104: đóng quyền đọc công khai (anon) của 4 bảng danh mục: warehouses, regions, areas, projects.
-- Căn cứ: kết quả kiem_tra_pham_vi_du_lieu_theo_tai_khoan.sql chỉ còn 6 policy USING(true), đều ở 4 bảng danh mục, role {public} (gồm cả anon).
-- Form đăng ký (người chưa đăng nhập) dùng RPC SECURITY DEFINER list_registration_warehouses (0044) nên KHÔNG phụ thuộc các policy này.
-- Sau migration: chỉ người đã đăng nhập (authenticated) đọc được danh mục. Policy ghi của admin giữ nguyên.
BEGIN;

DROP POLICY IF EXISTS "Xem danh mục kho công khai" ON public.warehouses;
DROP POLICY IF EXISTS "Xem danh mục vùng công khai" ON public.regions;
DROP POLICY IF EXISTS "Xem danh mục địa bàn công khai" ON public.areas;
DROP POLICY IF EXISTS "Xem danh mục dự án cho user active" ON public.projects;
-- regions_select_all, areas_select_all (auth.uid() IS NOT NULL) giữ lại; thêm tương đương cho warehouses, projects:
DROP POLICY IF EXISTS "warehouses_select_authenticated" ON public.warehouses;
CREATE POLICY "warehouses_select_authenticated" ON public.warehouses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
CREATE POLICY "projects_select_authenticated" ON public.projects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

COMMIT;

-- KIỂM TRA (chạy sau): phải KHÔNG còn dòng nào có roles chứa public/anon
-- SELECT tablename, policyname, cmd, roles, qual FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('warehouses','regions','areas','projects') AND cmd IN ('SELECT','ALL') ORDER BY 1,2;
-- Kiểm tra anon: BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM warehouses; ROLLBACK;  -- phải = 0
-- Kiểm tra form đăng ký: SELECT count(*) FROM list_registration_warehouses();  -- vẫn > 0