-- =====================================================================================
-- 0050 — Cập nhật Lô quy hoạch (3 trạng thái) & Báo cáo theo dõi Dự án
-- =====================================================================================
-- MỤC ĐÍCH (theo AGENTS #12):
--   1. Cho phép parent_master_asset_id trong planned_land_lots là NULL (Giai đoạn 1: Chưa có sổ lớn Q/R).
--   2. Bổ sung cột asset_code cho planned_land_lots làm ID Hệ Thống.
--   3. Cập nhật Unique Index:
--      - (parent_master_asset_id, legal_lot_code) khi parent_master_asset_id IS NOT NULL.
--      - (project_id, legal_lot_code) khi parent_master_asset_id IS NULL.
--   4. Cập nhật Trigger _planned_lots_before_write:
--      - Cho phép tạo lô trực tiếp theo project_id khi chưa có sổ lớn.
--      - Cho phép gán parent_master_asset_id khi sổ lớn được tạo sau (1 -> 2).
--   5. Cập nhật Trigger _planned_lots_link_asset:
--      - Tự động liên kết khi cấp thẳng Sổ nhỏ (khớp project_id + legal_lot_code).
--      - Tự động liên kết khi tách từ Sổ lớn (khớp parent_asset_id + legal_lot_code).
--   6. Bổ sung cột project_report_data JSONB trong report_snapshots để lưu snapshot đồng thời.
--   7. RPC assign_planned_lots_to_master_asset(): gán lô chưa có sổ lớn vào sổ lớn.
--   8. RPC get_planned_lots_stage_counts(): trả về số lượng 3 trạng thái lô cho Dashboard & Báo cáo.
-- =====================================================================================

BEGIN;

-- 1. Cho phép parent_master_asset_id NULL
ALTER TABLE public.planned_land_lots ALTER COLUMN parent_master_asset_id DROP NOT NULL;

-- 2. Thêm cột asset_code nếu chưa có
ALTER TABLE public.planned_land_lots ADD COLUMN IF NOT EXISTS asset_code text;

-- 3. Cập nhật Unique Index
DROP INDEX IF EXISTS public.uq_planned_lots_parent_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_planned_lots_parent_code
  ON public.planned_land_lots (parent_master_asset_id, lower(btrim(legal_lot_code)))
  WHERE parent_master_asset_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planned_lots_project_code
  ON public.planned_land_lots (project_id, lower(btrim(legal_lot_code)))
  WHERE parent_master_asset_id IS NULL;

-- 4. Cập nhật Trigger _planned_lots_before_write
CREATE OR REPLACE FUNCTION public._planned_lots_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_system  boolean := COALESCE(current_setting('app.planned_lot_system', true), '') = '1';
  v_project uuid;
  v_found   boolean;
BEGIN
  NEW.legal_lot_code        := btrim(COALESCE(NEW.legal_lot_code, ''));
  NEW.land_lot_no           := NULLIF(btrim(COALESCE(NEW.land_lot_no, '')), '');
  NEW.map_sheet_no          := NULLIF(btrim(COALESCE(NEW.map_sheet_no, '')), '');
  NEW.business_project_name := NULLIF(btrim(COALESCE(NEW.business_project_name, '')), '');
  NEW.business_plot_code    := NULLIF(btrim(COALESCE(NEW.business_plot_code, '')), '');
  NEW.notes                 := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  IF NEW.legal_lot_code = '' THEN
    RAISE EXCEPTION 'Mã lô pháp lý không được để trống.' USING ERRCODE = '22023';
  END IF;

  IF NEW.asset_code IS NULL OR btrim(NEW.asset_code) = '' THEN
    NEW.asset_code := 'PLO-' || upper(replace(NEW.legal_lot_code, ' ', '-'));
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_system THEN
      NEW.status := 'chưa cấp GCN';
      NEW.resulting_asset_id := NULL;
    END IF;

    IF NEW.parent_master_asset_id IS NOT NULL THEN
      SELECT true, a.project_id INTO v_found, v_project
      FROM public.assets a WHERE a.id = NEW.parent_master_asset_id;
      IF v_found IS NOT TRUE THEN
        RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
      END IF;
      IF v_project IS NULL THEN
        RAISE EXCEPTION 'Sổ lớn gốc chưa được gắn Dự án, không thể thêm lô quy hoạch.' USING ERRCODE = '22023';
      END IF;
      NEW.project_id := v_project;
    ELSE
      IF NEW.project_id IS NULL THEN
        RAISE EXCEPTION 'Lô quy hoạch chưa có sổ lớn bắt buộc phải gắn Dự án (project_id).' USING ERRCODE = '22023';
      END IF;
    END IF;

    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.parent_master_asset_id IS NOT NULL AND NEW.parent_master_asset_id IS NOT NULL 
     AND NEW.parent_master_asset_id <> OLD.parent_master_asset_id THEN
    RAISE EXCEPTION 'Không được đổi sổ lớn gốc của lô. Hãy xóa và tạo lại lô.' USING ERRCODE = '22023';
  END IF;

  IF OLD.parent_master_asset_id IS NULL AND NEW.parent_master_asset_id IS NOT NULL THEN
    SELECT true, a.project_id INTO v_found, v_project
    FROM public.assets a WHERE a.id = NEW.parent_master_asset_id;
    IF v_found IS NOT TRUE THEN
      RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
    END IF;
    IF v_project IS NOT NULL AND v_project <> OLD.project_id THEN
      RAISE EXCEPTION 'Sổ lớn gốc thuộc dự án khác với dự án của lô quy hoạch.' USING ERRCODE = '22023';
    END IF;
    NEW.project_id := COALESCE(v_project, OLD.project_id);
  ELSE
    NEW.project_id := OLD.project_id;
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF NOT v_system THEN
    IF NEW.status <> OLD.status OR NEW.resulting_asset_id IS DISTINCT FROM OLD.resulting_asset_id THEN
      RAISE EXCEPTION 'Trạng thái lô do hệ thống cập nhật khi GCN riêng được tạo/xóa, không sửa tay.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'đã cấp GCN' AND (
         NEW.legal_lot_code <> OLD.legal_lot_code
         OR NEW.planned_area <> OLD.planned_area
         OR NEW.land_lot_no IS DISTINCT FROM OLD.land_lot_no
         OR NEW.map_sheet_no IS DISTINCT FROM OLD.map_sheet_no) THEN
      RAISE EXCEPTION 'Lô đã cấp GCN: chỉ được sửa tên/mã kinh doanh và ghi chú.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Cập nhật Trigger _planned_lots_link_asset
