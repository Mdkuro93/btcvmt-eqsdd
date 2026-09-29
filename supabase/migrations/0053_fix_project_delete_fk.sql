-- =====================================================================================
-- 0053 — Sửa ràng buộc khóa ngoại chặn xóa Dự án
-- =====================================================================================
-- LỖI GẶP PHẢI: xóa 1 dự án báo lỗi 409 — "update or delete on table 'projects'
-- violates foreign key constraint 'asset_declaration_requests_project_id_fkey' on
-- table 'asset_declaration_requests'".
--
-- NGUYÊN NHÂN: cột asset_declaration_requests.project_id được tạo (ngoài các file
-- migration được theo dõi trong repo — có thể tạo trực tiếp qua AI Studio/Supabase)
-- với khóa ngoại mặc định NO ACTION, nên còn bất kỳ yêu cầu khai báo nào (kể cả đã
-- duyệt/đã từ chối, không chỉ yêu cầu đang chờ) từng thuộc dự án đó sẽ chặn xóa.
--
-- CÁCH SỬA: đổi hành vi giống hệt assets.project_id đang dùng (ON DELETE SET NULL) —
-- xóa dự án thì các yêu cầu khai báo cũ vẫn được giữ lại làm lịch sử, chỉ gỡ liên kết
-- dự án (project_id -> NULL), không xóa dữ liệu yêu cầu.
--
-- LƯU Ý QUAN TRỌNG: bảng planned_land_lots.project_id vẫn cố tình dùng ON DELETE
-- RESTRICT (thiết lập từ migration 0048) — nghĩa là nếu dự án còn "lô quy hoạch" chưa
-- xóa hết, hệ thống sẽ tiếp tục chặn xóa dự án và báo lỗi rõ ràng. Đây là hành vi
-- ĐÚNG Ý ĐỒ THIẾT KẾ (buộc dọn lô quy hoạch trước khi xóa dự án), KHÔNG sửa trong
-- file này.
-- =====================================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_declaration_requests' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.asset_declaration_requests
      DROP CONSTRAINT IF EXISTS asset_declaration_requests_project_id_fkey;

    ALTER TABLE public.asset_declaration_requests
      ADD CONSTRAINT asset_declaration_requests_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- Kiểm tra sau khi chạy (phải thấy delete_rule = 'SET NULL'):
-- select rc.constraint_name, rc.delete_rule
-- from information_schema.referential_constraints rc
-- where rc.constraint_name = 'asset_declaration_requests_project_id_fkey';