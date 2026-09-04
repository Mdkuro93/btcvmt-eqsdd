-- ==============================================================================
-- MIGRATION: ROW LEVEL SECURITY (RLS) & VIEWER ACCESS CONTROL BY WAREHOUSE
-- Hệ thống: Quản lý Giấy chứng nhận QSDĐ & TSĐB (BTC VMT)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BẢNG `access_requests`: Yêu cầu đăng ký viewer gắn theo từng kho
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  organization TEXT,
  purpose TEXT,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_requests_warehouse ON access_requests(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests(created_at DESC);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Ai cũng gửi được yêu cầu (public form, không cần đăng nhập)
DROP POLICY IF EXISTS "Ai cũng gửi được yêu cầu truy cập" ON access_requests;
CREATE POLICY "Ai cũng gửi được yêu cầu truy cập"
ON access_requests FOR INSERT
WITH CHECK (true);

-- Chỉ admin hoặc đúng quản lý kho được xem access_requests của kho đó
DROP POLICY IF EXISTS "Xem access_requests theo phạm vi" ON access_requests;
CREATE POLICY "Xem access_requests theo phạm vi"
ON access_requests FOR SELECT
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid()
    and p.status = 'active'
    and (
      p.role in ('super_admin', 'admin', 'btc_manager')
      or (p.role = 'warehouse_manager' and warehouse_id = any(p.managed_warehouse_ids))
    )
  )
);

-- Chỉ admin hoặc đúng quản lý kho được cập nhật/duyệt access_requests
DROP POLICY IF EXISTS "Duyệt access_requests theo phạm vi" ON access_requests;
CREATE POLICY "Duyệt access_requests theo phạm vi"
ON access_requests FOR UPDATE
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid()
    and p.status = 'active'
    and (
      p.role in ('super_admin', 'admin', 'btc_manager')
      or (p.role = 'warehouse_manager' and warehouse_id = any(p.managed_warehouse_ids))
    )
  )
);

-- ------------------------------------------------------------------------------
-- 2. BẢNG `viewer_warehouse_access`: Quyền xem kho đã được duyệt cho viewer
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viewer_warehouse_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  approved_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(user_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_viewer_access_user ON viewer_warehouse_access(user_id);
CREATE INDEX IF NOT EXISTS idx_viewer_access_warehouse ON viewer_warehouse_access(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_viewer_access_expires ON viewer_warehouse_access(expires_at);

ALTER TABLE viewer_warehouse_access ENABLE ROW LEVEL SECURITY;

-- User xem quyền kho của chính mình, admin/quản lý kho xem tất cả liên quan
DROP POLICY IF EXISTS "User xem quyền kho của chính mình, admin/quản lý kho xem tất cả liên quan" ON viewer_warehouse_access;
CREATE POLICY "User xem quyền kho của chính mình, admin/quản lý kho xem tất cả liên quan"
ON viewer_warehouse_access FOR SELECT
USING (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p 
    where p.id = auth.uid()
    and p.status = 'active'
    and (
      p.role in ('super_admin', 'admin', 'btc_manager')
      or (p.role = 'warehouse_manager' and warehouse_id = any(p.managed_warehouse_ids))
    )
  )
);

-- Admin và Quản lý kho được thêm/sửa/xóa quyền xem kho
DROP POLICY IF EXISTS "Quản trị viên và Quản lý kho quản lý viewer_warehouse_access" ON viewer_warehouse_access;
CREATE POLICY "Quản trị viên và Quản lý kho quản lý viewer_warehouse_access"
ON viewer_warehouse_access FOR ALL
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid()
    and p.status = 'active'
    and (
      p.role in ('super_admin', 'admin', 'btc_manager')
      or (p.role = 'warehouse_manager' and warehouse_id = any(p.managed_warehouse_ids))
    )
  )
);

-- ------------------------------------------------------------------------------
-- 3. BẢNG `access_logs`: Ghi vết truy cập phục vụ thống kê báo cáo
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'login' | 'view_asset' | 'search' | 'export'
  resource_table TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);

ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User tự ghi log của mình" ON access_logs;
CREATE POLICY "User tự ghi log của mình"
ON access_logs FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin xem toàn bộ access_logs" ON access_logs;
CREATE POLICY "Admin xem toàn bộ access_logs"
ON access_logs FOR SELECT
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid()
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager')
  )
  or user_id = auth.uid()
);

-- ------------------------------------------------------------------------------
-- 4. BẬT RLS & CHÍNH SÁCH BẢO MẬT CHO BẢNG `assets`
-- ------------------------------------------------------------------------------
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chỉ user active mới được xem assets" ON assets;
DROP POLICY IF EXISTS "Xem assets theo phạm vi vai trò và quyền kho" ON assets;

