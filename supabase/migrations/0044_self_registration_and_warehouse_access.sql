-- =====================================================================================
-- 0044 — Đăng ký tự phục vụ + xin / duyệt / gia hạn quyền xem kho
-- =====================================================================================
-- BỐI CẢNH
--   * Trang /register cũ tạo tài khoản nhưng không có bước duyệt thật; trang /dang-ky-truy-cap không thu mật khẩu
--     và RPC duyệt chèn hồ sơ không có id (profiles.id là FK tới auth.users) -> không dùng được cho người mới.
--   * Người dùng tra cứu đã có tài khoản chưa có cách xin thêm / gia hạn kho.
--
-- THAY ĐỔI (chỉ những thứ dưới đây — theo AGENTS #12):
--   0. Kiểm tra trước: DB có đủ cột cần dùng, nếu thiếu thì DỪNG (chưa sửa gì).
--   1. Bảng migration_backups: lưu bản THẬT của hàm / ràng buộc / policy sắp bị thay (AGENTS #16.3).
--   2. profiles.status: cho phép thêm 'pending' và 'rejected'.
--   3. Chỉ mục duy nhất cho lower(profiles.username) (khi username không NULL).
--   4. access_requests: thêm cột user_id (gắn theo tài khoản, không theo email) và reject_reason; backfill user_id.
--   5. access_requests RLS: gỡ policy INSERT mở (ẩn danh), thu hồi INSERT của anon; thêm policy chỉ-đọc cho chủ yêu cầu.
--   6. handle_new_user(): tài khoản TỰ ĐĂNG KÝ (metadata registration_source='self') -> hồ sơ viewer + pending
--      + tạo luôn các yêu cầu theo từng kho. Tài khoản do admin tạo (Edge Function) giữ nguyên hành vi cũ.
--   7. RPC mới: list_registration_warehouses(), request_warehouse_access(), reject_viewer_access_request().
--   8. RPC approve_viewer_access_request() viết lại (cùng chữ ký): bỏ chèn profiles không id, không tự mở khóa
--      tài khoản bị khóa, chặn Quản lý kho có managed_warehouse_ids NULL duyệt mọi kho, chỉ duyệt yêu cầu 'pending'.
--
-- KHÔNG làm trong file này: gỡ register_user / app_users (xem 0045, chạy SAU khi test xong).
-- Lưu ý vận hành: chạy TOÀN BỘ file một lần trên Supabase SQL Editor. Nếu có lỗi, cả giao dịch tự hoàn tác.
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
      ('profiles','id'), ('profiles','email'), ('profiles','username'), ('profiles','full_name'),
      ('profiles','role'), ('profiles','status'), ('profiles','permissions'), ('profiles','region_id'),
      ('profiles','phone'), ('profiles','organization'), ('profiles','purpose'), ('profiles','managed_warehouse_ids'),
      ('access_requests','full_name'), ('access_requests','email'), ('access_requests','phone'),
      ('access_requests','organization'), ('access_requests','purpose'), ('access_requests','warehouse_id'),
      ('access_requests','status'), ('access_requests','reviewed_by'), ('access_requests','reviewed_at'),
      ('viewer_warehouse_access','user_id'), ('viewer_warehouse_access','warehouse_id'),
      ('viewer_warehouse_access','approved_by'), ('viewer_warehouse_access','approved_at'),
      ('viewer_warehouse_access','expires_at'), ('viewer_warehouse_access','notes'),
      ('warehouses','id'), ('warehouses','name'), ('warehouses','code'), ('warehouses','is_central'),
      ('regions','id'), ('regions','name')
    ) AS t(tbl, col)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.tbl AND c.column_name = t.col
    )
  LOOP
    v_missing := v_missing || format(' %s.%s', r.tbl, r.col);
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Migration 0044 dừng (chưa sửa gì): DB thiếu cột:%', v_missing;
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'Migration 0044 dừng: không thấy hàm public.handle_new_user()';
  END IF;
  IF to_regprocedure('public.default_permissions_for_role(text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 0044 dừng: không thấy hàm public.default_permissions_for_role(text)';
  END IF;

  -- ON CONFLICT (user_id, warehouse_id) cần chỉ mục duy nhất tương ứng
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.viewer_warehouse_access'::regclass
      AND i.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      ) = ARRAY['user_id','warehouse_id']
  ) THEN
    RAISE EXCEPTION 'Migration 0044 dừng: viewer_warehouse_access thiếu ràng buộc UNIQUE (user_id, warehouse_id)';
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1. SAO LƯU BẢN THẬT (hàm / ràng buộc / policy sắp bị thay)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.migration_backups (
  id          bigserial PRIMARY KEY,
  migration   text        NOT NULL,
  object_name text        NOT NULL,
  definition  text        NOT NULL,
  saved_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.migration_backups ENABLE ROW LEVEL SECURITY;   -- không có policy: chỉ vai trò chủ / service_role đọc được
REVOKE ALL ON public.migration_backups FROM PUBLIC, anon, authenticated;

INSERT INTO public.migration_backups (migration, object_name, definition)
SELECT '0044', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('handle_new_user', 'approve_viewer_access_request');

INSERT INTO public.migration_backups (migration, object_name, definition)
SELECT '0044', 'constraint profiles.' || conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%';

INSERT INTO public.migration_backups (migration, object_name, definition)
SELECT '0044', 'policy access_requests.' || policyname,
       format('cmd=%s roles=%s using=%s with_check=%s', cmd, roles, qual, with_check)
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'access_requests';

-- -------------------------------------------------------------------------------------
-- 2. profiles.status: thêm 'pending' và 'rejected'
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'pending', 'disabled', 'rejected', 'inactive'));
END $$;