CREATE OR REPLACE FUNCTION public._planned_lots_link_asset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.legal_lot_code IS NULL OR btrim(NEW.legal_lot_code) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.parent_asset_id IS NOT DISTINCT FROM OLD.parent_asset_id
     AND NEW.project_id      IS NOT DISTINCT FROM OLD.project_id
     AND NEW.legal_lot_code  IS NOT DISTINCT FROM OLD.legal_lot_code THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.planned_lot_system', '1', true);

  -- TH 1: Sổ con tách từ Sổ lớn (có parent_asset_id)
  IF NEW.parent_asset_id IS NOT NULL THEN
    UPDATE public.planned_land_lots l
    SET status = 'đã cấp GCN', resulting_asset_id = NEW.id
    WHERE l.parent_master_asset_id = NEW.parent_asset_id
      AND lower(btrim(l.legal_lot_code)) = lower(btrim(NEW.legal_lot_code))
      AND l.status = 'chưa cấp GCN';
  END IF;

  -- TH 2: Cấp thẳng sổ nhỏ (khớp project_id + lot_code)
  IF NEW.project_id IS NOT NULL THEN
    UPDATE public.planned_land_lots l
    SET status = 'đã cấp GCN', resulting_asset_id = NEW.id
    WHERE l.project_id = NEW.project_id
      AND lower(btrim(l.legal_lot_code)) = lower(btrim(NEW.legal_lot_code))
      AND l.status = 'chưa cấp GCN';
  END IF;

  PERFORM set_config('app.planned_lot_system', '0', true);
  RETURN NEW;
END;
$$;

-- 6. Bổ sung cột project_report_data vào report_snapshots nếu chưa có
ALTER TABLE public.report_snapshots ADD COLUMN IF NOT EXISTS project_report_data JSONB DEFAULT '[]'::jsonb;

-- 7. RPC gán lô vào sổ lớn (1 -> 2)
CREATE OR REPLACE FUNCTION public.assign_planned_lots_to_master_asset(
  p_parent_asset_id uuid,
  p_lot_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_master record;
  v_count integer := 0;
BEGIN
  IF NOT public._planned_lots_can_manage() THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý lô quy hoạch.' USING ERRCODE = '42501';
  END IF;

  SELECT id, project_id, certificate_no INTO v_master
  FROM public.assets WHERE id = p_parent_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.planned_land_lots
  SET parent_master_asset_id = v_master.id,
      project_id = COALESCE(v_master.project_id, project_id),
      updated_at = now()
  WHERE id = ANY(p_lot_ids)
    AND parent_master_asset_id IS NULL
    AND (project_id IS NULL OR project_id = v_master.project_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'assigned_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_planned_lots_to_master_asset(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_planned_lots_to_master_asset(uuid, uuid[]) TO authenticated, service_role;

-- 8. RPC đếm chỉ số 3 trạng thái lô
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
    COUNT(*) FILTER (WHERE parent_master_asset_id IS NULL AND resulting_asset_id IS NULL),
    COUNT(*) FILTER (WHERE parent_master_asset_id IS NOT NULL AND resulting_asset_id IS NULL),
    COUNT(*) FILTER (WHERE resulting_asset_id IS NOT NULL),
    COUNT(*)
  INTO v_stage_unregistered, v_stage_in_master, v_stage_issued, v_total
  FROM public.planned_land_lots
  WHERE (p_project_id IS NULL OR project_id = p_project_id);

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
