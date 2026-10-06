-- Test 0088 (1 khối, tự rollback). Cần: >=2 GCN, trong đó GCN đầu tiên (theo created_at) gắn với 1 dự án; admin@btcvmt.vn.
-- Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
grant all on _r to authenticated;

create or replace function pg_temp.bc(p_rows jsonb)
returns text language plpgsql as $f$
declare v text;
begin
  select string_agg(r_row || ':' || r_result || ':' || coalesce(r_message,''), ' || ' order by r_row)
    into v from public.bulk_correct_assets('info', p_rows, null, false);
  return v;
exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
grant execute on function pg_temp.bc(jsonb) to authenticated;

create or replace function pg_temp.rc(p_rows jsonb)
returns text language plpgsql as $f$
declare v text;
begin
  select string_agg(r_row || ':' || r_result || ':' || coalesce(r_message,''), ' || ' order by r_row)
    into v from public.create_reissue_requests_bulk(p_rows, null, false);
  return v;
exception when others then return sqlstate || ': ' || sqlerrm; end $f$;
grant execute on function pg_temp.rc(jsonb) to authenticated;

do $t$
declare
  v_admin uuid; a uuid; b uuid; v_proj uuid; v_pname text; v_pcode text;
  ac text; bc text; v_out text; v_np boolean := false;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id, project_id into a, v_proj from assets order by created_at limit 1;
  select id into b from assets order by created_at offset 1 limit 1;
  if v_admin is null or a is null or b is null or v_proj is null then
    insert into _r values (0,'chuẩn bị','admin + 2 GCN, GCN đầu có dự án','thiếu',false); return;
  end if;

  perform set_config('request.jwt.claims', '', true);
  -- dự án có mã (đặt mã tạm nếu chưa có), tên chuẩn
  update projects set project_code = coalesce(nullif(btrim(project_code), ''), 'TST-PRJ-0088') where id = v_proj;
  select name, project_code into v_pname, v_pcode from projects where id = v_proj;
  update assets set lifecycle_status='active', invalidation_type='NONE', custody_status='checked_out', is_in_warehouse=false,
         legal_lot_code='LOT-PRJ-A', certificate_no='PRJ-OLD-A' where id = a;
  -- B: thử bỏ dự án (nếu cột cho phép NULL) để kiểm tra GCN chưa gắn dự án
  begin
    update assets set project_id = null, lifecycle_status='active', invalidation_type='NONE',
           legal_lot_code='LOT-PRJ-B', certificate_no='PRJ-OLD-B' where id = b;
    v_np := true;
  exception when others then v_np := false; end;
  select asset_code into ac from assets where id = a;
  select asset_code into bc from assets where id = b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. đúng tên dự án
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','project_name', v_pname,'notes','t1')));
  insert into _r values (1,'1. đúng tên dự án','1:ok', left(v_out,100), v_out like '1:ok:%');

  -- 2. tên dự án sai
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','project_name','Dự án không tồn tại XYZ','notes','t2')));
  insert into _r values (2,'2. tên dự án sai','1:error:Tên dự án không khớp', left(v_out,120), v_out like '1:error:Tên dự án không khớp%');

  -- 3. tên đúng nhưng hoa/thường + dư khoảng trắng
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','project_name','  ' || upper(replace(v_pname,' ','   ')) || '  ','notes','t3')));
  insert into _r values (3,'3. tên đúng, khác hoa/thường và khoảng trắng','1:ok', left(v_out,100), v_out like '1:ok:%');

  -- 4. mã dự án đúng / sai
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','project_code', lower(v_pcode),'notes','t4')));
  insert into _r values (4,'4a. mã dự án đúng (khác hoa/thường)','1:ok', left(v_out,100), v_out like '1:ok:%');
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','project_code','SAI-MA','notes','t4')));
  insert into _r values (5,'4b. mã dự án sai','1:error:Mã dự án không khớp', left(v_out,120), v_out like '1:error:Mã dự án không khớp%');

  -- 5. không gửi thông tin dự án: không đối chiếu (tương thích ngược)
  v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-OLD-A','notes','t5')));
  insert into _r values (6,'5. không gửi dự án: vẫn xử lý','1:ok', left(v_out,100), v_out like '1:ok:%');

  -- 6. GCN chưa gắn dự án mà gửi tên dự án
  if v_np then
    v_out := pg_temp.bc(jsonb_build_array(jsonb_build_object('asset_code', bc, 'legal_lot_code','LOT-PRJ-B','certificate_no','PRJ-OLD-B','project_name', v_pname,'notes','t6')));
    insert into _r values (7,'6. GCN chưa gắn dự án','1:error:...chưa gắn dự án', left(v_out,120), v_out like '1:error:%chưa gắn dự án%');
  else
    insert into _r values (7,'6. GCN chưa gắn dự án (bỏ qua: cột project_id không cho NULL)','bỏ qua','bỏ qua', true);
  end if;

  -- 7. cấp đổi: tên sai / tên đúng
  v_out := pg_temp.rc(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-NEW-A','project_name','Sai dự án')));
  insert into _r values (8,'7a. cấp đổi: tên dự án sai','1:error:Tên dự án không khớp', left(v_out,120), v_out like '1:error:Tên dự án không khớp%');
  v_out := pg_temp.rc(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code','LOT-PRJ-A','certificate_no','PRJ-NEW-A','project_name', v_pname)));
  insert into _r values (9,'7b. cấp đổi: tên dự án đúng','1:ok', left(v_out,120), v_out like '1:ok:%');
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;