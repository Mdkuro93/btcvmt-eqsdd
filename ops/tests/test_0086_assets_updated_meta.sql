-- Test 0086 (chạy trong 1 khối; tự rollback). Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
grant all on _r to authenticated;

do $t$
declare
  v_admin uuid; v_other uuid; v_asset uuid; v_by uuid; v_at timestamptz; v_cnt int;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id into v_other from profiles where email = 'ngoctb03@sungroup.com.vn';
  select id into v_asset from assets order by created_at limit 1;
  if v_admin is null or v_other is null or v_asset is null then
    insert into _r values (0,'chuẩn bị dữ liệu','đủ admin, capital_dept, 1 GCN','thiếu',false); return;
  end if;

  -- 1. có phiên đăng nhập: bỏ qua giá trị client, dùng auth.uid() và now()
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update assets set notes = coalesce(notes,'') || '', updated_by = v_other, updated_at = timestamptz '2000-01-01' where id = v_asset;
  select updated_by, updated_at into v_by, v_at from assets where id = v_asset;
  insert into _r values (1, '1. có phiên: updated_by = người đăng nhập, updated_at = now()', 'admin | now()',
    case when v_by = v_admin then 'admin' else 'sai: ' || coalesce(v_by::text,'null') end || ' | ' || case when v_at = now() then 'now()' else v_at::text end,
    v_by = v_admin and v_at = now());

  -- 2. không có phiên (SQL Editor/service): updated_at vẫn = now(), updated_by giữ giá trị gửi vào
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update assets set updated_by = v_other, updated_at = timestamptz '2000-01-01' where id = v_asset;
  select updated_by, updated_at into v_by, v_at from assets where id = v_asset;
  insert into _r values (2, '2. không phiên: giữ updated_by gửi vào, updated_at = now()', 'capital_dept | now()',
    case when v_by = v_other then 'capital_dept' else 'sai: ' || coalesce(v_by::text,'null') end || ' | ' || case when v_at = now() then 'now()' else v_at::text end,
    v_by = v_other and v_at = now());

  -- 3. trigger tồn tại đúng 1 cái, BEFORE UPDATE
  select count(*) into v_cnt from pg_trigger
   where tgrelid = 'public.assets'::regclass and tgname = 'trg_assets_set_updated_meta' and (tgtype & 2) = 2 and (tgtype & 16) = 16;
  insert into _r values (3, '3. trigger BEFORE UPDATE tồn tại', '1', v_cnt::text, v_cnt = 1);
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;