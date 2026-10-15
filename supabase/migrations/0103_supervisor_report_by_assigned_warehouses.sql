-- Migration 0103: vai trò "Quản lý" (supervisor) xem báo cáo THEO KHO ĐƯỢC GÁN (assigned_warehouse_ids) - chỉ đọc
-- Thay thế hướng "xem toàn bộ" của 0102 (chạy 0102 hay chưa đều được; file này tự gỡ policy của 0102).
--   1. Gỡ 2 policy "xem tất cả" của 0102.
--   2. assets: supervisor chỉ xem GCN thuộc kho trong "Kho phụ trách" (Quản lý người dùng > Sửa thông tin & Phân quyền).
--   3. asset_ownership_transfers: supervisor xem lịch sử chuyển nhượng của GCN trong kho được gán (cho tab Rà soát thế chấp).
--   4. get_report_statistics: supervisor tính theo kho được gán (như phòng ban nghiệp vụ).
--   report_snapshots đã có sẵn quy tắc theo kho được gán (0011) nên không đổi.
-- Supervisor chưa được gán kho nào thì không thấy GCN nào (admin cần tick "Kho phụ trách" cho tài khoản).
BEGIN;

DROP POLICY IF EXISTS "assets_select_supervisor_all" ON public.assets;
DROP POLICY IF EXISTS "report_snapshots_select_supervisor_all" ON public.report_snapshots;

DROP POLICY IF EXISTS "assets_select_supervisor_assigned" ON public.assets;
CREATE POLICY "assets_select_supervisor_assigned"
ON public.assets FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'supervisor'
      AND assets.warehouse_id = ANY (coalesce(p.assigned_warehouse_ids, ARRAY[]::uuid[]))
  )
);

DROP POLICY IF EXISTS "aot_select_supervisor_assigned" ON public.asset_ownership_transfers;
CREATE POLICY "aot_select_supervisor_assigned"
ON public.asset_ownership_transfers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.assets a ON a.id = asset_ownership_transfers.asset_id
    WHERE p.id = auth.uid() AND p.status = 'active' AND p.role = 'supervisor'
      AND a.warehouse_id = ANY (coalesce(p.assigned_warehouse_ids, ARRAY[]::uuid[]))
  )
);

