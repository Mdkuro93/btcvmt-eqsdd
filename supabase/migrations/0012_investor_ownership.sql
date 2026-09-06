-- ==============================================================================
-- MIGRATION: 0012_investor_ownership.sql
-- HỆ THỐNG: QUẢN LÝ GCN QSDĐ & TSĐB (BTC VMT)
-- MỤC ĐÍCH:
--   1. Tạo bảng `investor_entities` (Thực thể Chủ đầu tư / Nhà đầu tư)
--   2. Bổ sung `default_owner_entity_id` vào bảng `projects`
--   3. Bổ sung `current_owner_entity_id` và `current_owner_role` ('cdt', 'ndt') vào bảng `assets`
--   4. Bổ sung `owner_entity_ids uuid[]` vào `profiles` & thêm 'investor' vào CHECK constraint role
--   5. Tạo bảng `asset_ownership_transfers` (Lịch sử chuyển giao chủ sở hữu giữa CĐT & NĐT)
--   6. Cập nhật `default_permissions_for_role`: thêm case 'investor' -> array['asset.view', 'asset.checkout', 'asset.checkin']
--   7. Cập nhật RLS SELECT cho `assets`: cho phép 'investor' xem các asset có current_owner_entity_id = any(p.owner_entity_ids)
--   8. Thêm RLS cho `investor_entities` và `asset_ownership_transfers`:
--      - Chỉ role có quyền 'admin.manage' mới được insert/update/delete
--      - Role 'investor' được SELECT các dòng liên quan đến chính mình trong asset_ownership_transfers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TẠO BẢNG investor_entities
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_code text UNIQUE,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_entities_code ON investor_entities(company_code);

-- ------------------------------------------------------------------------------
-- 2. BỔ SUNG default_owner_entity_id VÀO BẢNG projects
-- ------------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_owner_entity_id uuid
  REFERENCES investor_entities(id);

CREATE INDEX IF NOT EXISTS idx_projects_default_owner_entity_id 
  ON projects(default_owner_entity_id);

-- ------------------------------------------------------------------------------
-- 3. BỔ SUNG current_owner_entity_id & current_owner_role VÀO BẢNG assets
-- ------------------------------------------------------------------------------
ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_owner_entity_id uuid
  REFERENCES investor_entities(id);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_owner_role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_current_owner_role_check'
  ) THEN
    ALTER TABLE assets ADD CONSTRAINT assets_current_owner_role_check 
      CHECK (current_owner_role IS NULL OR current_owner_role IN ('cdt', 'ndt'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_current_owner_entity_id 
  ON assets(current_owner_entity_id);

CREATE INDEX IF NOT EXISTS idx_assets_current_owner_role 
  ON assets(current_owner_role);

-- ------------------------------------------------------------------------------
-- 4. BỔ SUNG owner_entity_ids VÀO profiles & CẬP NHẬT CHECK CONSTRAINT role
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owner_entity_ids uuid[];

CREATE INDEX IF NOT EXISTS idx_profiles_owner_entity_ids 
  ON profiles USING GIN (owner_entity_ids);

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
  'investor',
  'viewer',
  'nguoi_dung',
  'user'
));

-- ------------------------------------------------------------------------------
-- 5. TẠO BẢNG asset_ownership_transfers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) NOT NULL,
  from_entity_id uuid REFERENCES investor_entities(id),
  from_role text,
  to_entity_id uuid REFERENCES investor_entities(id) NOT NULL,
  to_role text NOT NULL CHECK (to_role IN ('cdt', 'ndt')),
  transferred_at timestamptz DEFAULT now(),
  transferred_by uuid REFERENCES profiles(id),
  note text
);

