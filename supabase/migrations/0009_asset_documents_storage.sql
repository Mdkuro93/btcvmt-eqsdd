-- ==============================================================================
-- MIGRATION: SUPABASE STORAGE BUCKET & RLS POLICIES FOR ASSET DOCUMENTS
-- Bucket name: asset-documents (Private)
-- ==============================================================================

-- 1. Create the private bucket 'asset-documents' if it does not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'asset-documents',
  'asset-documents',
  false,
  10485760, -- 10MB limit in bytes (10 * 1024 * 1024)
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

-- 2. INSERT Policy: Only authenticated users with asset.edit / asset.create / asset.manage or appropriate manager roles
DROP POLICY IF EXISTS "Cho phep upload file dinh kem asset" ON storage.objects;
CREATE POLICY "Cho phep upload file dinh kem asset"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'asset-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly')
        OR (p.permissions IS NOT NULL AND (
          'asset.create' = ANY(p.permissions)
          OR 'asset.edit' = ANY(p.permissions)
          OR 'asset.manage' = ANY(p.permissions)
        ))
      )
    )
  )
);

-- 3. SELECT Policy: Users with asset.view / asset.manage or authorized roles / active warehouse access
DROP POLICY IF EXISTS "Cho phep doc file dinh kem asset theo phan quyen" ON storage.objects;
CREATE POLICY "Cho phep doc file dinh kem asset theo phan quyen"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly', 'capital_dept', 'project_dept', 're_dept', 'chuyen_vien')
        OR (p.permissions IS NOT NULL AND (
          'asset.view' = ANY(p.permissions)
          OR 'asset.manage' = ANY(p.permissions)
        ))
        OR (
          p.role IN ('viewer', 'nguoi_dung', 'user')
          AND (
            EXISTS (
              SELECT 1 FROM public.viewer_warehouse_access vwa
              WHERE vwa.user_id = p.id
              AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc'::text, now()))
            )
          )
        )
      )
    )
  )
);

-- 4. UPDATE Policy: Users with asset.edit / asset.manage
DROP POLICY IF EXISTS "Cho phep cap nhat file dinh kem asset" ON storage.objects;
CREATE POLICY "Cho phep cap nhat file dinh kem asset"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly')
        OR (p.permissions IS NOT NULL AND (
          'asset.edit' = ANY(p.permissions)
          OR 'asset.manage' = ANY(p.permissions)
        ))
      )
    )
  )
);

-- 5. DELETE Policy: Super admin, admin, btc_manager
DROP POLICY IF EXISTS "Cho phep xoa file dinh kem asset" ON storage.objects;
CREATE POLICY "Cho phep xoa file dinh kem asset"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND (
        p.role IN ('super_admin', 'admin', 'btc_manager')
        OR (p.permissions IS NOT NULL AND 'asset.manage' = ANY(p.permissions))
      )
    )
  )
);
