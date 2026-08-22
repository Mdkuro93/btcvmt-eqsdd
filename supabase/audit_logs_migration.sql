-- ==============================================================================
-- MIGRATION: AUDIT TRAIL, BULK UPDATE & COMMERCIAL ENHANCEMENTS
-- ==============================================================================

-- 1. Bổ sung các cột theo dõi người cập nhật và thời gian cập nhật vào bảng `assets`
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Đánh chỉ mục (Index) cho các trường cập nhật
CREATE INDEX IF NOT EXISTS idx_assets_updated_at ON assets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_updated_by ON assets(updated_by);

-- 2. Tạo bảng `audit_logs` để lưu vết lịch sử mọi thay đổi của tài sản/GCN
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT NOT NULL,                         -- ID hoặc Mã tài sản / GCN
  action TEXT NOT NULL,                            -- 'UPDATE', 'BULK_UPDATE', 'IMPORT', 'CREATE', 'DELETE'
  old_data JSONB DEFAULT NULL,                     -- Trạng thái dữ liệu cũ trước khi sửa
  new_data JSONB DEFAULT NULL,                     -- Dữ liệu mới sau khi sửa
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User thực hiện
  changed_by_name TEXT DEFAULT NULL,               -- Tên/Email hiển thị của người thực hiện
  notes TEXT DEFAULT NULL,                         -- Ghi chú bổ sung lý do thay đổi
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Đánh Index cho bảng audit_logs để truy vấn lịch sử siêu tốc
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);

-- 3. Thiết lập RLS (Row Level Security) cho audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Cho phép người dùng đã xác thực đọc audit_logs
CREATE POLICY "Cho phép người dùng đã đăng nhập xem lịch sử audit_logs" 
  ON audit_logs FOR SELECT 
  TO authenticated 
  USING (true);

-- Cho phép người dùng đã xác thực thêm bản ghi audit_logs
CREATE POLICY "Cho phép người dùng thêm bản ghi audit_logs" 
  ON audit_logs FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- 4. Trigger Function tự động lưu vết trên Postgres khi bảng `assets` có UPDATE
CREATE OR REPLACE FUNCTION process_asset_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  -- Lấy user ID hiện tại từ Supabase auth session (nếu có)
  v_user_id := auth.uid();
  IF v_user_id IS NULL AND NEW.updated_by IS NOT NULL THEN
    v_user_id := NEW.updated_by;
  END IF;

  -- Cập nhật thời gian updated_at
  NEW.updated_at := timezone('utc'::text, now());
  IF v_user_id IS NOT NULL THEN
    NEW.updated_by := v_user_id;
  END IF;

  -- Chuyển đổi dữ liệu sang JSONB để so sánh
  v_old_json := to_jsonb(OLD);
  v_new_json := to_jsonb(NEW);

  -- Chỉ lưu audit log nếu có sự thay đổi thực sự
  IF v_old_json IS DISTINCT FROM v_new_json THEN
    INSERT INTO audit_logs (
      record_id,
      action,
      old_data,
      new_data,
      changed_by,
      created_at
    ) VALUES (
      NEW.id::text,
      'UPDATE',
      v_old_json,
      v_new_json,
      v_user_id,
      timezone('utc'::text, now())
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gắn Trigger vào bảng assets
DROP TRIGGER IF EXISTS trg_assets_audit_trail ON assets;
CREATE TRIGGER trg_assets_audit_trail
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION process_asset_audit_trail();

-- Chú thích tài liệu
COMMENT ON TABLE audit_logs IS 'Bảng lưu vết toàn bộ lịch sử biến động dữ liệu của GCN QSDĐ và Tài Sản Đảm Bảo';
COMMENT ON COLUMN audit_logs.record_id IS 'ID của tài sản hoặc GCN được cập nhật';
COMMENT ON COLUMN audit_logs.action IS 'Hành động: UPDATE (chỉnh sửa), BULK_UPDATE (sửa hàng loạt), IMPORT (nhập Excel), CREATE, DELETE';
