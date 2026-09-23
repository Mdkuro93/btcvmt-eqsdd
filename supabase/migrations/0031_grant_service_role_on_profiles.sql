-- Migration 0031: Cấp quyền bảng public.profiles cho service_role
--
-- Nguyên nhân: các Edge Function admin-reset-password / admin-delete-user / admin-create-user dùng khóa
-- service_role để đọc/ghi public.profiles, nhưng bảng này KHÔNG có quyền nào cho service_role
-- (kiểm tra bằng information_schema.role_table_grants: chỉ có anon, authenticated)
-- -> lỗi "permission denied for table profiles" (mã 42501).
--
-- Lệnh này ĐÃ ĐƯỢC CHẠY TAY trên Supabase production; file này chỉ ghi lại cho repo khớp với DB (quy tắc #16.2).
-- Chạy lại nhiều lần vẫn an toàn (idempotent).
--
-- Cố ý CHỈ cấp cho bảng profiles (theo quy tắc #11 không dùng GRANT ALL ON ALL TABLES).
-- Nếu Edge Function mới cần bảng khác, cấp riêng cho đúng bảng đó.

GRANT ALL ON TABLE public.profiles TO service_role;