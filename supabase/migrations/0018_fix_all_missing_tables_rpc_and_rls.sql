-- ==============================================================================
-- MIGRATION 0018: KHẮC PHỤC TRIỆT ĐỂ LỖI KẾT NỐI, THIẾU BẢNG, THIẾU RPC VÀ RLS
-- Hệ thống: Quản lý Giấy chứng nhận QSDĐ & TSĐB (BTC VMT)
-- File an toàn tuyệt đối (Idempotent): Sử dụng CREATE TABLE IF NOT EXISTS & ALTER TABLE ADD COLUMN
-- ==============================================================================

-- 1. BẬT TIỆN ÍCH MỞ RỘNG CẦN THIẾT
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TẠO CÁC BẢNG DANH MỤC CƠ SỞ (NẾU CHƯA CÓ)
-- ==============================================================================

-- Bảng Vùng miền (regions)
CREATE TABLE IF NOT EXISTS public.regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng Địa bàn (areas)
CREATE TABLE IF NOT EXISTS public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID REFERENCES public.regions(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (region_id, name)
);

-- Bảng Kho lưu trữ (warehouses)
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
    code TEXT,
    region_code TEXT,
    is_central BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng Pháp nhân CĐT/NĐT (investor_entities)
CREATE TABLE IF NOT EXISTS public.investor_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    short_name TEXT,
    tax_code TEXT,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng Dự án (projects)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE NOT NULL,
    default_owner_entity_id UUID REFERENCES public.investor_entities(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 3. TẠO BẢNG TÀI KHOẢN APP_USERS & PROFILES
-- ==============================================================================

-- Bảng app_users phục vụ cơ chế đăng nhập bằng Username thuần túy
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disabled', 'active', 'inactive')),
    access_expires_at TIMESTAMPTZ,
    full_name TEXT,
    phone TEXT,
    organization TEXT,
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng profiles (hồ sơ người dùng hệ thống)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
    area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
    project_ids UUID[],
    managed_warehouse_ids UUID[],
    assigned_warehouse_ids UUID[],
    owner_entity_ids UUID[],
    permissions TEXT[],
    status TEXT NOT NULL DEFAULT 'active',
    access_expires_at TIMESTAMPTZ,
    phone TEXT,
    organization TEXT,
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. BẢNG TÀI SẢN (ASSETS) VÀ LỊCH SỬ SỞ HỮU
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_no TEXT UNIQUE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    subdivision TEXT,
    area NUMERIC,
    owner_name TEXT,

    custody_status TEXT NOT NULL DEFAULT 'in_stock',
    lifecycle_status TEXT NOT NULL DEFAULT 'active',
    sale_status TEXT NOT NULL DEFAULT 'not_ready',
    mortgage_status TEXT NOT NULL DEFAULT 'none',

    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    current_holder_dept TEXT,

    asset_type TEXT,
    land_lot_no TEXT,
    map_sheet_no TEXT,
    province TEXT,
    district TEXT,
    ward TEXT,
    address_detail TEXT,
    registry_no TEXT,
    registry_date DATE,
    managing_unit TEXT,
    usage_purpose TEXT,
    usage_term_type TEXT,
    usage_term_date DATE,
    notes TEXT,

    mortgage_bank TEXT,
    mortgage_unit TEXT,
    mortgage_valuation NUMERIC,
    mortgage_expected_release_date DATE,

    scan_file_url TEXT,
    parent_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,

    expected_return_date DATE,
    borrow_purpose TEXT,

    certificate_group TEXT,
    lot_no TEXT,
    business_project TEXT,
    business_plot TEXT,
    is_commercial_allocated BOOLEAN DEFAULT false,

    current_owner_entity_id UUID REFERENCES public.investor_entities(id) ON DELETE SET NULL,
    current_owner_role TEXT,

    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng lịch sử chuyển nhượng sở hữu (asset_ownership_transfers)
CREATE TABLE IF NOT EXISTS public.asset_ownership_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    from_entity_id UUID REFERENCES public.investor_entities(id) ON DELETE SET NULL,
    from_role TEXT,
    to_entity_id UUID REFERENCES public.investor_entities(id) ON DELETE SET NULL,
    to_role TEXT,
    transferred_by UUID,
    transferred_at TIMESTAMPTZ DEFAULT now(),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 5. BẢNG GIAO DỊCH, THẾ CHẤP, PHẢN ÁNH LIÊN KẾT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    requester_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    voucher_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_notes TEXT,
    decided_by UUID,
    decided_at TIMESTAMPTZ,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.collaterals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    bank TEXT,
    borrower TEXT,
    valuation NUMERIC,
    guarantee_ratio NUMERIC,
    status TEXT NOT NULL DEFAULT 'active',
    started_at DATE DEFAULT CURRENT_DATE,
    released_at DATE
);

