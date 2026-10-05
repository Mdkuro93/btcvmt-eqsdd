-- 0069_scale_indexes_and_asset_code_unique.sql
-- Lý do: chuẩn bị quy mô hàng chục nghìn GCN. Rà soát chỉ mục cho thấy:
--   - asset_declaration_requests chưa có chỉ mục nào; transactions chỉ có created_at; activity_logs thiếu warehouse/action_type.
--   - assets.asset_code CHƯA có ràng buộc duy nhất, trong khi mã được sinh bằng MAX()+1 (0065, và client): hai người duyệt
--     cùng lúc có thể ra trùng mã.
-- Mỗi chỉ mục chỉ được tạo khi bảng và CỘT tồn tại (DB thật từng lệch repo). Bảng hiện còn ít dữ liệu nên tạo lúc này gần như tức thì.
-- Không dùng CONCURRENTLY vì chạy trong giao dịch; sau khi có dữ liệu lớn, tạo chỉ mục mới phải dùng CONCURRENTLY ngoài giao dịch.
BEGIN;

DO $$
DECLARE
  r record;
  v_ok boolean;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('asset_declaration_requests', 'idx_adr_status_created',   'status, created_at DESC', ARRAY['status','created_at']),
      ('asset_declaration_requests', 'idx_adr_warehouse',        'warehouse_id',            ARRAY['warehouse_id']),
      ('asset_declaration_requests', 'idx_adr_requester',        'requester_id',            ARRAY['requester_id']),
      ('asset_declaration_requests', 'idx_adr_project',          'project_id',              ARRAY['project_id']),
      ('transactions',               'idx_tx_warehouse_created', 'warehouse_id, created_at DESC', ARRAY['warehouse_id','created_at']),
      ('transactions',               'idx_tx_status',            'status',                  ARRAY['status']),
      ('transactions',               'idx_tx_created_by',        'created_by',              ARRAY['created_by']),
      ('transactions',               'idx_tx_requester',         'requester_id',            ARRAY['requester_id']),
      ('activity_logs',              'idx_actlog_warehouse_created', 'warehouse_id, created_at DESC', ARRAY['warehouse_id','created_at']),
      ('activity_logs',              'idx_actlog_action_created',    'action_type, created_at DESC',  ARRAY['action_type','created_at']),
      ('activity_logs',              'idx_actlog_performed_by',      'performed_by',                  ARRAY['performed_by']),
      ('inventory_audit_items',      'idx_iai_audit_finding',    'audit_id, finding_status', ARRAY['audit_id','finding_status']),
      ('assets',                     'idx_assets_wh_custody',    'warehouse_id, custody_status', ARRAY['warehouse_id','custody_status'])
    ) AS t(tbl, idx, cols, req)
  LOOP
    SELECT NOT EXISTS (
      SELECT 1 FROM unnest(r.req) c
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = c
      )
    ) INTO v_ok;
    IF v_ok THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', r.idx, r.tbl, r.cols);
    ELSE
      RAISE NOTICE 'Bỏ qua % (bảng/cột chưa tồn tại)', r.idx;
    END IF;
  END LOOP;
END $$;

-- Mã tài sản duy nhất (bỏ qua giá trị rỗng). Dừng rõ ràng nếu đang có mã trùng.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT asset_code FROM public.assets
    WHERE asset_code IS NOT NULL AND btrim(asset_code) <> ''
    GROUP BY asset_code HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION '0069 dừng: có % mã asset_code đang trùng. Xử lý trùng trước (select asset_code, count(*) from assets group by 1 having count(*)>1).', n;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_asset_code
    ON public.assets (asset_code)
    WHERE asset_code IS NOT NULL AND btrim(asset_code) <> '';
END $$;

COMMIT;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.uq_assets_asset_code;
-- DROP INDEX IF EXISTS public.idx_adr_status_created, public.idx_adr_warehouse, public.idx_adr_requester, public.idx_adr_project,
--   public.idx_tx_warehouse_created, public.idx_tx_status, public.idx_tx_created_by, public.idx_tx_requester,
--   public.idx_actlog_warehouse_created, public.idx_actlog_action_created, public.idx_actlog_performed_by,
--   public.idx_iai_audit_finding, public.idx_assets_wh_custody;