-- -------------------------------------------------------------------------------------
-- 3. Tên đăng nhập duy nhất (không phân biệt hoa/thường)
-- -------------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- 4. access_requests: user_id + reject_reason
-- -------------------------------------------------------------------------------------
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reject_reason text;

CREATE INDEX IF NOT EXISTS idx_access_requests_user ON public.access_requests (user_id);

UPDATE public.access_requests ar
SET user_id = p.id
FROM public.profiles p
WHERE ar.user_id IS NULL AND lower(ar.email) = lower(p.email);

-- -------------------------------------------------------------------------------------
-- 5. access_requests RLS
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'access_requests' AND cmd = 'INSERT'
      AND (with_check IS NULL OR btrim(with_check) IN ('true', '(true)'))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.access_requests', pol.policyname);
    RAISE NOTICE 'Đã gỡ policy INSERT mở: %', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Ai cũng gửi được yêu cầu truy cập" ON public.access_requests;
REVOKE INSERT ON public.access_requests FROM anon;

DROP POLICY IF EXISTS "Người dùng xem yêu cầu truy cập của chính mình" ON public.access_requests;
CREATE POLICY "Người dùng xem yêu cầu truy cập của chính mình"
  ON public.access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------------------------------------
-- 6. handle_new_user(): phân biệt tự đăng ký / do quản trị tạo
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meta      jsonb := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_region    uuid;
  v_username  text;
  v_full_name text;
  v_phone     text;
  v_org       text;
  v_purpose   text;
  v_count     integer;
BEGIN
  SELECT id INTO v_region FROM public.regions WHERE name = 'Miền Trung' LIMIT 1;

  -- Tài khoản do quản trị tạo (Edge Function admin-create-user): giữ nguyên hành vi cũ.
  -- Edge Function sẽ tự cập nhật vai trò / trạng thái ngay sau đó.
  IF COALESCE(v_meta->>'registration_source', '') <> 'self' THEN
    INSERT INTO public.profiles (id, email, full_name, role, region_id, permissions)
    VALUES (
      new.id, new.email, COALESCE(v_meta->>'full_name', new.email), 'viewer', v_region,
      public.default_permissions_for_role('viewer')
    );
    RETURN new;
  END IF;

  -- Tài khoản TỰ ĐĂNG KÝ: vai trò và trạng thái do DB tự đặt, KHÔNG lấy từ dữ liệu trình duyệt gửi lên.
  v_username := lower(btrim(COALESCE(v_meta->>'username', '')));
  IF v_username !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'Tên đăng nhập không hợp lệ.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username) THEN
    RAISE EXCEPTION 'Tên đăng nhập đã tồn tại.' USING ERRCODE = '23505';
  END IF;

  IF jsonb_typeof(v_meta->'warehouse_ids') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_meta->'warehouse_ids') = 0
     OR jsonb_array_length(v_meta->'warehouse_ids') > 50 THEN
    RAISE EXCEPTION 'Phải chọn từ 1 đến 50 kho để xin quyền tra cứu.' USING ERRCODE = '22023';
  END IF;

  v_full_name := left(btrim(COALESCE(v_meta->>'full_name', '')), 120);
  IF v_full_name = '' THEN v_full_name := v_username; END IF;
  v_phone   := NULLIF(left(btrim(COALESCE(v_meta->>'phone', '')), 30), '');
  v_org     := NULLIF(left(btrim(COALESCE(v_meta->>'organization', '')), 200), '');
  v_purpose := NULLIF(left(btrim(COALESCE(v_meta->>'purpose', '')), 500), '');

  INSERT INTO public.profiles (
    id, email, username, full_name, role, status, permissions, region_id, phone, organization, purpose
  ) VALUES (
    new.id, new.email, v_username, v_full_name, 'viewer', 'pending',
    ARRAY['asset.view', 'asset.lookup'], v_region, v_phone, v_org, v_purpose
  );

  INSERT INTO public.access_requests (
    user_id, full_name, email, phone, organization, purpose, warehouse_id, status
  )
  SELECT new.id, v_full_name, new.email, v_phone, v_org, v_purpose, w.id, 'pending'
  FROM public.warehouses w
  WHERE w.id::text IN (SELECT jsonb_array_elements_text(v_meta->'warehouse_ids'));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Các kho đã chọn không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  RETURN new;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 7a. RPC: danh sách kho cho form đăng ký (người CHƯA đăng nhập cũng gọi được)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_registration_warehouses()
