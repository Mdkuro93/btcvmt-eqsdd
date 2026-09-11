-- ==============================================================================
-- MIGRATION: 0017_reports_aggregation.sql
-- HỆ THỐNG: QUẢN LÝ GCN QSDĐ & TSĐB (BTC VMT)
-- MỤC ĐÍCH:
--   1. Tạo RPC Function `get_report_statistics` (SECURITY DEFINER) tính toán toàn bộ
--      chỉ số tổng hợp báo cáo (KPI cards, badges, group by kho/dự án/ngân hàng)
--      trực tiếp trong Postgres, giảm tải chuyển toàn bộ bảng assets về client.
--   2. Tạo các Postgres VIEWs tổng hợp `v_report_warehouse_summary`, 
--      `v_report_project_summary`, `v_report_mortgage_bank_summary`.
--   3. Đảm bảo tôn trọng đúng RLS và phạm vi phân quyền của người gọi:
--      - Admin/BTC Manager: xem toàn bộ
--      - Warehouse Manager: xem theo managed_warehouse_ids
--      - Ban Chuyên Môn (Nguồn Vốn, PTDA, KD BĐS): xem theo assigned_warehouse_ids
--      - Nhà đầu tư (Investor): xem theo owner_entity_ids
--      - Viewer ngoài: xem theo viewer_warehouse_access
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC FUNCTION: get_report_statistics
-- ------------------------------------------------------------------------------
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
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_result jsonb;
  v_clean_region text;
  v_clean_search text;
