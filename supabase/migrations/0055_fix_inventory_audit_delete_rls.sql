-- =====================================================================================
-- 0055 — Cập nhật phân quyền Xóa đợt kiểm kê & chuẩn hóa khóa ngoại
-- =====================================================================================
-- MỤC ĐÍCH:
--   1. Đảm bảo khóa ngoại `inventory_audits.performed_by` trỏ tới `profiles(id)` với tên
--      `inventory_audits_performed_by_fkey` để PostgREST JOIN không bị lỗi.
--   2. Đảm bảo khóa ngoại `inventory_audit_items.audit_id` có `ON DELETE CASCADE`.
--   3. Cập nhật RLS Policy DELETE trên `inventory_audits`:
--      - Cho phép super_admin, admin, btc_manager xóa đợt kiểm kê.
--      - Cho phép warehouse_manager xóa đợt kiểm kê do chính mình tạo (performed_by = auth.uid())
--        khi đợt kiểm kê còn đang ở trạng thái 'in_progress'.
--   4. Cập nhật RLS Policy trên `inventory_audit_items`:
--      - Cho phép người tạo đợt kiểm kê quản lý/xóa các dòng items con.
-- =====================================================================================

BEGIN;

-- 1. Chuẩn hóa khóa ngoại performed_by -> profiles(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_audits_performed_by_fkey'
      AND table_name = 'inventory_audits'
  ) THEN
    ALTER TABLE public.inventory_audits
      ADD CONSTRAINT inventory_audits_performed_by_fkey
      FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Đảm bảo khóa ngoại audit_id có ON DELETE CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_audit_items_audit_id_fkey'
      AND table_name = 'inventory_audit_items'
  ) THEN
    ALTER TABLE public.inventory_audit_items
      DROP CONSTRAINT inventory_audit_items_audit_id_fkey;

    ALTER TABLE public.inventory_audit_items
      ADD CONSTRAINT inventory_audit_items_audit_id_fkey
      FOREIGN KEY (audit_id) REFERENCES public.inventory_audits(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Cập nhật RLS Policy DELETE trên inventory_audits
DROP POLICY IF EXISTS "Xoa dot kiem ke kho" ON public.inventory_audits;
CREATE POLICY "Xoa dot kiem ke kho"
ON public.inventory_audits FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager')
      OR (
        p.role = 'warehouse_manager'
        AND inventory_audits.performed_by = p.id
        AND inventory_audits.status = 'in_progress'
      )
    )
  )
);

-- 4. Cập nhật RLS Policy trên inventory_audit_items (cho phép xóa/quản lý item)
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
        OR (p.role = 'warehouse_manager' AND (
          p.managed_warehouse_ids IS NULL 
          OR ia.warehouse_id = ANY(p.managed_warehouse_ids)
          OR ia.performed_by = p.id
        ))
        OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY(p.permissions))
      )
    )
  )
);

COMMIT;
