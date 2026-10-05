-- 0061_revoke_anon_function_execute.sql
-- (Đã chạy tay trên DB thật; file này để repo khớp DB - AGENTS #16.2)
-- Lý do: 22 hàm SECURITY DEFINER gọi được bởi anon (EXECUTE mặc định cấp cho PUBLIC).
--        Chỉ resolve_login_account và list_registration_warehouses cần cho anon.
-- Phạm vi: thu hồi EXECUTE khỏi PUBLIC/anon, cấp lại cho authenticated + service_role.
BEGIN;

DO $$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.approve_asset_declaration_request(uuid,text,text,text)',
    'public.approve_asset_declaration_requests_bulk(jsonb)',
    'public._process_single_declaration_approval(uuid,text,uuid)',
    'public._next_voucher_code(uuid,text)',
    'public.create_transaction_request(text,text,jsonb,text)',
    'public.decide_transaction_item(uuid,text,text,jsonb,text)',
    'public.void_transaction_item(uuid,text)',
    'public.transfer_asset_ownership(uuid,uuid,text,text,uuid)',
    'public.lock_reporting_period(uuid,text)',
    'public.reopen_reporting_period(uuid,text)',
    'public.get_report_statistics(text,uuid,uuid,text,text)',
    'public.lookup_asset_status(text)',
    'public.can_request(text)',
    'public.has_permission(text)',
    'public.is_active_role(text[])',
    'public.project_in_scope(uuid,uuid,uuid)',
    'public.current_area_id()',
    'public.current_project_ids()',
    'public.current_region_id()',
    'public.current_role_name()'
  ]::regprocedure[]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.prosecdef
    AND p.prorettype <> 'trigger'::regtype
    AND p.proname NOT IN ('resolve_login_account','list_registration_warehouses')
    AND has_function_privilege('anon', p.oid, 'execute');
  IF n > 0 THEN RAISE EXCEPTION '0061 dừng: anon còn gọi được % hàm SECURITY DEFINER.', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (cấp lại đúng hàm cần, không cấp hàng loạt):
-- GRANT EXECUTE ON FUNCTION public.<ten_ham>(<kieu_tham_so>) TO anon;