BEGIN
  v_user_id := auth.uid();
  
  -- Nếu chưa đăng nhập hoặc không có session hợp lệ
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'total_area', 0,
      'mortgaged_count', 0,
      'total_mortgage_valuation', 0,
      'in_stock_count', 0,
      'total_accessible_assets', 0,
      'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb,
      'by_project', '[]'::jsonb,
      'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  -- Lấy profile người dùng hiện tại
  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'total_area', 0,
      'mortgaged_count', 0,
      'total_mortgage_valuation', 0,
      'in_stock_count', 0,
      'total_accessible_assets', 0,
      'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb,
      'by_project', '[]'::jsonb,
      'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  -- Chuẩn hóa bộ lọc vùng
  v_clean_region := NULLIF(trim(p_region_name), '');
  IF v_clean_region = 'Tất cả vùng' THEN
    v_clean_region := NULL;
  ELSIF v_clean_region IS NOT NULL THEN
    v_clean_region := replace(v_clean_region, 'Vùng ', '');
    v_clean_region := trim(v_clean_region);
  END IF;

  -- Chuẩn hóa từ khóa tìm kiếm
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
      a.owner_name,
      a.land_lot_no,
      a.lot_no,
      a.subdivision,
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
    WHERE (
      -- 1. Quản trị viên BTC VMT, Super Admin, Admin: xem toàn bộ
      v_profile.role IN ('super_admin', 'admin', 'btc_manager')
      -- 2. Thủ kho: xem các kho do mình quản lý
      OR (v_profile.role = 'warehouse_manager' AND a.warehouse_id = ANY(v_profile.managed_warehouse_ids))
      -- 3. Ban chuyên môn (Nguồn Vốn, PTDA, KD BĐS): xem các kho được phân công
      OR (v_profile.role IN ('capital_dept', 'project_dept', 're_dept') AND a.warehouse_id = ANY(v_profile.assigned_warehouse_ids))
      -- 4. Nhà đầu tư (Investor): xem tài sản thuộc quyền sở hữu
      OR (v_profile.role = 'investor' AND a.current_owner_entity_id = ANY(v_profile.owner_entity_ids))
      -- 5. Viewer ngoài: xem kho đã duyệt trong viewer_warehouse_access
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
      -- Lọc theo kho
      (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      -- Lọc theo dự án
      AND (p_project_id IS NULL OR project_id = p_project_id)
      -- Lọc theo trạng thái thế chấp
      AND (p_mortgage_status IS NULL OR p_mortgage_status = '' OR mortgage_status = p_mortgage_status)
      -- Lọc theo vùng miền
      AND (
        v_clean_region IS NULL 
        OR (warehouse_region_name ILIKE '%' || v_clean_region || '%')
        OR (project_region_name ILIKE '%' || v_clean_region || '%')
      )
      -- Tìm kiếm từ khóa
      AND (
        v_clean_search IS NULL
        OR certificate_no ILIKE '%' || v_clean_search || '%'
        OR owner_name ILIKE '%' || v_clean_search || '%'
        OR land_lot_no ILIKE '%' || v_clean_search || '%'
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
    'total_count', 0,
    'total_area', 0,
    'mortgaged_count', 0,
    'total_mortgage_valuation', 0,
    'in_stock_count', 0,
    'total_accessible_assets', 0,
    'total_accessible_mortgaged', 0,
    'by_warehouse', '[]'::jsonb,
    'by_project', '[]'::jsonb,
    'by_mortgage_bank', '[]'::jsonb
  ));
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. POSTGRES VIEWS TỔNG HỢP THEO KHO, DỰ ÁN, NGÂN HÀNG (Security Invoker)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_report_warehouse_summary WITH (security_invoker = true) AS
SELECT 
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  r.name AS region_name,
  COUNT(a.id) AS total_count,
  COALESCE(SUM(a.area), 0) AS total_area,
  COUNT(a.id) FILTER (WHERE a.mortgage_status = 'mortgaged') AS mortgaged_count,
  COALESCE(SUM(a.mortgage_valuation) FILTER (WHERE a.mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation,
  COUNT(a.id) FILTER (WHERE a.custody_status = 'in_stock') AS in_stock_count,
  COUNT(a.id) FILTER (WHERE a.custody_status = 'checked_out') AS checked_out_count
FROM warehouses w
LEFT JOIN regions r ON r.id = w.region_id
LEFT JOIN assets a ON a.warehouse_id = w.id
GROUP BY w.id, w.name, w.code, r.name;

CREATE OR REPLACE VIEW v_report_project_summary WITH (security_invoker = true) AS
SELECT 
  p.id AS project_id,
  p.name AS project_name,
  ar.name AS area_name,
  r.name AS region_name,
  COUNT(a.id) AS total_count,
  COALESCE(SUM(a.area), 0) AS total_area,
  COUNT(a.id) FILTER (WHERE a.mortgage_status = 'mortgaged') AS mortgaged_count,
  COALESCE(SUM(a.mortgage_valuation) FILTER (WHERE a.mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation
FROM projects p
LEFT JOIN areas ar ON ar.id = p.area_id
LEFT JOIN regions r ON r.id = ar.region_id
LEFT JOIN assets a ON a.project_id = p.id
GROUP BY p.id, p.name, ar.name, r.name;

CREATE OR REPLACE VIEW v_report_mortgage_bank_summary WITH (security_invoker = true) AS
SELECT 
  COALESCE(NULLIF(trim(a.mortgage_bank), ''), 'Chưa cập nhật NH') AS mortgage_bank,
  COUNT(a.id) AS mortgaged_count,
  COALESCE(SUM(a.mortgage_valuation), 0) AS total_valuation,
  COALESCE(SUM(a.collateral_value), 0) AS total_collateral_value
FROM assets a
WHERE a.mortgage_status = 'mortgaged'
GROUP BY a.mortgage_bank;

-- ------------------------------------------------------------------------------
-- 3. PHÂN QUYỀN TRUY CẬP CHO RPC VÀ VIEWS
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_report_statistics(text, uuid, uuid, text, text) TO authenticated, anon;
GRANT SELECT ON v_report_warehouse_summary TO authenticated, anon;
GRANT SELECT ON v_report_project_summary TO authenticated, anon;
GRANT SELECT ON v_report_mortgage_bank_summary TO authenticated, anon;
