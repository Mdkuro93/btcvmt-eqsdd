-- =====================================================================================
-- 0051 — Backfill project_id cho planned_land_lots & Cập nhật RPC đếm trạng thái lô
-- =====================================================================================
-- MỤC ĐÍCH:
--   1. Cập nhật project_id cho các bản ghi planned_land_lots cũ có parent_master_asset_id
--      nhưng project_id bị NULL, giúp truy vấn báo cáo theo dự án và các JOIN hoạt động chính xác.
--   2. Cập nhật hàm get_planned_lots_stage_counts để khớp project_id qua cả 3 bảng
--      (planned_land_lots, parent_master_asset, resulting_asset).
-- =====================================================================================

BEGIN;

-- 1. Backfill project_id cho planned_land_lots cũ từ parent_master_asset_id
UPDATE public.planned_land_lots
SET project_id = assets.project_id
FROM public.assets
WHERE planned_land_lots.parent_master_asset_id = assets.id
  AND planned_land_lots.project_id IS NULL;

-- 2. Cập nhật RPC đếm chỉ số 3 trạng thái lô hỗ trợ lọc theo dự án đa nguồn
CREATE OR REPLACE FUNCTION public.get_planned_lots_stage_counts(p_project_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage_unregistered integer := 0; -- Q/R: parent_master_asset_id IS NULL AND resulting_asset_id IS NULL
  v_stage_in_master    integer := 0; -- O/P: parent_master_asset_id IS NOT NULL AND resulting_asset_id IS NULL
  v_stage_issued       integer := 0; -- Đã có sổ riêng: resulting_asset_id IS NOT NULL
  v_total              integer := 0;
BEGIN
  IF NOT public._planned_lots_can_view() THEN
    RAISE EXCEPTION 'Không có quyền truy cập.' USING ERRCODE = '42501';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE pl.parent_master_asset_id IS NULL AND pl.resulting_asset_id IS NULL),
    COUNT(*) FILTER (WHERE pl.parent_master_asset_id IS NOT NULL AND pl.resulting_asset_id IS NULL),
    COUNT(*) FILTER (WHERE pl.resulting_asset_id IS NOT NULL),
    COUNT(*)
  INTO v_stage_unregistered, v_stage_in_master, v_stage_issued, v_total
  FROM public.planned_land_lots pl
  LEFT JOIN public.assets pa ON pl.parent_master_asset_id = pa.id
  LEFT JOIN public.assets ca ON pl.resulting_asset_id = ca.id
  WHERE (
    p_project_id IS NULL 
    OR pl.project_id = p_project_id 
    OR pa.project_id = p_project_id 
    OR ca.project_id = p_project_id
  );

  RETURN jsonb_build_object(
    'unregistered_count', v_stage_unregistered,
    'in_master_count', v_stage_in_master,
    'issued_count', v_stage_issued,
    'total_count', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_planned_lots_stage_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_planned_lots_stage_counts(uuid) TO authenticated, service_role;

COMMIT;
