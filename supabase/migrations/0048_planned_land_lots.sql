-- =====================================================================================
-- 0048 — Lô đất theo quy hoạch pháp lý (planned_land_lots)
-- =====================================================================================
-- LỊCH SỬ SỐ MIGRATION: file này ĐÃ ĐƯỢC CHẠY trên DB thật khi còn mang số 0047. Sau đó repo có thêm
-- 0047_notifications_and_auto_cleanup.sql (do AI Studio tạo) nên đổi thành 0048 cho khỏi trùng số.
-- Nội dung KHÔNG đổi (chỉ đổi số trong chú thích/thông báo lỗi). Không cần chạy lại trên DB thật.
-- (Nếu lỡ chạy lại vẫn an toàn: dùng IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.)
--
-- BỐI CẢNH
--   1 sổ lớn (GCN gốc) đang gộp nhiều lô (VD 10 lô); thực tế mới có 1-vài lô được cấp GCN riêng.
--   Các lô còn lại (chưa cấp sổ) cần được theo dõi nhưng KHÔNG đưa vào bảng assets để không làm sai số liệu tồn kho.
--
-- THAY ĐỔI (theo AGENTS #12):
--   1. Bảng mới public.planned_land_lots (+ chỉ mục, ràng buộc, RLS).
--   2. Hàm phân quyền _planned_lots_can_view() / _planned_lots_can_manage() (SECURITY DEFINER).
--   3. Trigger BEFORE INSERT/UPDATE trên planned_land_lots: chuẩn hóa dữ liệu, tự lấy project_id từ sổ lớn,
--      khóa trường trạng thái (chỉ hệ thống được đổi).
--   4. Trigger AFTER INSERT/UPDATE trên assets: khi có sổ con (parent_asset_id = sổ lớn) mang đúng legal_lot_code
--      -> lô tự chuyển 'đã cấp GCN' và gắn resulting_asset_id. Trigger BEFORE DELETE trên assets: xóa sổ con -> lô về
--      'chưa cấp GCN'. => KHÔNG phải sửa RPC duyệt Tách sổ.
--   5. RPC import_planned_land_lots(): nhập hàng loạt (từ Excel) nguyên tử, có chế độ kiểm tra trước (dry-run).
--
-- QUYỀN
--   * Xem  : super_admin, admin, btc_manager, warehouse_manager, capital_dept, project_dept, re_dept, supervisor
--   * Quản lý (thêm/sửa/xóa/import): super_admin, admin, btc_manager, project_dept
--   * Không cấp cho anon. Lô đã cấp GCN không xóa được (giữ lịch sử).
--
-- Chạy TOÀN BỘ file một lần trên Supabase SQL Editor. Lỗi giữa chừng sẽ hoàn tác cả giao dịch.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 0. KIỂM TRA TRƯỚC
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text := '';
  r record;
BEGIN
  FOR r IN
    SELECT t.tbl, t.col
    FROM (VALUES
      ('assets','id'), ('assets','project_id'), ('assets','area'), ('assets','legal_lot_code'), ('assets','parent_asset_id'),
      ('projects','id'), ('profiles','id'), ('profiles','role'), ('profiles','status')
    ) AS t(tbl, col)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.tbl AND c.column_name = t.col
    )
  LOOP
    v_missing := v_missing || format(' %s.%s', r.tbl, r.col);
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Migration 0048 dừng (chưa sửa gì): DB thiếu cột:%', v_missing;
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1. BẢNG
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planned_land_lots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  parent_master_asset_id uuid NOT NULL REFERENCES public.assets(id)   ON DELETE RESTRICT,
  legal_lot_code         text NOT NULL,
  land_lot_no            text,
  map_sheet_no           text,
  business_project_name  text,
  business_plot_code     text,
  planned_area           numeric(14,2) NOT NULL CHECK (planned_area > 0),
  status                 text NOT NULL DEFAULT 'chưa cấp GCN'
                         CHECK (status IN ('chưa cấp GCN', 'đã cấp GCN')),
  resulting_asset_id     uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  notes                  text,
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.planned_land_lots IS
  'Lô đất theo quy hoạch pháp lý còn nằm trong sổ lớn, chưa được cấp GCN riêng. KHÔNG phải tài sản tồn kho (không nằm trong assets).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_planned_lots_parent_code
  ON public.planned_land_lots (parent_master_asset_id, lower(btrim(legal_lot_code)));
CREATE INDEX IF NOT EXISTS idx_planned_lots_project ON public.planned_land_lots (project_id);
CREATE INDEX IF NOT EXISTS idx_planned_lots_status  ON public.planned_land_lots (status);
CREATE INDEX IF NOT EXISTS idx_planned_lots_result  ON public.planned_land_lots (resulting_asset_id);

