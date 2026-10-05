-- 0080_allow_confirmed_duplicate_certificate.sql
-- Quyết định nghiệp vụ: cơ quan nhà nước đôi khi cấp trùng số GCN (kể cả trong cùng dự án). Thay vì CHẶN CỨNG bằng UNIQUE,
-- hệ thống CẢNH BÁO + BẮT XÁC NHẬN KÈM LÝ DO + GHI LẠI người/thời điểm xác nhận.
--  1. Gỡ ràng buộc UNIQUE assets_certificate_no_key (giữ 2 chỉ mục thường để tìm nhanh).
--  2. Thêm cột truy vết: duplicate_rule, duplicate_ack_reason, duplicate_ack_by, duplicate_ack_at.
--  3. Trigger assets_certificate_duplicate_guard: MỌI đường ghi (trình duyệt, RPC, SQL) khi tạo mới hoặc đổi số GCN/dự án
--     mà trùng một GCN khác (bất kể dự án, kể cả GCN đã vô hiệu) thì BẮT BUỘC có duplicate_ack_reason (>= 10 ký tự),
--     nếu không báo lỗi "DUPLICATE_UNCONFIRMED:". Người/thời điểm xác nhận do MÁY CHỦ ghi (không tin dữ liệu client gửi).
--     Cập nhật các trường khác (trạng thái giữ, ghi chú...) của GCN đang trùng KHÔNG bị ảnh hưởng.
--  4. check_asset_duplicate trả thêm requires_confirmation (+ same_project, is_invalidated cho admin/btc).
--  Lưu ý: chỉ ép xác nhận phía máy chủ với SỐ GCN. Trùng mã lô pháp lý / tờ bản đồ + thửa đất vẫn là cảnh báo ở giao diện
--  (sổ con khi tách sổ hợp lệ có thể chung mã lô với sổ gốc nên không ép ở trigger).
--  Hạn chế đã biết: duyệt hồ sơ khai báo (approve_asset_declaration_request) tạo GCN trùng số sẽ bị chặn bởi trigger cho tới khi
--  có đường truyền lý do xác nhận (migration sau, cần định nghĩa hàm đang chạy). Hiện trạng không đổi so với UNIQUE cũ.
BEGIN;

-- ===== 1. Gỡ UNIQUE =====
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'assets' AND c.conname = 'assets_certificate_no_key'
  ) THEN
    ALTER TABLE public.assets DROP CONSTRAINT assets_certificate_no_key;
  ELSE
    DROP INDEX IF EXISTS public.assets_certificate_no_key;
  END IF;
END $$;

-- ===== 2. Cột truy vết =====
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS duplicate_rule text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS duplicate_ack_reason text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS duplicate_ack_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS duplicate_ack_at timestamptz;

