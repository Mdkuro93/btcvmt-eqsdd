-- =====================================================================================
-- 0055 — import_planned_land_lots_v2: cho phép Import Excel KHÔNG cần Sổ lớn gốc
-- =====================================================================================
-- LÝ DO: RPC import_planned_land_lots (0048) bắt buộc p_parent_asset_id NOT NULL —
-- không dùng được cho trường hợp chính của tính năng "lô quy hoạch": khai báo trước
-- lô đất theo quy hoạch khi DỰ ÁN CHƯA CÓ BẤT KỲ GCN NÀO (migration 0050/0051 đã cho
-- phép parent_master_asset_id NULL ở cấp dữ liệu, nhưng RPC import chưa được cập nhật
-- theo).
--
-- FILE NÀY CHỈ THÊM HÀM MỚI (import_planned_land_lots_v2), KHÔNG SỬA/XÓA HÀM CŨ — an
-- toàn, không ảnh hưởng nơi nào đang gọi hàm cũ.
--
-- Quy tắc: truyền ĐÚNG 1 trong 2 — p_parent_asset_id (nhập vào 1 sổ lớn cụ thể) HOẶC
-- p_project_id (nhập lô độc lập, chưa gắn sổ lớn, thuộc thẳng dự án).
-- =====================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.import_planned_land_lots_v2(
  p_project_id uuid DEFAULT NULL,
  p_parent_asset_id uuid DEFAULT NULL,
  p_rows jsonb DEFAULT '[]'::jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_parent     record;
  v_project_id uuid;
  v_row        jsonb;
  v_idx        integer := 0;
  v_code       text;
  v_area_txt   text;
  v_area       numeric;
  v_seen       text[] := ARRAY[]::text[];
  v_errors     jsonb  := '[]'::jsonb;
  v_warnings   jsonb  := '[]'::jsonb;
  v_valid      jsonb  := '[]'::jsonb;
  v_new_area   numeric := 0;
  v_old_area   numeric := 0;
  v_inserted   integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = '28000';
  END IF;
  IF NOT public._planned_lots_can_manage() THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý lô quy hoạch.' USING ERRCODE = '42501';
  END IF;

  IF p_parent_asset_id IS NOT NULL AND p_project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Chỉ truyền 1 trong 2: Sổ lớn gốc hoặc Dự án, không truyền cả hai.' USING ERRCODE = '22023';
  END IF;
  IF p_parent_asset_id IS NULL AND p_project_id IS NULL THEN
    RAISE EXCEPTION 'Cần chọn Sổ lớn gốc hoặc Dự án để nhập lô quy hoạch.' USING ERRCODE = '22023';
  END IF;

  IF p_parent_asset_id IS NOT NULL THEN
    SELECT id, project_id, area, certificate_no INTO v_parent
    FROM public.assets WHERE id = p_parent_asset_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
    END IF;
    IF v_parent.project_id IS NULL THEN
      RAISE EXCEPTION 'Sổ lớn gốc chưa được gắn Dự án.' USING ERRCODE = '22023';
    END IF;
    v_project_id := v_parent.project_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
      RAISE EXCEPTION 'Dự án không tồn tại.' USING ERRCODE = 'P0002';
    END IF;
    v_project_id := p_project_id;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Không có dòng dữ liệu nào để nhập.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Mỗi lần chỉ nhập tối đa 1000 dòng.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_idx := v_idx + 1;
    v_code := btrim(COALESCE(v_row->>'legal_lot_code', ''));

    IF v_code = '' THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'legal_lot_code', 'message', 'Thiếu Mã Lô Pháp Lý.');
      CONTINUE;
    END IF;
    IF lower(v_code) = ANY (v_seen) THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'legal_lot_code',
                    'message', format('Mã lô "%s" bị trùng trong file.', v_code));
      CONTINUE;
    END IF;
    v_seen := v_seen || lower(v_code);

    -- Kiểm tra trùng mã lô: theo đúng phạm vi (sổ lớn cụ thể, hoặc lô độc lập trong dự án)
    IF p_parent_asset_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.planned_land_lots l
                 WHERE l.parent_master_asset_id = p_parent_asset_id AND lower(btrim(l.legal_lot_code)) = lower(v_code)) THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'legal_lot_code',
                      'message', format('Mã lô "%s" đã tồn tại trong sổ lớn này.', v_code));
        CONTINUE;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.planned_land_lots l
                 WHERE l.parent_master_asset_id IS NULL AND l.project_id = v_project_id
                   AND lower(btrim(l.legal_lot_code)) = lower(v_code)) THEN
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'legal_lot_code',
                      'message', format('Mã lô "%s" đã tồn tại trong danh sách lô độc lập của dự án này.', v_code));
        CONTINUE;
      END IF;
    END IF;

    v_area_txt := btrim(COALESCE(v_row->>'planned_area', ''));
    v_area := NULL;
    IF v_area_txt <> '' THEN
      BEGIN
        v_area := replace(v_area_txt, ',', '.')::numeric;
      EXCEPTION WHEN others THEN
        v_area := NULL;
      END;
    END IF;
    IF v_area IS NULL OR v_area <= 0 THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'planned_area',
                    'message', 'Diện tích dự kiến phải là số lớn hơn 0.');
      CONTINUE;
    END IF;

    v_new_area := v_new_area + v_area;
    v_valid := v_valid || jsonb_build_object(
      'legal_lot_code', v_code,
      -- Số thửa/tờ bản đồ: khi nhập vào 1 sổ lớn (chưa tách), 2 cột này CỐ TÌNH bỏ qua dữ liệu
      -- Excel nếu có (không có ý nghĩa cho tới khi lô thực sự được tách sổ riêng) — giao diện
      -- sẽ hiển thị tạm theo thông tin của sổ lớn. Chỉ lô độc lập (không sổ lớn) mới lưu thật.
      'land_lot_no', CASE WHEN p_parent_asset_id IS NULL THEN v_row->>'land_lot_no' ELSE NULL END,
      'map_sheet_no', CASE WHEN p_parent_asset_id IS NULL THEN v_row->>'map_sheet_no' ELSE NULL END,
      'planned_area', v_area,
      'business_project_name', v_row->>'business_project_name',
      'business_plot_code', v_row->>'business_plot_code',
      'notes', v_row->>'notes'
    );
  END LOOP;

  IF p_parent_asset_id IS NOT NULL THEN
    SELECT COALESCE(sum(planned_area), 0) INTO v_old_area
    FROM public.planned_land_lots WHERE parent_master_asset_id = p_parent_asset_id;
    IF v_parent.area IS NOT NULL AND (v_old_area + v_new_area) > v_parent.area THEN
      v_warnings := v_warnings || jsonb_build_object('message',
        format('Tổng diện tích các lô (%s m²) lớn hơn diện tích sổ lớn (%s m²). Hãy kiểm tra lại số liệu.',
               (v_old_area + v_new_area), v_parent.area));
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('success', false, 'inserted', 0, 'errors', v_errors, 'warnings', v_warnings);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object('success', true, 'inserted', 0,
                              'would_insert', jsonb_array_length(v_valid),
                              'errors', v_errors, 'warnings', v_warnings);
  END IF;

  INSERT INTO public.planned_land_lots (
    project_id, parent_master_asset_id, legal_lot_code, land_lot_no, map_sheet_no,
    planned_area, business_project_name, business_plot_code, notes
  )
  SELECT v_project_id, p_parent_asset_id,
         e->>'legal_lot_code', e->>'land_lot_no', e->>'map_sheet_no',
         (e->>'planned_area')::numeric, e->>'business_project_name', e->>'business_plot_code', e->>'notes'
  FROM jsonb_array_elements(v_valid) AS e;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'errors', v_errors, 'warnings', v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION public.import_planned_land_lots_v2(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_planned_land_lots_v2(uuid, uuid, jsonb, boolean) TO authenticated, service_role;

COMMIT;

-- ROLLBACK (nếu cần):
--   drop function if exists public.import_planned_land_lots_v2(uuid, uuid, jsonb, boolean);