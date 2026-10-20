-- Migration 0111: thế chấp (collaterals) và phả hệ GCN (asset_lineage_events / asset_lineage_links) chỉ thấy theo GCN mình xem được.
-- Trước đây:
--   collaterals_select: mọi tài khoản có quyền 'request.approve' hoặc 'asset.mortgage' (mọi thủ kho) xem TẤT CẢ hồ sơ thế chấp mọi kho.
--   collaterals_write / lineage_*_write_admin: FOR ALL theo has_permission('request.approve') -> cũng cho xem và GHI mọi dòng.
--   lineage_*_select_all: mọi tài khoản đăng nhập (trừ viewer) xem toàn bộ phả hệ.
-- Sau 0111:
--   SELECT: admin/super_admin/btc_manager xem hết; người khác chỉ xem dòng của GCN mà policy bảng assets cho họ xem
--           (policy con chạy với quyền của chính người dùng nên tự theo kho).
--   INSERT/UPDATE/DELETE: chỉ admin/super_admin/btc_manager (app ghi hai nhóm bảng này qua RPC SECURITY DEFINER, không ghi trực tiếp).
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('collaterals','asset_lineage_events','asset_lineage_links')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.collaterals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_lineage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_lineage_links ENABLE ROW LEVEL SECURITY;

-- ===== collaterals =====
CREATE POLICY "collaterals_select_scoped" ON public.collaterals FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR EXISTS (SELECT 1 FROM public.assets a WHERE a.id = collaterals.asset_id)
);
CREATE POLICY "collaterals_write_admin" ON public.collaterals FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')));

-- ===== asset_lineage_links =====
CREATE POLICY "lineage_links_select_scoped" ON public.asset_lineage_links FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_lineage_links.asset_id)
);
CREATE POLICY "lineage_links_write_admin" ON public.asset_lineage_links FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')));

-- ===== asset_lineage_events: thấy sự kiện khi thấy ít nhất 1 liên kết (liên kết đã tự lọc theo GCN xem được) =====
CREATE POLICY "lineage_events_select_scoped" ON public.asset_lineage_events FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
          AND p.role IN ('super_admin','admin','btc_manager'))
  OR EXISTS (SELECT 1 FROM public.asset_lineage_links l WHERE l.event_id = asset_lineage_events.id)
);
CREATE POLICY "lineage_events_write_admin" ON public.asset_lineage_events FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'
               AND p.role IN ('super_admin','admin','btc_manager')));

COMMIT;

-- KIỂM TRA: SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public'
--   AND tablename IN ('collaterals','asset_lineage_events','asset_lineage_links') ORDER BY 1,2;  -- đúng 2 policy mỗi bảng
-- Trên app: duyệt một phiếu thế chấp / tách sổ bằng tài khoản thủ kho -> vẫn chạy (đi qua RPC decide_transaction_item).