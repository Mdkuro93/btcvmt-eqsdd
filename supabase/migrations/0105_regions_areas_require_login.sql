-- Migration 0105: regions_select_all và areas_select_all trên DB thật có điều kiện USING (true) (repo 0000 ghi auth.uid() IS NOT NULL -> DB lệch repo).
-- Đưa về đúng: chỉ người đã đăng nhập mới đọc được. warehouses_select_all đã đúng (auth.uid() IS NOT NULL), không đổi.
BEGIN;

DROP POLICY IF EXISTS "regions_select_all" ON public.regions;
CREATE POLICY "regions_select_all" ON public.regions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "areas_select_all" ON public.areas;
CREATE POLICY "areas_select_all" ON public.areas FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

COMMIT;

-- KIỂM TRA: SELECT tablename, policyname, roles, qual FROM pg_policies WHERE schemaname='public' AND policyname IN ('regions_select_all','areas_select_all');
--   -> roles {authenticated}, qual (auth.uid() IS NOT NULL)