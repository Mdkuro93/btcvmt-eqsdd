-- ==============================================================================
-- MIGRATION: INVENTORY AUDITS (KIỂM KÊ KHO THỰC TẾ)
-- Tables: inventory_audits, inventory_audit_items
-- Includes RLS for warehouse managers, btc managers, and administrators
-- ==============================================================================

-- 1. Create table inventory_audits
CREATE TABLE IF NOT EXISTS public.inventory_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')) DEFAULT 'in_progress',
  notes TEXT,
  total_expected INT NOT NULL DEFAULT 0,
  total_found INT NOT NULL DEFAULT 0,
  total_missing INT NOT NULL DEFAULT 0,
  total_misplaced INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create table inventory_audit_items
CREATE TABLE IF NOT EXISTS public.inventory_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  expected_status TEXT NOT NULL DEFAULT 'in_stock',
  expected_location TEXT,
  actual_found BOOLEAN NOT NULL DEFAULT false,
  actual_location TEXT,
  finding_status TEXT NOT NULL CHECK (finding_status IN ('pending', 'matched', 'missing', 'misplaced')) DEFAULT 'pending',
  note TEXT,
  audited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_inventory_audits_wh ON public.inventory_audits(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_status ON public.inventory_audits(status);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_items_audit ON public.inventory_audit_items(audit_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_items_asset ON public.inventory_audit_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_items_finding ON public.inventory_audit_items(finding_status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. RLS Policies for inventory_audits
-- ------------------------------------------------------------------------------

-- SELECT Policy: Super Admin, Admin, BTC Manager, Warehouse Manager (của kho phụ trách), hoặc users có quyền report.view / asset.view
DROP POLICY IF EXISTS "Xem danh sach dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Xem danh sach dot kiem ke kho"
ON public.inventory_audits FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'quan_ly')
      OR (p.role = 'warehouse_manager' AND (p.managed_warehouse_ids IS NULL OR inventory_audits.warehouse_id = ANY(p.managed_warehouse_ids)))
      OR (p.permissions IS NOT NULL AND (
        'asset.view' = ANY(p.permissions)
        OR 'report.view' = ANY(p.permissions)
        OR 'asset.manage' = ANY(p.permissions)
      ))
      OR (
        p.role IN ('viewer', 'nguoi_dung', 'user')
        AND EXISTS (
          SELECT 1 FROM public.viewer_warehouse_access vwa
          WHERE vwa.user_id = p.id
          AND vwa.warehouse_id = inventory_audits.warehouse_id
          AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc'::text, now()))
        )
      )
    )
  )
);

-- INSERT Policy: Chỉ Super Admin, Admin, BTC Manager, hoặc Warehouse Manager của kho đó
DROP POLICY IF EXISTS "Tao dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Tao dot kiem ke kho"
ON public.inventory_audits FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'quan_ly')
      OR (p.role = 'warehouse_manager' AND (p.managed_warehouse_ids IS NULL OR inventory_audits.warehouse_id = ANY(p.managed_warehouse_ids)))
      OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY(p.permissions))
    )
  )
);

-- UPDATE Policy: Cập nhật đợt kiểm kê (thực hiện kiểm kê, hoàn tất đợt kiểm kê)
DROP POLICY IF EXISTS "Cap nhat dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Cap nhat dot kiem ke kho"
ON public.inventory_audits FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'quan_ly')
      OR (p.role = 'warehouse_manager' AND (p.managed_warehouse_ids IS NULL OR inventory_audits.warehouse_id = ANY(p.managed_warehouse_ids)))
      OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY(p.permissions))
    )
  )
);

-- DELETE Policy: Chỉ Super Admin, Admin, BTC Manager
DROP POLICY IF EXISTS "Xoa dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Xoa dot kiem ke kho"
ON public.inventory_audits FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role IN ('super_admin', 'admin', 'btc_manager')
  )
);

-- ------------------------------------------------------------------------------
-- 6. RLS Policies for inventory_audit_items
-- ------------------------------------------------------------------------------

-- SELECT Policy: Theo quyền truy cập của audit cha
DROP POLICY IF EXISTS "Xem chi tiet dong kiem ke" ON public.inventory_audit_items;
CREATE POLICY "Xem chi tiet dong kiem ke"
ON public.inventory_audit_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventory_audits ia
    WHERE ia.id = inventory_audit_items.audit_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager', 'quan_ly')
        OR (p.role = 'warehouse_manager' AND (p.managed_warehouse_ids IS NULL OR ia.warehouse_id = ANY(p.managed_warehouse_ids)))
        OR (p.permissions IS NOT NULL AND (
          'asset.view' = ANY(p.permissions)
          OR 'report.view' = ANY(p.permissions)
          OR 'asset.manage' = ANY(p.permissions)
        ))
      )
    )
  )
);

-- ALL Policy (INSERT/UPDATE/DELETE) for items
DROP POLICY IF EXISTS "Quan ly dong kiem ke" ON public.inventory_audit_items;
CREATE POLICY "Quan ly dong kiem ke"
ON public.inventory_audit_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventory_audits ia
    WHERE ia.id = inventory_audit_items.audit_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager', 'quan_ly')
        OR (p.role = 'warehouse_manager' AND (p.managed_warehouse_ids IS NULL OR ia.warehouse_id = ANY(p.managed_warehouse_ids)))
        OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY(p.permissions))
      )
    )
  )
);