CREATE POLICY "Xem assets theo phạm vi vai trò và quyền kho"
ON assets FOR SELECT
USING (
  -- 1. Quản trị viên BTC VMT, Super Admin, Admin: xem toàn bộ
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager')
  )
  -- 2. Thủ kho: chỉ xem tài sản thuộc các kho do mình quản lý
  or exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role = 'warehouse_manager' 
    and assets.warehouse_id = any(p.managed_warehouse_ids)
  )
  -- 3. Viewer ngoài: chỉ xem các kho đã được duyệt trong viewer_warehouse_access và chưa hết hạn
  or exists (
    select 1 from viewer_warehouse_access vwa
    join profiles p on p.id = vwa.user_id
    where p.id = auth.uid() 
    and p.status = 'active'
    and vwa.warehouse_id = assets.warehouse_id
    and (vwa.expires_at is null or vwa.expires_at > timezone('utc'::text, now()))
  )
  -- 4. Các Ban chuyên môn nội bộ (Ban Nguồn Vốn, Ban PTDA, Ban KD BĐS) được active: xem theo phân quyền nghiệp vụ
  or exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('capital_dept', 'project_dept', 're_dept')
  )
);

-- Thêm/Sửa/Xóa Asset: Chỉ btc_manager, super_admin, admin
DROP POLICY IF EXISTS "Admin và BTC Manager được thêm sửa xóa assets" ON assets;
CREATE POLICY "Admin và BTC Manager được thêm sửa xóa assets"
ON assets FOR ALL
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and (
      p.role in ('super_admin', 'admin', 'btc_manager')
      or (p.permissions is not null and 'asset.edit' = any(p.permissions))
    )
  )
);

-- ------------------------------------------------------------------------------
-- 5. BẬT RLS & CHÍNH SÁCH BẢO MẬT CHO BẢNG `profiles`
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User xem profile của mình hoặc admin xem toàn bộ" ON profiles;
CREATE POLICY "User xem profile của mình hoặc admin xem toàn bộ"
ON profiles FOR SELECT
USING (
  id = auth.uid()
  or exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
  )
);

DROP POLICY IF EXISTS "Admin quản lý profiles" ON profiles;
CREATE POLICY "Admin quản lý profiles"
ON profiles FOR ALL
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager')
  )
);

-- ------------------------------------------------------------------------------
-- 6. BẬT RLS CHO CÁC BẢNG DANH MỤC: warehouses, regions, areas, projects
-- ------------------------------------------------------------------------------
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Cho phép xem danh mục công khai cho form đăng ký và user active
DROP POLICY IF EXISTS "Xem danh mục kho công khai" ON warehouses;
CREATE POLICY "Xem danh mục kho công khai" ON warehouses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Xem danh mục vùng công khai" ON regions;
CREATE POLICY "Xem danh mục vùng công khai" ON regions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Xem danh mục địa bàn công khai" ON areas;
CREATE POLICY "Xem danh mục địa bàn công khai" ON areas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Xem danh mục dự án cho user active" ON projects;
CREATE POLICY "Xem danh mục dự án cho user active" ON projects FOR SELECT USING (true);

-- Chỉ admin / btc_manager được sửa đổi danh mục
DROP POLICY IF EXISTS "Admin quản lý kho" ON warehouses;
CREATE POLICY "Admin quản lý kho" ON warehouses FOR ALL USING (
  exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('super_admin', 'admin', 'btc_manager'))
);

DROP POLICY IF EXISTS "Admin quản lý vùng" ON regions;
CREATE POLICY "Admin quản lý vùng" ON regions FOR ALL USING (
  exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('super_admin', 'admin', 'btc_manager'))
);

DROP POLICY IF EXISTS "Admin quản lý địa bàn" ON areas;
CREATE POLICY "Admin quản lý địa bàn" ON areas FOR ALL USING (
  exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('super_admin', 'admin', 'btc_manager'))
);

DROP POLICY IF EXISTS "Admin quản lý dự án" ON projects;
CREATE POLICY "Admin quản lý dự án" ON projects FOR ALL USING (
  exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('super_admin', 'admin', 'btc_manager'))
);

