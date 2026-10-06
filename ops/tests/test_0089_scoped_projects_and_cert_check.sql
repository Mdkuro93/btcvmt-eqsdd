-- Test 0089 (1 khối, tự rollback). Cần: admin@btcvmt.vn, ngoctb03@sungroup.com.vn, >=1 GCN có dự án.
-- Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
grant all on _r to authenticated;

create or replace function pg_temp.cert(p_row jsonb)
returns text language plpgsql as $f$
declare v text;
begin
  select string_agg(r_row || ':' || r_result || ':' || coalesce(r_message,''), ' || ' order by r_row)
    into v from public.bulk_correct_assets('certificate', jsonb_build_array(p_row), null, false);
  return v;
exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
grant execute on function pg_temp.cert(jsonb) to authenticated;

create or replace function pg_temp.lst()
returns text language plpgsql as $f$
declare v text;
begin
  select coalesce(string_agg(r_name || '#' || r_asset_count, ' | ' order by r_name), '(rỗng)') into v from public.list_bulk_update_projects();
  return v;
exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
grant execute on function pg_temp.lst() to authenticated;

do $t$
declare
  v_admin uuid; v_cap uuid; a uuid; v_proj uuid; v_pname text; v_wh uuid; ac text; v_out text;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id into v_cap from profiles where email = 'ngoctb03@sungroup.com.vn';
  select id, project_id, warehouse_id into a, v_proj, v_wh from assets where project_id is not null order by created_at limit 1;
  if v_admin is null or v_cap is null or a is null then
    insert into _r values (0,'chuẩn bị','admin, capital_dept, 1 GCN có dự án','thiếu',false); return;
  end if;
  select name into v_pname from projects where id = v_proj;

  perform set_config('request.jwt.claims', '', true);
  update assets set lifecycle_status='active', invalidation_type='NONE', legal_lot_code='LOT-C-A', certificate_no='CERT-OLD-A' where id = a;
  select asset_code into ac from assets where id = a;

  -- 1. admin: thấy dự án của GCN
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_out := pg_temp.lst();
  insert into _r values (1,'1. admin: danh mục có dự án của GCN','chứa "' || v_pname || '"', left(v_out, 160), position(v_pname in v_out) > 0);

  -- 2. capital_dept bị chặn
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  v_out := pg_temp.lst();
  insert into _r values (2,'2. capital_dept','42501', left(v_out, 80), v_out like '42501:%');

  -- 3. warehouse_manager: kho rỗng -> (rỗng); đúng kho -> thấy dự án
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update profiles set role='warehouse_manager', managed_warehouse_ids = array[]::uuid[] where id = v_cap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_out := pg_temp.lst();
  insert into _r values (3,'3a. quản lý kho, chưa quản lý kho nào','(rỗng)', left(v_out, 80), v_out = '(rỗng)');
  if v_wh is not null then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    update profiles set managed_warehouse_ids = array[v_wh] where id = v_cap;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_out := pg_temp.lst();
    insert into _r values (4,'3b. quản lý kho đúng kho: thấy dự án','chứa "' || v_pname || '"', left(v_out, 160), position(v_pname in v_out) > 0);
  else
    insert into _r values (4,'3b. (bỏ qua: GCN không có kho)','bỏ qua','bỏ qua', true);
  end if;

  -- 4. chế độ certificate: số hiện tại tùy chọn nhưng phải khớp
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_out := pg_temp.cert(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-C-A','new_certificate_no','CERT-NEW-A','certificate_no','CERT-OLD-A'));
  insert into _r values (5,'4a. certificate: số hiện tại đúng','1:ok', left(v_out, 100), v_out like '1:ok:%');
  v_out := pg_temp.cert(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-C-A','new_certificate_no','CERT-NEW-A','certificate_no','SAI-SO'));
  insert into _r values (6,'4b. certificate: số hiện tại sai','1:error:Số GCN hiện tại ghi trong file không khớp', left(v_out, 140), v_out like '1:error:Số GCN hiện tại ghi trong file không khớp%');
  v_out := pg_temp.cert(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-C-A','new_certificate_no','CERT-NEW-A'));
  insert into _r values (7,'4c. certificate: không ghi số hiện tại (vẫn được)','1:ok', left(v_out, 100), v_out like '1:ok:%');
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;