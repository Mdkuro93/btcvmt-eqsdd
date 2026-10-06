-- Test 0087 (1 khối, tự rollback). Cần: >=3 GCN trong bảng assets; admin@btcvmt.vn và ngoctb03@sungroup.com.vn (capital_dept).
-- Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
grant all on _r to authenticated;

create or replace function pg_temp.run(p_rows jsonb, p_apply boolean, p_reason text)
returns text language plpgsql as $f$
declare v text;
begin
  select string_agg(r_row || ':' || r_result || ':' || coalesce(r_message,'') || '#' || coalesce(r_request_id::text,'-'), ' || ' order by r_row)
    into v from public.create_reissue_requests_bulk(p_rows, p_reason, p_apply);
  return v;
exception when others then
  return sqlstate || ': ' || sqlerrm;
end $f$;
grant execute on function pg_temp.run(jsonb, boolean, text) to authenticated;

do $t$
declare
  v_admin uuid; v_cap uuid; a uuid; b uuid; c uuid;
  ac text; bc text; cc text; wa uuid;
  v_out text; v_n0 int; v_n1 int; v_req uuid; v_rec record; v_cnt int; v_new record; v_old record;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id into v_cap from profiles where email = 'ngoctb03@sungroup.com.vn';
  select id into a from assets order by created_at limit 1;
  select id into b from assets order by created_at offset 1 limit 1;
  select id into c from assets order by created_at offset 2 limit 1;
  if v_admin is null or v_cap is null or a is null or b is null or c is null then
    insert into _r values (0,'chuẩn bị','đủ tài khoản + 3 GCN','thiếu',false); return;
  end if;

  -- Chuẩn bị dữ liệu (không có claims; claims rỗng để trigger guard_profile_privilege không chặn)
  perform set_config('request.jwt.claims', '', true);
  update assets set custody_status='checked_out', is_in_warehouse=false, lifecycle_status='active', invalidation_type='NONE',
         legal_lot_code='LOT-RN-A', certificate_no='RN-OLD-A' where id = a;
  update assets set custody_status='checked_out', is_in_warehouse=false, lifecycle_status='active', invalidation_type='NONE',
         legal_lot_code='LOT-RN-B', certificate_no='RN-OLD-B' where id = b;
  update assets set custody_status='in_stock', is_in_warehouse=true, lifecycle_status='active', invalidation_type='NONE',
         legal_lot_code='LOT-RN-C', certificate_no='RN-OLD-C' where id = c;
  select asset_code into ac from assets where id = a;
  select asset_code into bc from assets where id = b;
  select asset_code into cc from assets where id = c;
  select warehouse_id into wa from assets where id = a;
  select count(*) into v_n0 from asset_declaration_requests;

  -- Đăng nhập admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. xem trước
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-NEW-A')), false, null);
  select count(*) into v_n1 from asset_declaration_requests;
  insert into _r values (1, '1. xem trước: ok, chưa ghi hồ sơ', '1:ok + số hồ sơ không đổi', v_out || ' | trước=' || v_n0 || ' sau=' || v_n1,
    v_out like '1:ok:%' and v_n0 = v_n1);

  -- 2. áp dụng không lý do
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-NEW-A')), true, 'ngắn');
  insert into _r values (2, '2. áp dụng không có lý do', '22023', left(v_out, 60), v_out like '22023:%');

  -- 3. số GCN mới lặp trong file
  v_out := pg_temp.run(jsonb_build_array(
      jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-DUP-X'),
      jsonb_build_object('old_asset_code', bc, 'legal_lot_code', 'LOT-RN-B', 'certificate_no', 'rn-dup-x')), false, null);
  insert into _r values (3, '3. số GCN mới lặp trong file', '1:ok || 2:error ...lặp', left(v_out, 200),
    v_out like '1:ok:%' and v_out like '%2:error:Số GCN mới % bị lặp trong file%');

  -- 4. sổ cũ còn lưu kho
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', cc, 'legal_lot_code', 'LOT-RN-C', 'certificate_no', 'RN-NEW-C')), false, null);
  insert into _r values (4, '4. sổ cũ còn lưu kho bị chặn', '1:error ... LƯU KHO', left(v_out, 160), v_out like '1:error:%LƯU KHO%');

  -- 5. mã pháp lý không khớp
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'SAI-LO', 'certificate_no', 'RN-NEW-A')), false, null);
  insert into _r values (5, '5. mã pháp lý không khớp', '1:error:Mã pháp lý không khớp', left(v_out, 120), v_out like '1:error:Mã pháp lý không khớp%');

  -- 6. số GCN mới trùng GCN khác, chưa xác nhận
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-OLD-C')), false, null);
  insert into _r values (6, '6. số GCN mới trùng, chưa xác nhận', '1:error:DUPLICATE_UNCONFIRMED', left(v_out, 100), v_out like '1:error:DUPLICATE_UNCONFIRMED%');

  -- 7. tạo hồ sơ cho A
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-NEW-A', 'notes', 'sổ mới đợt 1')), true, 'Cấp đổi đợt kiểm thử 0087');
  v_req := nullif(substring(v_out from '#([0-9a-f-]{36})'), '')::uuid;
  select * into v_rec from asset_declaration_requests where id = v_req;
  insert into _r values (7, '7. tạo hồ sơ cấp đổi: pending, cap_doi, RENEW, sổ cũ, người tạo, kế thừa kho',
    '1:created + đúng trường',
    left(v_out, 60) || ' | ' || coalesce(v_rec.request_type,'null') || ',' || coalesce(v_rec.status,'null') || ',' || coalesce(v_rec.relationship_type,'null'),
    v_out like '1:created:%' and v_rec.request_type = 'cap_doi' and v_rec.status = 'pending' and v_rec.relationship_type = 'RENEW'
      and v_rec.old_asset_id = a and v_rec.requester_id = v_admin and v_rec.certificate_no = 'RN-NEW-A'
      and v_rec.warehouse_id is not distinct from wa and v_rec.notes like '%[Cấp đổi hàng loạt]%');

  -- 8. cùng sổ cũ lần hai
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'RN-NEW-A2')), true, 'Cấp đổi đợt kiểm thử 0087');
  insert into _r values (8, '8. đã có hồ sơ chờ duyệt cho sổ cũ', '1:error ... chờ duyệt', left(v_out, 120), v_out like '1:error:%chờ duyệt%');

  -- 9. trùng số GCN có xác nhận -> tạo hồ sơ B kèm ack
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', bc, 'legal_lot_code', 'LOT-RN-B', 'certificate_no', 'RN-OLD-C', 'duplicate_ack_reason', 'CQNN cấp trùng số, đã đối chiếu bản gốc')), true, 'Cấp đổi đợt kiểm thử 0087');
  select * into v_rec from asset_declaration_requests where old_asset_id = b and status = 'pending';
  insert into _r values (9, '9. trùng số GCN có xác nhận: tạo hồ sơ + lưu ack', '1:created + ack_by = admin',
    left(v_out, 100) || ' | ack=' || coalesce(v_rec.duplicate_ack_reason, 'null'),
    v_out like '1:created:%' and v_rec.duplicate_ack_by = v_admin and v_rec.duplicate_ack_reason like 'CQNN%');

  -- 10. quyền: capital_dept; danh sách rỗng; quản lý kho kho khác
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'X1')), false, null);
  insert into _r values (10, '10a. capital_dept', '42501', left(v_out, 80), v_out like '42501:%');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_out := pg_temp.run('[]'::jsonb, false, null);
  insert into _r values (11, '10b. danh sách rỗng', '22023', left(v_out, 80), v_out like '22023:%');

  reset role;
  perform set_config('request.jwt.claims', '', true);
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[]::uuid[] where id = v_cap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_out := pg_temp.run(jsonb_build_array(jsonb_build_object('old_asset_code', ac, 'legal_lot_code', 'LOT-RN-A', 'certificate_no', 'X1')), false, null);
  insert into _r values (12, '10c. quản lý kho không quản lý kho này', '1:error:...không thuộc kho bạn quản lý', left(v_out, 100), v_out like '1:error:%không thuộc kho bạn quản lý%');

  -- 11. duyệt hồ sơ A bằng luồng 0082 (đầu-cuối): sổ mới tạo, sổ cũ bị thu hồi
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform approve_asset_declaration_request((select id from asset_declaration_requests where old_asset_id = a and status = 'pending'), 'approved', null, null, null);
    select id, parent_asset_id, relationship_type, custody_status into v_new from assets where certificate_no = 'RN-NEW-A';
    select status, lifecycle_status, invalidation_type into v_old from assets where id = a;
    insert into _r values (13, '11. duyệt hồ sơ: sổ mới sau cấp đổi, sổ cũ vô hiệu', 'sổ mới parent=A,RENEW,in_stock | sổ cũ REVOKED/invalidated/FULL',
      coalesce((v_new.parent_asset_id = a)::text, 'null') || ',' || coalesce(v_new.relationship_type, 'null') || ',' || coalesce(v_new.custody_status, 'null') || ' | ' || coalesce(v_old.status, 'null') || '/' || coalesce(v_old.lifecycle_status, 'null') || '/' || coalesce(v_old.invalidation_type, 'null'),
      v_new.parent_asset_id = a and v_new.relationship_type = 'RENEW' and v_new.custody_status = 'in_stock'
        and v_old.status = 'REVOKED' and v_old.lifecycle_status = 'invalidated' and v_old.invalidation_type = 'FULL');
  exception when others then
    insert into _r values (13, '11. duyệt hồ sơ: sổ mới sau cấp đổi, sổ cũ vô hiệu', 'duyệt thành công', sqlstate || ': ' || sqlerrm, false);
  end;
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;