-- -------------------------------------------------------------------------------------
-- 2. HÀM PHÂN QUYỀN
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._planned_lots_can_view()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active'
      AND p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager',
                     'capital_dept', 'project_dept', 're_dept', 'supervisor')
  );
$$;

CREATE OR REPLACE FUNCTION public._planned_lots_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active'
      AND p.role IN ('super_admin', 'admin', 'btc_manager', 'project_dept')
  );
$$;

REVOKE ALL ON FUNCTION public._planned_lots_can_view()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._planned_lots_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._planned_lots_can_view()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._planned_lots_can_manage() TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------------------------------
ALTER TABLE public.planned_land_lots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planned_land_lots FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_land_lots TO authenticated;

DROP POLICY IF EXISTS "planned_lots_select" ON public.planned_land_lots;
CREATE POLICY "planned_lots_select" ON public.planned_land_lots
  FOR SELECT TO authenticated USING (public._planned_lots_can_view());

DROP POLICY IF EXISTS "planned_lots_insert" ON public.planned_land_lots;
CREATE POLICY "planned_lots_insert" ON public.planned_land_lots
  FOR INSERT TO authenticated WITH CHECK (public._planned_lots_can_manage());

DROP POLICY IF EXISTS "planned_lots_update" ON public.planned_land_lots;
CREATE POLICY "planned_lots_update" ON public.planned_land_lots
  FOR UPDATE TO authenticated
  USING (public._planned_lots_can_manage()) WITH CHECK (public._planned_lots_can_manage());

-- Chỉ xóa được lô CHƯA cấp GCN (lô đã cấp giữ lại làm lịch sử)
DROP POLICY IF EXISTS "planned_lots_delete" ON public.planned_land_lots;
CREATE POLICY "planned_lots_delete" ON public.planned_land_lots
  FOR DELETE TO authenticated
  USING (public._planned_lots_can_manage() AND status = 'chưa cấp GCN');

-- -------------------------------------------------------------------------------------
-- 4. TRIGGER: chuẩn hóa + khóa trường hệ thống
-- -------------------------------------------------------------------------------------
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

  IF TG_OP = 'INSERT' THEN
    IF NOT v_system THEN
      NEW.status := 'chưa cấp GCN';
      NEW.resulting_asset_id := NULL;
    END IF;

    SELECT true, a.project_id INTO v_found, v_project
    FROM public.assets a WHERE a.id = NEW.parent_master_asset_id;
    IF v_found IS NOT TRUE THEN
      RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
    END IF;
    IF v_project IS NULL THEN
      RAISE EXCEPTION 'Sổ lớn gốc chưa được gắn Dự án, không thể thêm lô quy hoạch.' USING ERRCODE = '22023';
    END IF;

    NEW.project_id := v_project;
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.parent_master_asset_id <> OLD.parent_master_asset_id THEN
    RAISE EXCEPTION 'Không được đổi sổ lớn gốc của lô. Hãy xóa và tạo lại lô.' USING ERRCODE = '22023';
  END IF;
  NEW.project_id := OLD.project_id;
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

DROP TRIGGER IF EXISTS trg_planned_lots_before_write ON public.planned_land_lots;
CREATE TRIGGER trg_planned_lots_before_write
  BEFORE INSERT OR UPDATE ON public.planned_land_lots
  FOR EACH ROW EXECUTE FUNCTION public._planned_lots_before_write();