RETURNS TABLE (id uuid, name text, code text, is_central boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w.name::text, w.code::text, w.is_central
  FROM public.warehouses w
  ORDER BY w.is_central DESC NULLS LAST, w.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_registration_warehouses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_registration_warehouses() TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 7b. RPC: người dùng tra cứu xin thêm / gia hạn kho
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_warehouse_access(
  p_warehouse_ids uuid[],
  p_purpose text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_profile      record;
  v_ids          uuid[];
  v_wh           uuid;
  v_purpose      text;
  v_created      integer := 0;
  v_skip_active  integer := 0;
  v_skip_pending integer := 0;
  v_skip_invalid integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi yêu cầu.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản của bạn.' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.status IN ('disabled', 'rejected', 'inactive') THEN
    RAISE EXCEPTION 'Tài khoản của bạn đang bị khóa hoặc bị từ chối, không thể gửi yêu cầu.' USING ERRCODE = '42501';
  END IF;
  IF v_profile.role NOT IN ('viewer', 'user') THEN
    RAISE EXCEPTION 'Chỉ tài khoản tra cứu mới cần xin quyền xem kho.' USING ERRCODE = '42501';
  END IF;

  IF p_warehouse_ids IS NULL OR cardinality(p_warehouse_ids) = 0 THEN
    RAISE EXCEPTION 'Vui lòng chọn ít nhất một kho.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_warehouse_ids) > 50 THEN
    RAISE EXCEPTION 'Mỗi lần chỉ được xin tối đa 50 kho.' USING ERRCODE = '22023';
  END IF;

  v_purpose := COALESCE(NULLIF(left(btrim(COALESCE(p_purpose, '')), 500), ''), v_profile.purpose);

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_warehouse_ids) AS x;

  FOREACH v_wh IN ARRAY v_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = v_wh) THEN
      v_skip_invalid := v_skip_invalid + 1;
      CONTINUE;
    END IF;

    -- Đã có quyền còn hạn dài (không hạn, hoặc còn hơn 30 ngày): không cần xin
    IF EXISTS (
      SELECT 1 FROM public.viewer_warehouse_access a
      WHERE a.user_id = v_uid AND a.warehouse_id = v_wh
        AND (a.expires_at IS NULL OR a.expires_at > now() + interval '30 days')
    ) THEN
      v_skip_active := v_skip_active + 1;
      CONTINUE;
    END IF;

    -- Đã có yêu cầu đang chờ duyệt cho kho này: không gửi trùng
    IF EXISTS (
      SELECT 1 FROM public.access_requests r
      WHERE r.warehouse_id = v_wh AND r.status = 'pending'
        AND (r.user_id = v_uid OR lower(r.email) = lower(v_profile.email))
    ) THEN
      v_skip_pending := v_skip_pending + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.access_requests (
      user_id, full_name, email, phone, organization, purpose, warehouse_id, status
    ) VALUES (
      v_uid,
      COALESCE(v_profile.full_name, v_profile.username, v_profile.email),
      v_profile.email, v_profile.phone, v_profile.organization, v_purpose, v_wh, 'pending'
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped_active', v_skip_active,
    'skipped_pending', v_skip_pending,
    'skipped_invalid', v_skip_invalid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_warehouse_access(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_warehouse_access(uuid[], text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 8. RPC duyệt yêu cầu (cùng chữ ký với bản cũ)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_viewer_access_request(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_reviewer  record;
  v_req       record;
  v_target_id uuid;
  v_target    record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = '28000';
  END IF;

  SELECT role, status, managed_warehouse_ids INTO v_reviewer FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_reviewer.status <> 'active'
     OR v_reviewer.role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt yêu cầu truy cập kho.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.access_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu truy cập.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý (trạng thái: %).', v_req.status USING ERRCODE = '22023';
  END IF;

  IF v_reviewer.role = 'warehouse_manager'
     AND NOT (v_req.warehouse_id = ANY (COALESCE(v_reviewer.managed_warehouse_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'Quản lý kho chỉ được duyệt yêu cầu thuộc kho do mình phụ trách.' USING ERRCODE = '42501';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Ngày hết hạn phải ở tương lai.' USING ERRCODE = '22023';
  END IF;

  v_target_id := v_req.user_id;
  IF v_target_id IS NULL THEN
    SELECT id INTO v_target_id FROM public.profiles WHERE lower(email) = lower(v_req.email) LIMIT 1;
  END IF;
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Người xin quyền chưa có tài khoản. Hãy yêu cầu họ đăng ký tài khoản trước.' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, status, role INTO v_target FROM public.profiles WHERE id = v_target_id;
  IF v_target.status IN ('disabled', 'rejected', 'inactive') THEN
    RAISE EXCEPTION 'Tài khoản này đang bị khóa hoặc bị từ chối, không thể cấp quyền. Hãy mở khóa tài khoản trước.' USING ERRCODE = '42501';
  END IF;

  -- Chỉ chuyển 'pending' -> 'active'; không đụng tới trạng thái khác. Đồng bộ thông tin liên hệ nếu hồ sơ còn trống.
  UPDATE public.profiles p
  SET status       = CASE WHEN p.status = 'pending' THEN 'active' ELSE p.status END,
      organization = COALESCE(p.organization, v_req.organization),
      purpose      = COALESCE(p.purpose, v_req.purpose),
      phone        = COALESCE(p.phone, v_req.phone)
  WHERE p.id = v_target_id;

  INSERT INTO public.viewer_warehouse_access (user_id, warehouse_id, approved_by, approved_at, expires_at, notes)
  VALUES (v_target_id, v_req.warehouse_id, v_uid, now(), p_expires_at, p_notes)
  ON CONFLICT (user_id, warehouse_id)
  DO UPDATE SET approved_by = v_uid, approved_at = now(), expires_at = p_expires_at, notes = p_notes;

  UPDATE public.access_requests
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), user_id = COALESCE(user_id, v_target_id)
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_target_id,
    'warehouse_id', v_req.warehouse_id,
    'expires_at', p_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_viewer_access_request(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_viewer_access_request(uuid, timestamptz, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 7c. RPC từ chối yêu cầu
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_viewer_access_request(
  p_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_reviewer record;
  v_req      record;
  v_reason   text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.' USING ERRCODE = '28000';
  END IF;

  SELECT role, status, managed_warehouse_ids INTO v_reviewer FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_reviewer.status <> 'active'
     OR v_reviewer.role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền từ chối yêu cầu truy cập kho.' USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.access_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu truy cập.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý (trạng thái: %).', v_req.status USING ERRCODE = '22023';
  END IF;

  IF v_reviewer.role = 'warehouse_manager'
     AND NOT (v_req.warehouse_id = ANY (COALESCE(v_reviewer.managed_warehouse_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'Quản lý kho chỉ được xử lý yêu cầu thuộc kho do mình phụ trách.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.access_requests
  SET status = 'rejected', reject_reason = left(v_reason, 500), reviewed_by = v_uid, reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_viewer_access_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_viewer_access_request(uuid, text) TO authenticated, service_role;

COMMIT;

-- =====================================================================================
-- ROLLBACK (chạy tay nếu cần quay lại). Bản gốc của các hàm nằm trong migration_backups:
--   select object_name, definition from public.migration_backups where migration = '0044' order by id;
-- Các bước:
--   1. Chạy lại phần "definition" của handle_new_user() và approve_viewer_access_request() lấy từ bảng trên.
--   2. drop function if exists public.list_registration_warehouses();
--      drop function if exists public.request_warehouse_access(uuid[], text);
--      drop function if exists public.reject_viewer_access_request(uuid, text);
--   3. drop policy if exists "Người dùng xem yêu cầu truy cập của chính mình" on public.access_requests;
--      (khôi phục policy INSERT cũ nếu thật sự cần — KHÔNG khuyến nghị vì nó cho phép ghi ẩn danh.)
--   4. Ràng buộc profiles_status_check: đặt lại theo dòng 'constraint profiles.*' trong migration_backups.
--   5. drop index if exists public.uq_profiles_username_lower;
--   6. Cột access_requests.user_id / reject_reason: giữ lại được (không ảnh hưởng), hoặc alter table ... drop column.
-- =====================================================================================