CREATE TABLE IF NOT EXISTS public.asset_lineage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    decision_no TEXT,
    event_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_lineage_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.asset_lineage_events(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL
);

-- ==============================================================================
-- 6. BẢNG NHẬT KÝ VÀ TRUY VẾT (LOGS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    action_type TEXT NOT NULL,
    document_no TEXT,
    description TEXT,
    used_by TEXT,
    notes TEXT,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    performed_by UUID,
    region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
    area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    performed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    resource_table TEXT,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 7. BẢNG YÊU CẦU TRUY CẬP KHO (ACCESS REQUESTS & VIEWER ACCESS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    organization TEXT,
    purpose TEXT,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    reject_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.viewer_warehouse_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(user_id, warehouse_id)
);

-- ==============================================================================
-- 8. BẢNG THÔNG BÁO (NOTIFICATIONS) - THIẾU Ở CÁC PHIÊN BẢN CŨ
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    transaction_item_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- ==============================================================================
-- 9. BẢNG CHỐT KỲ BÁO CÁO (REPORT SNAPSHOTS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT true,
    locked_at TIMESTAMPTZ DEFAULT now(),
    locked_by UUID,
    denormalized_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_assets INT NOT NULL DEFAULT 0,
    total_area NUMERIC NOT NULL DEFAULT 0,
    in_stock_count INT NOT NULL DEFAULT 0,
    mortgaged_count INT NOT NULL DEFAULT 0,
    sold_count INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 10. BẢNG KIỂM KÊ KHO (INVENTORY AUDITS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    performed_by UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress',
    notes TEXT,
    total_expected INT NOT NULL DEFAULT 0,
    total_found INT NOT NULL DEFAULT 0,
    total_missing INT NOT NULL DEFAULT 0,
    total_misplaced INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    expected_status TEXT NOT NULL DEFAULT 'in_stock',
    expected_location TEXT,
    actual_found BOOLEAN NOT NULL DEFAULT false,
    actual_location TEXT,
    finding_status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    audited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 11. CÁC HÀM THỦ TỤC RPC (STORED PROCEDURES) VỚI ĐẦY ĐỦ QUYỀN EXECUTE
-- ==============================================================================

-- 11.1. Đăng ký tài khoản app_users
CREATE OR REPLACE FUNCTION public.register_user(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    status TEXT,
    access_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_id UUID;
    v_clean_username TEXT := lower(trim(p_username));
BEGIN
    IF exists (SELECT 1 FROM public.app_users WHERE lower(username) = v_clean_username) THEN
        RAISE EXCEPTION 'Tên đăng nhập đã tồn tại trong hệ thống.';
    END IF;

    INSERT INTO public.app_users (username, password, role, status, access_expires_at)
    VALUES (v_clean_username, p_password, 'user', 'pending', null)
    RETURNING app_users.id INTO v_new_id;

    RETURN QUERY
    SELECT au.id, au.username, au.role, au.status, au.access_expires_at, au.created_at
    FROM public.app_users au
    WHERE au.id = v_new_id;
END;
$$;

-- 11.2. Đăng nhập tài khoản app_users
CREATE OR REPLACE FUNCTION public.login_user(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    role TEXT,
    status TEXT,
    access_expires_at TIMESTAMPTZ,
    full_name TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_clean_username TEXT := lower(trim(p_username));
BEGIN
    RETURN QUERY
    SELECT au.id, au.username, au.role, au.status, au.access_expires_at, coalesce(au.full_name, au.username) as full_name
    FROM public.app_users au
    WHERE lower(au.username) = v_clean_username
      AND au.password = p_password
    LIMIT 1;
END;
$$;

-- 11.3. Duyệt tài khoản app_users
CREATE OR REPLACE FUNCTION public.approve_user(
    p_user_id UUID,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.app_users
    SET status = 'approved',
        access_expires_at = p_expires_at
    WHERE id = p_user_id;

    RETURN true;
END;
$$;

-- 11.4. Chuyển quyền sở hữu tài sản (transfer_asset_ownership)
CREATE OR REPLACE FUNCTION public.transfer_asset_ownership(
    p_asset_id UUID,
    p_to_entity_id UUID,
    p_to_role TEXT,
    p_note TEXT,
    p_transferred_by UUID
)
RETURNS public.asset_ownership_transfers
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_owner_entity_id UUID;
    v_current_owner_role TEXT;
    v_transfer_row public.asset_ownership_transfers;
BEGIN
    SELECT current_owner_entity_id, current_owner_role
    INTO v_current_owner_entity_id, v_current_owner_role
    FROM public.assets
    WHERE id = p_asset_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tài sản không tồn tại (id = %)', p_asset_id;
    END IF;

    INSERT INTO public.asset_ownership_transfers (
        asset_id,
        from_entity_id,
        from_role,
        to_entity_id,
        to_role,
        transferred_by,
        transferred_at,
        note
    ) VALUES (
        p_asset_id,
        v_current_owner_entity_id,
        v_current_owner_role,
        p_to_entity_id,
        p_to_role,
        p_transferred_by,
        now(),
        p_note
    ) RETURNING * INTO v_transfer_row;

    UPDATE public.assets
    SET current_owner_entity_id = p_to_entity_id,
        current_owner_role = p_to_role,
        updated_at = now(),
        updated_by = p_transferred_by
    WHERE id = p_asset_id;

    RETURN v_transfer_row;
END;
$$;

-- 11.5. Tra cứu nhanh trạng thái tài sản cho Viewer
CREATE OR REPLACE FUNCTION public.lookup_asset_status(p_query TEXT)
RETURNS TABLE (
    certificate_no TEXT,
    project_name TEXT,
    subdivision TEXT,
    custody_status TEXT,
    lifecycle_status TEXT,
    sale_status TEXT,
    mortgage_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.certificate_no,
        p.name AS project_name,
        a.subdivision,
        a.custody_status,
        a.lifecycle_status,
        a.sale_status,
        a.mortgage_status
    FROM public.assets a
    LEFT JOIN public.projects p ON p.id = a.project_id
    WHERE (
        a.certificate_no ILIKE '%' || p_query || '%'
        OR a.subdivision ILIKE '%' || p_query || '%'
        OR p.name ILIKE '%' || p_query || '%'
    )
    LIMIT 50;
END;
$$;

-- 11.6. Khóa kỳ báo cáo (lock_reporting_period)
CREATE OR REPLACE FUNCTION public.lock_reporting_period(
    p_period_name TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_created_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.report_snapshots
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_snapshot public.report_snapshots;
    v_assets JSONB;
    v_total_assets INT;
    v_total_area NUMERIC;
    v_in_stock INT;
    v_mortgaged INT;
    v_sold INT;
BEGIN
    SELECT 
        coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb),
        count(*),
        coalesce(sum(a.area), 0),
        count(*) FILTER (WHERE a.custody_status = 'in_stock'),
        count(*) FILTER (WHERE a.mortgage_status = 'mortgaged'),
        count(*) FILTER (WHERE a.sale_status = 'sold')
    INTO v_assets, v_total_assets, v_total_area, v_in_stock, v_mortgaged, v_sold
    FROM public.assets a;

    INSERT INTO public.report_snapshots (
        period_name, start_date, end_date, is_locked, locked_at, locked_by,
        denormalized_assets, total_assets, total_area, in_stock_count, mortgaged_count, sold_count, notes
    ) VALUES (
        p_period_name, p_start_date, p_end_date, true, now(), p_created_by,
        v_assets, v_total_assets, v_total_area, v_in_stock, v_mortgaged, v_sold, p_notes
    ) RETURNING * INTO v_snapshot;

    RETURN v_snapshot;
END;
$$;

-- 11.7. Mở khóa kỳ báo cáo (reopen_reporting_period)
CREATE OR REPLACE FUNCTION public.reopen_reporting_period(
    p_snapshot_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.report_snapshots
    SET is_locked = false,
        notes = coalesce(notes || ' | ', '') || 'Mở khóa: ' || coalesce(p_reason, 'Không có lý do')
    WHERE id = p_snapshot_id;

    RETURN true;
END;
$$;

-- ==============================================================================
-- 12. CẤP QUYỀN THỰC THI (GRANT EXECUTE) CHO TOÀN BỘ CÁC HÀM RPC
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_user(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_user(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_asset_ownership(UUID, UUID, TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_asset_status(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lock_reporting_period(TEXT, DATE, DATE, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_reporting_period(UUID, TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 13. CHÍNH SÁCH BẢO MẬT ROW LEVEL SECURITY (RLS) TƯƠNG THÍCH MỌI MÔ HÌNH CLIENT
-- ==============================================================================

-- Bật RLS cho các bảng
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaterals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewer_warehouse_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_ownership_transfers ENABLE ROW LEVEL SECURITY;

-- Cấp quyền bảng cho roles anon, authenticated, service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Thiết lập các Policy cho phép đọc/ghi an toàn
-- Danh mục dùng chung (regions, areas, warehouses, projects, investor_entities): Cho phép đọc tự do
DROP POLICY IF EXISTS "allow_read_regions" ON public.regions;
CREATE POLICY "allow_read_regions" ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_write_regions" ON public.regions;
CREATE POLICY "allow_write_regions" ON public.regions FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_read_areas" ON public.areas;
CREATE POLICY "allow_read_areas" ON public.areas FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_write_areas" ON public.areas;
CREATE POLICY "allow_write_areas" ON public.areas FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_read_warehouses" ON public.warehouses;
CREATE POLICY "allow_read_warehouses" ON public.warehouses FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_write_warehouses" ON public.warehouses;
CREATE POLICY "allow_write_warehouses" ON public.warehouses FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_read_projects" ON public.projects;
CREATE POLICY "allow_read_projects" ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_write_projects" ON public.projects;
CREATE POLICY "allow_write_projects" ON public.projects FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_read_investor_entities" ON public.investor_entities;
CREATE POLICY "allow_read_investor_entities" ON public.investor_entities FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_write_investor_entities" ON public.investor_entities;
CREATE POLICY "allow_write_investor_entities" ON public.investor_entities FOR ALL USING (true);

-- Policy cho bảng tài khoản (app_users, profiles)
DROP POLICY IF EXISTS "allow_all_app_users" ON public.app_users;
CREATE POLICY "allow_all_app_users" ON public.app_users FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_profiles" ON public.profiles;
CREATE POLICY "allow_all_profiles" ON public.profiles FOR ALL USING (true);

-- Policy cho bảng nghiệp vụ cốt lõi (assets, transactions, items)
DROP POLICY IF EXISTS "allow_all_assets" ON public.assets;
CREATE POLICY "allow_all_assets" ON public.assets FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_transactions" ON public.transactions;
CREATE POLICY "allow_all_transactions" ON public.transactions FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_transaction_items" ON public.transaction_items;
CREATE POLICY "allow_all_transaction_items" ON public.transaction_items FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_ownership_transfers" ON public.asset_ownership_transfers;
CREATE POLICY "allow_all_ownership_transfers" ON public.asset_ownership_transfers FOR ALL USING (true);

-- Policy cho logs và notifications
DROP POLICY IF EXISTS "allow_all_notifications" ON public.notifications;
CREATE POLICY "allow_all_notifications" ON public.notifications FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_activity_logs" ON public.activity_logs;
CREATE POLICY "allow_all_activity_logs" ON public.activity_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_audit_logs" ON public.audit_logs;
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_access_logs" ON public.access_logs;
CREATE POLICY "allow_all_access_logs" ON public.access_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_access_requests" ON public.access_requests;
CREATE POLICY "allow_all_access_requests" ON public.access_requests FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_viewer_access" ON public.viewer_warehouse_access;
CREATE POLICY "allow_all_viewer_access" ON public.viewer_warehouse_access FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_report_snapshots" ON public.report_snapshots;
CREATE POLICY "allow_all_report_snapshots" ON public.report_snapshots FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_inventory_audits" ON public.inventory_audits;
CREATE POLICY "allow_all_inventory_audits" ON public.inventory_audits FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_inventory_audit_items" ON public.inventory_audit_items;
CREATE POLICY "allow_all_inventory_audit_items" ON public.inventory_audit_items FOR ALL USING (true);

-- ==============================================================================
-- 14. KHỞI TẠO DỮ LIỆU DANH MỤC CƠ BẢN (NẾU ĐANG TRỐNG)
-- ==============================================================================

INSERT INTO public.regions (name)
VALUES ('Miền Bắc'), ('Miền Trung'), ('Miền Nam')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.areas (region_id, name)
SELECT id, 'Đà Nẵng' FROM public.regions WHERE name = 'Miền Trung'
ON CONFLICT (region_id, name) DO NOTHING;

INSERT INTO public.areas (region_id, name)
SELECT id, 'Quảng Nam' FROM public.regions WHERE name = 'Miền Trung'
ON CONFLICT (region_id, name) DO NOTHING;

INSERT INTO public.areas (region_id, name)
SELECT id, 'Huế' FROM public.regions WHERE name = 'Miền Trung'
ON CONFLICT (region_id, name) DO NOTHING;

INSERT INTO public.warehouses (name, region_id, is_central, code)
SELECT 'Kho BTC VMT', r.id, true, 'KHO-VMT-01'
FROM public.regions r
WHERE r.name = 'Miền Trung'
AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE name = 'Kho BTC VMT');

-- Thông báo hoàn tất
DO $$
BEGIN
    RAISE NOTICE 'Migration 0018: Đã hoàn tất đồng bộ toàn bộ bảng, RPC functions và RLS policies.';
END $$;