-- -------------------------------------------------------------------------------------
-- 5. TRIGGER TRÊN assets: tự liên kết / hoàn tác
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._planned_lots_link_asset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.parent_asset_id IS NULL OR NEW.legal_lot_code IS NULL OR btrim(NEW.legal_lot_code) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.parent_asset_id IS NOT DISTINCT FROM OLD.parent_asset_id
     AND NEW.legal_lot_code  IS NOT DISTINCT FROM OLD.legal_lot_code THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.planned_lot_system', '1', true);
  UPDATE public.planned_land_lots l
  SET status = 'đã cấp GCN', resulting_asset_id = NEW.id
  WHERE l.parent_master_asset_id = NEW.parent_asset_id
    AND lower(btrim(l.legal_lot_code)) = lower(btrim(NEW.legal_lot_code))
    AND l.status = 'chưa cấp GCN';
  PERFORM set_config('app.planned_lot_system', '0', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._planned_lots_unlink_asset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.planned_lot_system', '1', true);
  UPDATE public.planned_land_lots
  SET status = 'chưa cấp GCN', resulting_asset_id = NULL
  WHERE resulting_asset_id = OLD.id;
  PERFORM set_config('app.planned_lot_system', '0', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_planned_lots_link ON public.assets;
CREATE TRIGGER trg_planned_lots_link
  AFTER INSERT OR UPDATE OF parent_asset_id, legal_lot_code ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public._planned_lots_link_asset();

DROP TRIGGER IF EXISTS trg_planned_lots_unlink ON public.assets;
CREATE TRIGGER trg_planned_lots_unlink
  BEFORE DELETE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public._planned_lots_unlink_asset();

-- -------------------------------------------------------------------------------------
-- 6. RPC: import hàng loạt (nguyên tử, có dry-run)
-- -------------------------------------------------------------------------------------
-- p_rows: mảng JSON, mỗi phần tử: legal_lot_code*, land_lot_no, map_sheet_no, planned_area*,
--         business_project_name, business_plot_code, notes.
-- Trả về: { success, inserted, would_insert, errors:[{row,field,message}], warnings:[{message}] }
--   row = số thứ tự phần tử trong mảng (bắt đầu từ 1). Có lỗi ở BẤT KỲ dòng nào => KHÔNG nhập dòng nào.
CREATE OR REPLACE FUNCTION public.import_planned_land_lots(
  p_parent_asset_id uuid,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_parent    record;
  v_row       jsonb;
  v_idx       integer := 0;
  v_code      text;
  v_area_txt  text;
  v_area      numeric;
  v_seen      text[] := ARRAY[]::text[];
  v_errors    jsonb  := '[]'::jsonb;
  v_warnings  jsonb  := '[]'::jsonb;
  v_valid     jsonb  := '[]'::jsonb;
  v_new_area  numeric := 0;
  v_old_area  numeric := 0;
  v_inserted  integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = '28000';
  END IF;
  IF NOT public._planned_lots_can_manage() THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý lô quy hoạch.' USING ERRCODE = '42501';
  END IF;

  SELECT id, project_id, area, certificate_no INTO v_parent
  FROM public.assets WHERE id = p_parent_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sổ lớn gốc không tồn tại.' USING ERRCODE = 'P0002';
  END IF;
  IF v_parent.project_id IS NULL THEN
    RAISE EXCEPTION 'Sổ lớn gốc chưa được gắn Dự án.' USING ERRCODE = '22023';
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

    IF EXISTS (SELECT 1 FROM public.planned_land_lots l
               WHERE l.parent_master_asset_id = p_parent_asset_id AND lower(btrim(l.legal_lot_code)) = lower(v_code)) THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'field', 'legal_lot_code',
                    'message', format('Mã lô "%s" đã tồn tại trong sổ lớn này.', v_code));
      CONTINUE;
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
      'land_lot_no', v_row->>'land_lot_no',
      'map_sheet_no', v_row->>'map_sheet_no',
      'planned_area', v_area,
      'business_project_name', v_row->>'business_project_name',
      'business_plot_code', v_row->>'business_plot_code',
      'notes', v_row->>'notes'
    );
  END LOOP;

  -- Cảnh báo (không chặn): tổng diện tích lô dự kiến vượt diện tích sổ lớn
  SELECT COALESCE(sum(planned_area), 0) INTO v_old_area
  FROM public.planned_land_lots WHERE parent_master_asset_id = p_parent_asset_id;
  IF v_parent.area IS NOT NULL AND (v_old_area + v_new_area) > v_parent.area THEN
    v_warnings := v_warnings || jsonb_build_object('message',
      format('Tổng diện tích các lô (%s m²) lớn hơn diện tích sổ lớn (%s m²). Hãy kiểm tra lại số liệu.',
             (v_old_area + v_new_area), v_parent.area));
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
  SELECT v_parent.project_id, p_parent_asset_id,
         e->>'legal_lot_code', e->>'land_lot_no', e->>'map_sheet_no',
         (e->>'planned_area')::numeric, e->>'business_project_name', e->>'business_plot_code', e->>'notes'
  FROM jsonb_array_elements(v_valid) AS e;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'errors', v_errors, 'warnings', v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION public.import_planned_land_lots(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_planned_land_lots(uuid, jsonb, boolean) TO authenticated, service_role;

COMMIT;

-- =====================================================================================
-- ROLLBACK (chạy tay nếu cần quay lại; migration này chỉ THÊM đối tượng mới, không thay đối tượng cũ):
--   drop trigger if exists trg_planned_lots_link   on public.assets;
--   drop trigger if exists trg_planned_lots_unlink on public.assets;
--   drop function if exists public._planned_lots_link_asset();
--   drop function if exists public._planned_lots_unlink_asset();
--   drop function if exists public.import_planned_land_lots(uuid, jsonb, boolean);
--   drop table if exists public.planned_land_lots;          -- xóa cả dữ liệu lô đã nhập!
--   drop function if exists public._planned_lots_before_write();
--   drop function if exists public._planned_lots_can_view();
--   drop function if exists public._planned_lots_can_manage();
-- =====================================================================================