CREATE INDEX IF NOT EXISTS idx_asset_ownership_transfers_asset_id 
  ON asset_ownership_transfers(asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_ownership_transfers_to_entity 
  ON asset_ownership_transfers(to_entity_id);

CREATE INDEX IF NOT EXISTS idx_asset_ownership_transfers_from_entity 
  ON asset_ownership_transfers(from_entity_id);

-- ------------------------------------------------------------------------------
-- 6. CẬP NHẬT FUNCTION default_permissions_for_role(p_role text)
-- Thêm case 'investor' trả về array chứa đúng các permission key hiện có:
-- 'asset.view' (xem GCN), 'asset.checkout' (mượn), 'asset.checkin' (trả)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION default_permissions_for_role(p_role text)
RETURNS text[] AS $$
  SELECT CASE p_role
    WHEN 'btc_manager' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','asset.sale_update','request.approve','asset.manage','log.view','report.view','admin.manage']
    WHEN 'capital_dept' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','report.view']
    WHEN 'project_dept' THEN array['asset.checkout','asset.checkin','asset.split','report.view']
    WHEN 're_dept' THEN array['asset.sale_update','report.view']
    WHEN 'supervisor' THEN array['report.view','access.view']
    WHEN 'investor' THEN array['asset.view','asset.checkout','asset.checkin']
    ELSE array[]::text[]
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ------------------------------------------------------------------------------
-- 7. THÊM RLS SELECT CHO assets
-- Cho phép role 'investor' xem các asset có current_owner_entity_id = any(p.owner_entity_ids),
-- độc lập với các điều kiện theo kho/dự án khác.
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
  -- 5. Nhà đầu tư (investor): xem các asset có current_owner_entity_id = any(p.owner_entity_ids),
  -- độc lập với các điều kiện theo kho/dự án khác
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role = 'investor'
    AND assets.current_owner_entity_id = ANY(p.owner_entity_ids)
  )
);

-- Cập nhật policy tạo transaction & transaction_items hỗ trợ investor mượn/trả tài sản thuộc quyền sở hữu
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
      OR (p.role = 'investor' AND type IN ('checkout', 'checkin'))
    )
  )
);

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
      OR (
        p.role = 'investor'
        AND transaction_items.type IN ('checkout', 'checkin')
        AND a.current_owner_entity_id = ANY(p.owner_entity_ids)
      )
    )
  )
);

-- ------------------------------------------------------------------------------
-- 8. RLS CHO investor_entities VÀ asset_ownership_transfers
-- - Chỉ role có permission 'admin.manage' (hoặc tương đương quyền quản trị) mới được insert/update/delete
-- - Role 'investor' chỉ được SELECT các dòng liên quan đến chính mình trong asset_ownership_transfers
-- ------------------------------------------------------------------------------

-- 8.1 RLS trên investor_entities
ALTER TABLE investor_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Xem danh sách investor_entities" ON investor_entities;
CREATE POLICY "Xem danh sách investor_entities"
ON investor_entities FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
  )
);

DROP POLICY IF EXISTS "Quản trị viên thêm sửa xóa investor_entities" ON investor_entities;
CREATE POLICY "Quản trị viên thêm sửa xóa investor_entities"
ON investor_entities FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY(p.permissions))
      OR has_permission('admin.manage')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY(p.permissions))
      OR has_permission('admin.manage')
    )
  )
);

-- 8.2 RLS trên asset_ownership_transfers
ALTER TABLE asset_ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Xem lịch sử chuyển giao sở hữu asset_ownership_transfers" ON asset_ownership_transfers;
CREATE POLICY "Xem lịch sử chuyển giao sở hữu asset_ownership_transfers"
ON asset_ownership_transfers FOR SELECT
TO authenticated
USING (
  -- Quản trị viên BTC VMT, Super Admin, Admin, hoặc user có quyền admin.manage
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY(p.permissions))
      OR has_permission('admin.manage')
    )
  )
  -- Role 'investor': chỉ được SELECT các dòng liên quan đến chính mình trong asset_ownership_transfers (asset_id thuộc current_owner_entity_id của mình)
  OR EXISTS (
    SELECT 1 FROM profiles p
    JOIN assets a ON a.id = asset_ownership_transfers.asset_id
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND p.role = 'investor'
    AND (
      a.current_owner_entity_id = ANY(p.owner_entity_ids)
      OR asset_ownership_transfers.to_entity_id = ANY(p.owner_entity_ids)
      OR asset_ownership_transfers.from_entity_id = ANY(p.owner_entity_ids)
    )
  )
);

DROP POLICY IF EXISTS "Quản trị viên thêm sửa xóa asset_ownership_transfers" ON asset_ownership_transfers;
CREATE POLICY "Quản trị viên thêm sửa xóa asset_ownership_transfers"
ON asset_ownership_transfers FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY(p.permissions))
      OR has_permission('admin.manage')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (p.permissions IS NOT NULL AND 'admin.manage' = ANY(p.permissions))
      OR has_permission('admin.manage')
    )
  )
);