CREATE OR REPLACE FUNCTION get_report_statistics(
  p_region_name text DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_mortgage_status text DEFAULT NULL,
  p_search_term text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_result jsonb;
  v_clean_region text;
  v_clean_search text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
      'total_mortgage_valuation', 0, 'in_stock_count', 0,
      'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
      'total_mortgage_valuation', 0, 'in_stock_count', 0,
      'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  v_clean_region := NULLIF(trim(p_region_name), '');
  IF v_clean_region = 'Tất cả vùng' THEN
    v_clean_region := NULL;
  ELSIF v_clean_region IS NOT NULL THEN
    v_clean_region := replace(v_clean_region, 'Vùng ', '');
    v_clean_region := trim(v_clean_region);
  END IF;

  v_clean_search := NULLIF(trim(p_search_term), '');

  WITH accessible_assets AS (
    SELECT
      a.id,
      a.area,
      a.mortgage_status,
      a.mortgage_bank,
      a.mortgage_valuation,
      a.collateral_value,
      a.custody_status,
      a.certificate_no,
      oe.name AS owner_name,
      a.land_lot_no,
      a.legal_lot_code,
      a.warehouse_id,
      a.project_id,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      r_wh.name AS warehouse_region_name,
      p.name AS project_name,
      r_pr.name AS project_region_name
    FROM assets a
    LEFT JOIN warehouses w ON w.id = a.warehouse_id
    LEFT JOIN regions r_wh ON r_wh.id = w.region_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN areas ar ON ar.id = p.area_id
    LEFT JOIN regions r_pr ON r_pr.id = ar.region_id
    LEFT JOIN investor_entities oe ON oe.id = a.current_owner_entity_id
    WHERE (
      v_profile.role IN ('super_admin', 'admin', 'btc_manager')
      OR (v_profile.role = 'warehouse_manager' AND a.warehouse_id = ANY(v_profile.managed_warehouse_ids))
      OR (v_profile.role IN ('capital_dept', 'project_dept', 're_dept', 'supervisor') AND a.warehouse_id = ANY(v_profile.assigned_warehouse_ids))
      OR (v_profile.role = 'investor' AND a.current_owner_entity_id = ANY(v_profile.owner_entity_ids))
      OR (
        v_profile.role = 'viewer' AND EXISTS (
          SELECT 1 FROM viewer_warehouse_access vwa
          WHERE vwa.user_id = v_user_id
          AND vwa.warehouse_id = a.warehouse_id
          AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc'::text, now()))
        )
      )
    )
  ),
  overall_stats AS (
    SELECT
      COUNT(*) AS total_accessible,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS total_accessible_mortgaged
    FROM accessible_assets
  ),
  filtered_assets AS (
    SELECT *
    FROM accessible_assets
    WHERE
      (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_project_id IS NULL OR project_id = p_project_id)
      AND (p_mortgage_status IS NULL OR p_mortgage_status = '' OR mortgage_status = p_mortgage_status)
      AND (
        v_clean_region IS NULL
        OR (warehouse_region_name ILIKE '%' || v_clean_region || '%')
        OR (project_region_name ILIKE '%' || v_clean_region || '%')
      )
      AND (
        v_clean_search IS NULL
        OR certificate_no ILIKE '%' || v_clean_search || '%'
        OR owner_name ILIKE '%' || v_clean_search || '%'
        OR land_lot_no ILIKE '%' || v_clean_search || '%'
        OR legal_lot_code ILIKE '%' || v_clean_search || '%'
        OR project_name ILIKE '%' || v_clean_search || '%'
      )
  ),
  summary_stats AS (
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation,
      COUNT(*) FILTER (WHERE custody_status = 'in_stock') AS in_stock_count
    FROM filtered_assets
  ),
  warehouse_agg AS (
    SELECT
      warehouse_id,
      COALESCE(warehouse_name, 'Chưa xác định') AS warehouse_name,
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation,
      COUNT(*) FILTER (WHERE custody_status = 'in_stock') AS in_stock_count
    FROM filtered_assets
    WHERE warehouse_id IS NOT NULL
    GROUP BY warehouse_id, warehouse_name
    ORDER BY total_count DESC
  ),
  project_agg AS (
    SELECT
      project_id,
      COALESCE(project_name, 'Chưa xác định') AS project_name,
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation
    FROM filtered_assets
    WHERE project_id IS NOT NULL
    GROUP BY project_id, project_name
    ORDER BY total_count DESC
  ),
  bank_agg AS (
    SELECT
      COALESCE(NULLIF(trim(mortgage_bank), ''), 'Chưa cập nhật tên NH') AS mortgage_bank,
      COUNT(*) AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation), 0) AS total_valuation,
      COALESCE(SUM(collateral_value), 0) AS total_collateral_value
    FROM filtered_assets
    WHERE mortgage_status = 'mortgaged'
    GROUP BY mortgage_bank
    ORDER BY mortgaged_count DESC
  )
  SELECT jsonb_build_object(
    'total_count', COALESCE(ss.total_count, 0),
    'total_area', COALESCE(ss.total_area, 0),
    'mortgaged_count', COALESCE(ss.mortgaged_count, 0),
    'total_mortgage_valuation', COALESCE(ss.total_mortgage_valuation, 0),
    'in_stock_count', COALESCE(ss.in_stock_count, 0),
    'total_accessible_assets', COALESCE(os.total_accessible, 0),
    'total_accessible_mortgaged', COALESCE(os.total_accessible_mortgaged, 0),
    'by_warehouse', COALESCE((SELECT jsonb_agg(w) FROM warehouse_agg w), '[]'::jsonb),
    'by_project', COALESCE((SELECT jsonb_agg(p) FROM project_agg p), '[]'::jsonb),
    'by_mortgage_bank', COALESCE((SELECT jsonb_agg(b) FROM bank_agg b), '[]'::jsonb)
  )
  INTO v_result
  FROM summary_stats ss, overall_stats os;

  RETURN COALESCE(v_result, jsonb_build_object(
    'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
    'total_mortgage_valuation', 0, 'in_stock_count', 0,
    'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
    'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
  ));
END;
$$;

COMMIT;

-- KIỂM TRA: đăng nhập Quản lý được gán 2 kho -> Báo cáo chỉ ra GCN của 2 kho đó; tab "Rà soát thế chấp" hiện, không có nút chuyển nhượng.
-- ROLLBACK:
--   DROP POLICY IF EXISTS "assets_select_supervisor_assigned" ON public.assets;
--   DROP POLICY IF EXISTS "aot_select_supervisor_assigned" ON public.asset_ownership_transfers;
--   rồi chạy lại hàm get_report_statistics của migration 0022 (kèm SET search_path = public, pg_temp như 0085).