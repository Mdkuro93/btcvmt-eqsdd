-- 0060_restrict_report_snapshots_insert.sql
-- (Đã chạy tay trên DB thật; file này để repo khớp DB - AGENTS #16.2)
-- Lý do: policy INSERT "Tạo mới report_snapshots" là WITH CHECK (true) cho mọi authenticated.
-- Phụ thuộc: public.is_active_role(text[]) (plpgsql, SECURITY DEFINER, search_path=public).
-- Phạm vi: CHỈ thay policy INSERT của report_snapshots.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_active_role(text[])') IS NULL THEN
    RAISE EXCEPTION '0060 dừng: chưa có hàm public.is_active_role(text[]).';
  END IF;
END $$;

DROP POLICY IF EXISTS "Tạo mới report_snapshots" ON public.report_snapshots;
CREATE POLICY "Tạo mới report_snapshots"
ON public.report_snapshots FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND (
    public.is_active_role(ARRAY['super_admin','admin','btc_manager'])
    OR (
      public.is_active_role(ARRAY['warehouse_manager'])
      AND warehouse_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND warehouse_id = ANY (p.managed_warehouse_ids)
      )
    )
  )
);

COMMIT;

-- ROLLBACK:
-- DROP POLICY "Tạo mới report_snapshots" ON public.report_snapshots;
-- CREATE POLICY "Tạo mới report_snapshots" ON public.report_snapshots
--   FOR INSERT TO authenticated WITH CHECK (true);