-- ------------------------------------------------------------------------------
-- 7. BẬT RLS CHO BẢNG `transactions` & `transaction_items`
-- Kiểm tra đúng TransactionType theo quyền của từng Role (Mục 11)
-- ------------------------------------------------------------------------------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- Policy tạo Transaction đúng theo role permission:
-- checkout: mượn/xuất
-- checkin: nhập trả
-- mortgage: thế chấp
-- split: tách sổ
-- sale_update: xuất bán
DROP POLICY IF EXISTS "Tạo transaction đúng theo permission của role" ON transactions;
CREATE POLICY "Tạo transaction đúng theo permission của role"
ON transactions FOR INSERT
WITH CHECK (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and (
      (p.role in ('super_admin', 'admin', 'btc_manager'))
      or (p.role = 'capital_dept' and type in ('checkout', 'checkin', 'mortgage'))
      or (p.role = 'project_dept' and type in ('checkout', 'checkin', 'split'))
      or (p.role = 're_dept' and type in ('checkout', 'checkin', 'sale_update'))
    )
  )
);

DROP POLICY IF EXISTS "Chỉ btc_manager/warehouse_manager được duyệt transaction" ON transactions;
CREATE POLICY "Chỉ btc_manager/warehouse_manager được duyệt transaction"
ON transactions FOR UPDATE
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
  )
);

DROP POLICY IF EXISTS "Xem transaction: người tạo hoặc người có quyền duyệt" ON transactions;
CREATE POLICY "Xem transaction: người tạo hoặc người có quyền duyệt"
ON transactions FOR SELECT
USING (
  created_by = auth.uid()
  or exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
  )
);

-- RLS policies cho `transaction_items`
DROP POLICY IF EXISTS "Tạo transaction_items cho user active" ON transaction_items;
CREATE POLICY "Tạo transaction_items cho user active"
ON transaction_items FOR INSERT
WITH CHECK (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'warehouse_manager')
  )
);

DROP POLICY IF EXISTS "Xem transaction_items cho user active" ON transaction_items;
CREATE POLICY "Xem transaction_items cho user active"
ON transaction_items FOR SELECT
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'warehouse_manager')
  )
);

DROP POLICY IF EXISTS "Duyệt transaction_items cho btc_manager và warehouse_manager" ON transaction_items;
CREATE POLICY "Duyệt transaction_items cho btc_manager và warehouse_manager"
ON transaction_items FOR UPDATE
USING (
  exists (
    select 1 from profiles p 
    where p.id = auth.uid() 
    and p.status = 'active'
    and p.role in ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
  )
);

-- ------------------------------------------------------------------------------
-- 8. RPC FUNCTION: DUYỆT YÊU CẦU VIEWER VÀ CẤP QUYỀN TRUY CẬP KHO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_viewer_access_request(
  p_request_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
  v_reviewer RECORD;
  v_user_id UUID;
BEGIN
  -- Lấy thông tin người thực hiện
  SELECT * INTO v_reviewer FROM profiles WHERE id = auth.uid() AND status = 'active';
  IF NOT FOUND OR v_reviewer.role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt yêu cầu truy cập kho';
  END IF;

  -- Lấy thông tin yêu cầu
  SELECT * INTO v_req FROM access_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu truy cập';
  END IF;

  -- Kiểm tra quyền của thủ kho với kho yêu cầu
  IF v_reviewer.role = 'warehouse_manager' AND NOT (v_req.warehouse_id = ANY(v_reviewer.managed_warehouse_ids)) THEN
    RAISE EXCEPTION 'Thủ kho chỉ được duyệt yêu cầu thuộc kho do mình phụ trách';
  END IF;

  -- Tìm user profile theo email
  SELECT id INTO v_user_id FROM profiles WHERE LOWER(email) = LOWER(v_req.email);

  -- Nếu chưa có profile, tạo profile mới với role viewer
  IF v_user_id IS NULL THEN
    INSERT INTO profiles (
      email,
      full_name,
      role,
      status,
      permissions
    ) VALUES (
      LOWER(v_req.email),
      v_req.full_name,
      'viewer',
      'active',
      ARRAY['asset.view']
    )
    RETURNING id INTO v_user_id;
  ELSE
    -- Cập nhật profile hiện có sang active
    UPDATE profiles 
    SET status = 'active' 
    WHERE id = v_user_id;
  END IF;

  -- Cấp quyền xem kho trong bảng `viewer_warehouse_access` (UPSERT)
  INSERT INTO viewer_warehouse_access (
    user_id,
    warehouse_id,
    approved_by,
    approved_at,
    expires_at,
    notes
  ) VALUES (
    v_user_id,
    v_req.warehouse_id,
    auth.uid(),
    timezone('utc'::text, now()),
    p_expires_at,
    p_notes
  )
  ON CONFLICT (user_id, warehouse_id) 
  DO UPDATE SET
    approved_by = auth.uid(),
    approved_at = timezone('utc'::text, now()),
    expires_at = p_expires_at,
    notes = p_notes;

  -- Cập nhật trạng thái access_requests
  UPDATE access_requests
  SET 
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'warehouse_id', v_req.warehouse_id,
    'expires_at', p_expires_at
  );
END;
$$;
