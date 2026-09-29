-- =====================================================================================
-- 0054 — Thêm "Mã Dự Án" (project_code) cho bảng projects
-- =====================================================================================
-- MỤC ĐÍCH: mã ngắn, gõ tay, để quản lý/tra cứu dự án và làm khóa map dữ liệu với các
-- hệ thống khác sau này (ví dụ hệ thống bán hàng, GIS...). KHÔNG dùng để thay thế UUID
-- nội bộ (projects.id) — chỉ là 1 nhãn nghiệp vụ, cho phép để trống, nếu có thì không
-- được trùng nhau.
-- =====================================================================================

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_code text;

-- Cho phép nhiều dự án cùng để trống mã (NULL), nhưng nếu đã đặt mã thì không được trùng.
CREATE UNIQUE INDEX IF NOT EXISTS projects_project_code_unique_idx
  ON public.projects (project_code)
  WHERE project_code IS NOT NULL;

COMMENT ON COLUMN public.projects.project_code IS
  'Mã dự án nghiệp vụ (gõ tay, không bắt buộc). Dùng để quản lý/tra cứu và làm khóa map dữ liệu với hệ thống khác sau này.';

COMMIT;

-- Kiểm tra sau khi chạy:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='projects' and column_name='project_code';