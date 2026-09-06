-- Cập nhật lại CHECK constraint cho cột role trong bảng profiles
-- Do Supabase tự động đặt tên constraint dạng {table}_{column}_check,
-- nên ta sẽ xoá constraint cũ và tạo constraint mới.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (
  'super_admin',
  'admin',
  'btc_manager',
  'warehouse_manager',
  'quan_ly',
  'capital_dept',
  'project_dept',
  're_dept',
  'chuyen_vien',
  'viewer',
  'nguoi_dung',
  'user'
));
