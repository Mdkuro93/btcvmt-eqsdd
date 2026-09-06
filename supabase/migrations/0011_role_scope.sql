-- ==============================================================================
-- MIGRATION: 0011_role_scope.sql
-- HỆ THỐNG: QUẢN LÝ GCN QSDĐ & TSĐB (BTC VMT)
-- MỤC ĐÍCH:
--   1. Thêm cột `assigned_warehouse_ids uuid[]` vào bảng `profiles`
--   2. Thêm role 'supervisor' vào CHECK constraint `profiles_role_check`
--   3. Cập nhật hàm `default_permissions_for_role`: thêm case 'supervisor' -> array['report.view', 'access.view']
--   4. Chuẩn hóa dữ liệu role cũ: 'quan_ly' -> 'warehouse_manager', ('nguoi_dung', 'user') -> 'viewer'
--   5. Cập nhật RLS SELECT trên bảng `assets`: giới hạn capital_dept, project_dept, re_dept chỉ xem đúng kho có trong assigned_warehouse_ids
--   6. Cập nhật RLS INSERT trên `transaction_items` / `transactions`: join qua assets kiểm tra assets.warehouse_id = any(p.assigned_warehouse_ids)
--   7. Cập nhật RLS SELECT trên `access_requests` và `report_snapshots`: cho phép role 'supervisor' xem theo assigned_warehouse_ids
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BỔ SUNG CỘT assigned_warehouse_ids VÀO BẢNG profiles
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_warehouse_ids uuid[];

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_warehouse_ids 
ON profiles USING GIN (assigned_warehouse_ids);

-- ------------------------------------------------------------------------------
-- 2. THÊM 'supervisor' VÀO CHECK CONSTRAINT CỦA CỘT role TRONG BẢNG profiles
-- (Giữ nguyên toàn bộ role cũ, chỉ bổ sung 'supervisor', không xoá/gộp capital_dept, project_dept, re_dept)
-- ------------------------------------------------------------------------------
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
  'supervisor',
  'viewer',
  'nguoi_dung',
  'user'
));

-- ------------------------------------------------------------------------------
-- 3. CẬP NHẬT FUNCTION default_permissions_for_role(p_role text)
-- Thêm case 'supervisor' -> array['report.view', 'access.view']
-- Giữ nguyên quyền của capital_dept/project_dept/re_dept
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION default_permissions_for_role(p_role text)
RETURNS text[] AS $$
  SELECT CASE p_role
    WHEN 'btc_manager' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','asset.sale_update','request.approve','asset.manage','log.view','report.view','admin.manage']
    WHEN 'capital_dept' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','report.view']
    WHEN 'project_dept' THEN array['asset.checkout','asset.checkin','asset.split','report.view']
    WHEN 're_dept' THEN array['asset.sale_update','report.view']
    WHEN 'supervisor' THEN array['report.view','access.view']
    ELSE array[]::text[]
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ------------------------------------------------------------------------------
-- 4. CHUẨN HÓA DỮ LIỆU ROLE CŨ
-- ------------------------------------------------------------------------------
UPDATE profiles SET role = 'warehouse_manager' WHERE role = 'quan_ly';
UPDATE profiles SET role = 'viewer' WHERE role IN ('nguoi_dung', 'user');

-- ------------------------------------------------------------------------------
-- 5. SỬA RLS SELECT CỦA BẢNG assets
-- Chỉ xem đúng kho có trong assigned_warehouse_ids của capital_dept, project_dept, re_dept
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Xem assets theo phạm vi vai trò và quyền kho" ON assets;