-- ===== 3a. Hàm nội bộ tìm GCN trùng số (không cấp quyền gọi trực tiếp) =====
CREATE OR REPLACE FUNCTION public._find_certificate_duplicate(
  p_certificate_no text,
  p_project_id uuid,
  p_exclude_asset_id uuid
)
RETURNS TABLE(asset_id uuid, certificate_no text, project_name text, lifecycle_status text, same_project boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT a.id, a.certificate_no, pr.name, a.lifecycle_status,
         (p_project_id IS NOT NULL AND a.project_id = p_project_id) AS same_project
  FROM public.assets a
  LEFT JOIN public.projects pr ON pr.id = a.project_id
  WHERE lower(btrim(a.certificate_no)) = lower(btrim(COALESCE(p_certificate_no, '')))
    AND btrim(COALESCE(p_certificate_no, '')) <> ''
    AND a.id <> COALESCE(p_exclude_asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY (p_project_id IS NOT NULL AND a.project_id = p_project_id) DESC,
           (a.lifecycle_status IS DISTINCT FROM 'invalidated') DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public._find_certificate_duplicate(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ===== 3b. Trigger bắt buộc xác nhận =====
CREATE OR REPLACE FUNCTION public.assets_certificate_duplicate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_reason   text := NULLIF(btrim(COALESCE(NEW.duplicate_ack_reason, '')), '');
  v_has_ack  boolean := false;
  v_key_changed boolean := false;
  v_hit      record;
BEGIN
  v_has_ack := v_reason IS NOT NULL AND char_length(v_reason) >= 10;

  -- Ghi nhận xác nhận: người/thời điểm do máy chủ quyết định
  IF TG_OP = 'INSERT' THEN
    IF v_has_ack THEN
      NEW.duplicate_ack_reason := v_reason;
      NEW.duplicate_ack_by := COALESCE(auth.uid(), NEW.duplicate_ack_by);
      NEW.duplicate_ack_at := now();
    ELSE
      NEW.duplicate_ack_reason := NULL;
      NEW.duplicate_ack_by := NULL;
      NEW.duplicate_ack_at := NULL;
    END IF;
    v_key_changed := true;
  ELSE
    IF NEW.duplicate_ack_reason IS DISTINCT FROM OLD.duplicate_ack_reason THEN
      IF v_has_ack THEN
        NEW.duplicate_ack_reason := v_reason;
        NEW.duplicate_ack_by := COALESCE(auth.uid(), NEW.duplicate_ack_by);
        NEW.duplicate_ack_at := now();
      ELSE
        NEW.duplicate_ack_reason := NULL;
        NEW.duplicate_ack_by := NULL;
        NEW.duplicate_ack_at := NULL;
      END IF;
    ELSE
      NEW.duplicate_ack_by := OLD.duplicate_ack_by;
      NEW.duplicate_ack_at := OLD.duplicate_ack_at;
    END IF;
    v_key_changed := lower(btrim(COALESCE(NEW.certificate_no, ''))) IS DISTINCT FROM lower(btrim(COALESCE(OLD.certificate_no, '')))
                     OR NEW.project_id IS DISTINCT FROM OLD.project_id;
  END IF;

  IF NOT v_key_changed THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_hit FROM public._find_certificate_duplicate(NEW.certificate_no, NEW.project_id, NEW.id);
  IF FOUND THEN
    IF NOT v_has_ack THEN
      RAISE EXCEPTION 'DUPLICATE_UNCONFIRMED: Số GCN đã tồn tại trong hệ thống. Cần xác nhận đây là trường hợp trùng thật (do cơ quan cấp) kèm lý do tối thiểu 10 ký tự.'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.duplicate_rule := 'certificate_no';
  ELSE
    NEW.duplicate_rule := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assets_certificate_duplicate_guard ON public.assets;
CREATE TRIGGER trg_assets_certificate_duplicate_guard
BEFORE INSERT OR UPDATE OF certificate_no, project_id, duplicate_ack_reason, duplicate_ack_by, duplicate_ack_at ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.assets_certificate_duplicate_guard();

-- ===== 4. check_asset_duplicate: cảnh báo + yêu cầu xác nhận =====
CREATE OR REPLACE FUNCTION public.check_asset_duplicate(
  p_certificate_no text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_legal_lot_code text DEFAULT NULL,
  p_map_sheet_no text DEFAULT NULL,
  p_land_lot_no text DEFAULT NULL,
  p_exclude_asset_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_priv     boolean;
  v_lot      text := lower(btrim(COALESCE(p_legal_lot_code, '')));
  v_map      text := lower(btrim(COALESCE(p_map_sheet_no, '')));
  v_land     text := lower(btrim(COALESCE(p_land_lot_no, '')));
  v_exclude  uuid := COALESCE(p_exclude_asset_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_hit      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Hồ sơ người dùng không hợp lệ hoặc chưa được kích hoạt.' USING ERRCODE = '42501';
  END IF;
  v_priv := v_role IN ('super_admin', 'admin', 'btc_manager');

  -- Quy tắc 1: trùng số GCN (mọi dự án, kể cả GCN đã vô hiệu): cho phép nếu được xác nhận kèm lý do
  SELECT * INTO v_hit FROM public._find_certificate_duplicate(p_certificate_no, p_project_id, p_exclude_asset_id);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'is_duplicate', true,
      'requires_confirmation', true,
      'rule', 'certificate_no',
      'same_project', CASE WHEN v_priv THEN v_hit.same_project ELSE NULL END,
      'is_invalidated', CASE WHEN v_priv THEN (v_hit.lifecycle_status = 'invalidated') ELSE NULL END,
      'reason', CASE WHEN v_priv
        THEN 'Trùng số GCN: Số GCN "' || btrim(p_certificate_no) || '" đã tồn tại'
             || CASE WHEN v_hit.lifecycle_status = 'invalidated' THEN ' (GCN đã vô hiệu)' ELSE '' END
             || ' trong ' || COALESCE(v_hit.project_name, 'hệ thống')
             || CASE WHEN v_hit.same_project THEN ' (cùng dự án)' ELSE ' (khác dự án)' END
             || '. Nếu đây là trường hợp trùng thật do cơ quan cấp, vui lòng xác nhận kèm lý do.'
        ELSE 'Trùng số GCN: Số GCN này đã tồn tại trong hệ thống. Cần xác nhận kèm lý do để tiếp tục.' END
    );
  END IF;

  -- Quy tắc 2: trùng mã lô pháp lý trong cùng dự án
  IF p_project_id IS NOT NULL AND v_lot <> '' THEN
    SELECT a.id, a.certificate_no INTO v_hit
    FROM public.assets a
    WHERE a.id <> v_exclude
      AND a.lifecycle_status IS DISTINCT FROM 'invalidated'
      AND a.project_id = p_project_id
      AND lower(btrim(COALESCE(a.legal_lot_code, ''))) = v_lot
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'requires_confirmation', true,
        'rule', 'legal_lot_code',
        'reason', CASE WHEN v_priv
          THEN 'Trùng Mã Lô Pháp Lý: "' || btrim(p_legal_lot_code) || '" đã được khai báo cho GCN ' || v_hit.certificate_no || ' trong dự án này!'
          ELSE 'Trùng Mã Lô Pháp Lý: mã này đã được khai báo trong dự án.' END
      );
    END IF;
  END IF;

  -- Quy tắc 3: trùng tờ bản đồ + thửa đất trong cùng dự án
  IF p_project_id IS NOT NULL AND v_map <> '' AND v_land <> '' THEN
    SELECT a.id, a.certificate_no INTO v_hit
    FROM public.assets a
    WHERE a.id <> v_exclude
      AND a.lifecycle_status IS DISTINCT FROM 'invalidated'
      AND a.project_id = p_project_id
      AND lower(btrim(COALESCE(a.map_sheet_no, ''))) = v_map
      AND lower(btrim(COALESCE(a.land_lot_no, ''))) = v_land
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_duplicate', true,
        'requires_confirmation', true,
        'rule', 'map_land_lot',
        'reason', CASE WHEN v_priv
          THEN 'Trùng Thửa đất & Tờ bản đồ: Thửa đất số "' || btrim(p_land_lot_no) || '" - Tờ bản đồ số "' || btrim(p_map_sheet_no) || '" đã tồn tại trên hệ thống cho GCN ' || v_hit.certificate_no || '!'
          ELSE 'Trùng Thửa đất & Tờ bản đồ: đã tồn tại trong dự án.' END
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('is_duplicate', false, 'requires_confirmation', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, uuid, text, text, text, uuid) TO authenticated;

COMMIT;

-- ROLLBACK:
--   DROP TRIGGER trg_assets_certificate_duplicate_guard ON public.assets;
--   (chỉ khôi phục UNIQUE nếu KHÔNG còn GCN trùng số:) ALTER TABLE public.assets ADD CONSTRAINT assets_certificate_no_key UNIQUE (certificate_no);
--   check_asset_duplicate: chạy lại nội dung hàm trong 0079_certificate_unique_aware_check_and_code_resync.sql.