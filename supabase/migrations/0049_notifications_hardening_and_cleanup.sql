-- =====================================================================================
-- 0049 — Siết bảo mật bảng notifications + hàm dọn dẹp thông báo cũ
-- =====================================================================================
-- THAY THẾ file 0047_notifications_and_auto_cleanup.sql (do AI Studio tạo, có 2 lỗ hổng). Chạy được dù 0047 đó
-- đã chạy hay chưa (idempotent). Chạy TOÀN BỘ file một lần trên Supabase SQL Editor.
--
-- SỬA SO VỚI 0047 CŨ
--   1. clean_transient_data(): chỉ service_role/postgres (pg_cron) gọi được; KHÔNG cấp cho authenticated/anon.
--   2. INSERT: chỉ vai trò nội bộ (không gồm viewer/investor); vẫn được gửi cho người khác (luồng duyệt cần).
--   3. Gỡ MỌI policy cũ trên bảng (kể cả allow_all_notifications từ 0018 nếu còn) rồi tạo lại đúng 4 policy.
--   4. Gói trong 1 giao dịch; bỏ 2 vai trò không xác nhận được (quan_ly, chuyen_vien).
--   5. Bảng notifications ĐÃ có sẵn (0018) — chỉ bổ sung cột còn thiếu, không tạo lại.
-- =====================================================================================

BEGIN;

-- 0. Kiểm tra trước
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'Migration 0049 dừng: chưa có bảng public.notifications.';
  END IF;
  IF to_regprocedure('public.is_active_role(text[])') IS NULL THEN
    RAISE EXCEPTION 'Migration 0049 dừng: chưa có hàm public.is_active_role(text[]).';
  END IF;
END $$;

-- 1. Bổ sung cột còn thiếu (nếu có)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS transaction_item_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON public.notifications (created_at DESC);

-- 2. RLS: gỡ MỌI policy hiện có rồi tạo lại
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.notifications', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_staff" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_active_role(ARRAY[
      'super_admin','admin','btc_manager','warehouse_manager',
      'capital_dept','project_dept','re_dept','supervisor'
    ]::text[])
  );

REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- 3. Hàm dọn dẹp — chỉ service_role / pg_cron
CREATE OR REPLACE FUNCTION public.clean_transient_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_read   integer := 0;
  v_unread integer := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.notifications
    WHERE is_read = true AND created_at < now() - interval '30 days'
    RETURNING id
  ) SELECT count(*) INTO v_read FROM d;

  WITH d AS (
    DELETE FROM public.notifications
    WHERE is_read = false AND created_at < now() - interval '90 days'
    RETURNING id
  ) SELECT count(*) INTO v_unread FROM d;

  RETURN jsonb_build_object('success', true, 'deleted_read_30d', v_read,
                            'deleted_unread_90d', v_unread, 'cleaned_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.clean_transient_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_transient_data() TO service_role;

-- 4. Lịch dọn 02:00 mỗi ngày (bỏ qua êm nếu pg_cron không khả dụng)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clean_transient_notifications_daily') THEN
    PERFORM cron.unschedule('clean_transient_notifications_daily');
  END IF;
  PERFORM cron.schedule('clean_transient_notifications_daily', '0 2 * * *',
                        'SELECT public.clean_transient_data();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron không khả dụng: %', SQLERRM;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- KIỂM TRA SAU KHI CHẠY (chỉ đọc):
--   select policyname, cmd from pg_policies where schemaname='public' and tablename='notifications' order by cmd;
--   -- kỳ vọng đúng 4 dòng: DELETE own, INSERT staff, SELECT own, UPDATE own
--   select has_function_privilege('authenticated','public.clean_transient_data()','execute');  -- kỳ vọng false