CREATE POLICY "Xem assets theo phạm vi vai trò và quyền kho"
ON assets FOR SELECT
USING (
  -- 1. Quản trị viên BTC VMT, Super Admin, Admin: xem toàn bộ
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND p.role IN ('super_admin', 'admin', 'btc_manager')
  )
  -- 2. Thủ kho: chỉ xem tài sản thuộc các kho do mình quản lý
  OR EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND p.role = 'warehouse_manager' 
    AND assets.warehouse_id = ANY(p.managed_warehouse_ids)
  )
  -- 3. Viewer ngoài: chỉ xem các kho đã được duyệt trong viewer_warehouse_access và chưa hết hạn
  OR EXISTS (
    SELECT 1 FROM viewer_warehouse_access vwa
    JOIN profiles p ON p.id = vwa.user_id
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND vwa.warehouse_id = assets.warehouse_id
    AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc'::text, now()))
  )
  -- 4. Các Ban chuyên môn nội bộ (Ban Nguồn Vốn, Ban PTDA, Ban KD BĐS) được active:
  -- Chỉ xem đúng kho có trong assigned_warehouse_ids của họ
  OR EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND p.role IN ('capital_dept', 'project_dept', 're_dept')
    AND assets.warehouse_id = ANY(p.assigned_warehouse_ids)
  )
);

-- ------------------------------------------------------------------------------
-- 6. SỬA RLS INSERT transaction_items / transactions TƯƠNG TỰ
-- Thêm điều kiện join qua assets để check assets.warehouse_id = any(p.assigned_warehouse_ids),
-- GIỮ NGUYÊN việc phân loại type theo từng role:
--   - capital_dept: checkout/checkin/mortgage
--   - project_dept: checkout/checkin/split
--   - re_dept: checkout/checkin/sale_update
-- ------------------------------------------------------------------------------

-- 6.1 Policy INSERT trên `transactions`
DROP POLICY IF EXISTS "Tạo transaction đúng theo permission của role" ON transactions;
CREATE POLICY "Tạo transaction đúng theo permission của role"
ON transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (p.role = 'capital_dept' AND type IN ('checkout', 'checkin', 'mortgage'))
      OR (p.role = 'project_dept' AND type IN ('checkout', 'checkin', 'split'))
      OR (p.role = 're_dept' AND type IN ('checkout', 'checkin', 'sale_update'))
    )
  )
);

-- 6.2 Policy INSERT trên `transaction_items` (Join qua assets để kiểm tra assigned_warehouse_ids)
DROP POLICY IF EXISTS "Tạo transaction_items cho user active" ON transaction_items;
CREATE POLICY "Tạo transaction_items cho user active"
ON transaction_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    JOIN assets a ON a.id = transaction_items.asset_id
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (
        p.role = 'capital_dept' 
        AND transaction_items.type IN ('checkout', 'checkin', 'mortgage')
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
      OR (
        p.role = 'project_dept' 
        AND transaction_items.type IN ('checkout', 'checkin', 'split')
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
      OR (
        p.role = 're_dept' 
        AND transaction_items.type IN ('checkout', 'checkin', 'sale_update')
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
    )
  )
);

-- ------------------------------------------------------------------------------
-- 7. THÊM RLS SELECT CHO access_requests VÀ report_snapshots CHO PHÉP ROLE 'supervisor' XEM
-- Điều kiện: warehouse_id nằm trong assigned_warehouse_ids
-- ------------------------------------------------------------------------------

-- 7.1 SELECT trên `access_requests`
DROP POLICY IF EXISTS "Xem access_requests theo phạm vi" ON access_requests;
CREATE POLICY "Xem access_requests theo phạm vi"
ON access_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (p.role = 'warehouse_manager' AND warehouse_id = ANY(p.managed_warehouse_ids))
      OR (p.role = 'supervisor' AND warehouse_id = ANY(p.assigned_warehouse_ids))
    )
  )
);

-- 7.2 SELECT trên `report_snapshots`
DROP POLICY IF EXISTS "Xem danh sách report_snapshots" ON report_snapshots;
CREATE POLICY "Xem danh sách report_snapshots"
ON report_snapshots FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (p.role = 'warehouse_manager' AND (warehouse_id IS NULL OR warehouse_id = ANY(p.managed_warehouse_ids)))
      OR (p.role = 'supervisor' AND warehouse_id = ANY(p.assigned_warehouse_ids))
      OR (p.role IN ('capital_dept', 'project_dept', 're_dept') AND (warehouse_id IS NULL OR warehouse_id = ANY(p.assigned_warehouse_ids)))
      OR submitted_by = auth.uid()
    )
  )
);
