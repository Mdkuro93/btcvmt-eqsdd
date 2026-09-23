-- Migration 0029: Bổ sung 2 cột còn thiếu trên bảng profiles (phone, purpose)
--
-- Nguyên nhân: DB thật thiếu 2 cột này (organization thì đã có), trong khi code (tạo tài khoản, đồng bộ
-- Cơ quan/Mục đích/SĐT từ yêu cầu truy cập kho, duyệt tài khoản...) đều ghi/đọc chúng
-- -> lỗi "Could not find the 'phone' column of 'profiles' in the schema cache".
--
-- An toàn: chỉ THÊM cột (nếu chưa có), không đổi hay xóa dữ liệu hiện có.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS purpose TEXT;

-- Báo cho API của Supabase nạp lại cấu trúc bảng (nếu không sẽ vẫn báo "schema cache" một lúc)
NOTIFY pgrst, 'reload schema';