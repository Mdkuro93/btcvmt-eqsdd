-- Tích hợp hệ thống app_users (đăng nhập bằng username) vào Supabase Auth và profiles
-- Thêm các cột vào bảng profiles nếu chưa có

-- Thêm cột access_expires_at để quản lý thời hạn truy cập của viewer/tra cứu
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE;

-- Thêm cột username để hỗ trợ đăng nhập qua tên đăng nhập (ánh xạ username -> email)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index on username to make searches faster
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);

-- Lưu ý: Chúng ta không xóa bảng app_users ngay lập tức,
-- chỉ ngừng sử dụng nó để cho phép rollback nếu cần.
