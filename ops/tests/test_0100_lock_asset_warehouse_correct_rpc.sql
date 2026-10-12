-- Test 0100 (1 khối, tự rollback; 16 dòng). Cần: admin@btcvmt.vn, dự án "Test" (có vùng/địa bàn), >=2 kho (nếu chỉ có 1 kho test tự thêm kho thử), đã chạy 0095-0100.
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
create or replace function pg_temp.act(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; exception when others then v := 'ERR ' || sqlstate || ': ' || sqlerrm; end;
  reset role; perform set_config('request.jwt.claims', '', true);
  return coalesce(v, '');
end $f$;
do $t$
declare
  v_admin uuid; v_pname text; v_area uuid; v_reg uuid; v_wa uuid; v_wan text; v_wb uuid; base jsonb; o text;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_ids text; v_tx uuid;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select p.name, p.area_id, ar.region_id into v_pname, v_area, v_reg from projects p join areas ar on ar.id = p.area_id join regions rg on rg.id = ar.region_id order by (p.name = 'Test') desc, p.name limit 1;
  perform set_config('request.jwt.claims', '', true);
  select id, name into v_wa, v_wan from warehouses order by name limit 1;
  select id into v_wb from warehouses where id <> v_wa order by name limit 1;
  if v_wb is null then insert into warehouses(name) values ('Kho thử test 0100') returning id into v_wb; end if;
  update regions set code = 'ZZ6' where id = v_reg;  update areas set province_code = 'QTR' where id = v_area;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wan, 'legal_lot_code', 'LOT-100-1', 'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền');
  perform pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Nhập thử test 0100', true, null)$q$,
     jsonb_build_array(base||'{"certificate_no":"RC100-001"}'::jsonb, base||'{"certificate_no":"RC100-002"}'::jsonb, base||'{"certificate_no":"RC100-003"}'::jsonb, base||'{"certificate_no":"RC100-004"}'::jsonb)::text));
  select id into v_a1 from assets where certificate_no = 'RC100-001'; select id into v_a2 from assets where certificate_no = 'RC100-002';
  select id into v_a3 from assets where certificate_no = 'RC100-003'; select id into v_a4 from assets where certificate_no = 'RC100-004';
  insert into _r values (1,'1. chuẩn bị: 4 GCN ở kho A, có kho B khác','4 | true',
    (select count(*) from assets where id in (v_a1,v_a2,v_a3,v_a4) and warehouse_id = v_wa)::text || ' | ' || (v_wa <> v_wb)::text,
    (select count(*) from assets where id in (v_a1,v_a2,v_a3,v_a4) and warehouse_id = v_wa) = 4 and v_wa <> v_wb);

  -- trigger khóa: sửa trực tiếp từ trình duyệt (role authenticated)
  o := pg_temp.act(v_admin, format($q$update assets set warehouse_id = %L where id = %L returning 1$q$, v_wb, v_a1));
  insert into _r values (2,'2. admin đổi kho TRỰC TIẾP (như nút Chuyển kho cũ): bị trigger chặn','ERR 42501', left(o,60), o like 'ERR 42501:%Không được đổi kho%' and (select warehouse_id from assets where id = v_a1) = v_wa);
  o := pg_temp.act(v_admin, format($q$update assets set warehouse_id = %L where id = %L returning 1$q$, v_wa, v_a1));
  insert into _r values (3,'3. gửi lại ĐÚNG kho cũ (form sửa GCN không đổi kho): vẫn qua','1', o, o = '1');
  o := pg_temp.act(v_admin, format($q$update assets set certificate_no = certificate_no where id = %L returning 1$q$, v_a1));
  insert into _r values (4,'4. sửa cột khác của GCN: không bị ảnh hưởng','1', o, o = '1');
  update assets set warehouse_id = v_wb where id = v_a4;  update assets set warehouse_id = v_wa where id = v_a4;
  insert into _r values (5,'5. quản trị chạy SQL trực tiếp (không qua trình duyệt) vẫn đổi được','kho A', (select name from warehouses where id = (select warehouse_id from assets where id = v_a4)), (select warehouse_id from assets where id = v_a4) = v_wa);

  -- RPC: quyền và dữ liệu vào
  update profiles set role = 'btc_manager' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], %L, 'Quản lý BTC thử sửa kho', false)$q$, v_a1, v_wb));
  insert into _r values (6,'6. btc_manager không được sửa kho không phiếu','ERR 42501', left(o,25), o like 'ERR 42501:%');
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[v_wa] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], %L, 'Quản lý kho thử sửa kho', false)$q$, v_a1, v_wb));
  insert into _r values (7,'7. warehouse_manager không được sửa kho không phiếu','ERR 42501', left(o,25), o like 'ERR 42501:%');
  update profiles set role = 'admin' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], %L, 'ngắn', false)$q$, v_a1, v_wb));
  insert into _r values (8,'8. lý do dưới 10 ký tự bị chặn','ERR 22023', left(o,25), o like 'ERR 22023:%');
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], gen_random_uuid(), 'Kho đích không tồn tại thử', false)$q$, v_a1));
  insert into _r values (9,'9. kho đích không tồn tại','ERR P0002', left(o,25), o like 'ERR P0002:%');

  -- xem trước và áp dụng
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status, ',') from correct_asset_warehouse(array[%L,%L,%L]::uuid[], %L, 'Sửa kho nhập nhầm ban đầu', false)$q$, v_a1, v_a2, v_a3, v_wb));
  insert into _r values (10,'10. xem trước 3 GCN: cả 3 "ready", chưa đổi gì','ready,ready,ready', o, o = 'ready,ready,ready' and (select count(*) from assets where id in (v_a1,v_a2,v_a3) and warehouse_id = v_wa) = 3);
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status, ',') from correct_asset_warehouse(array[%L,%L,%L]::uuid[], %L, 'Sửa kho nhập nhầm ban đầu', true)$q$, v_a1, v_a2, v_a3, v_wb));
  insert into _r values (11,'11. admin áp dụng: 3 GCN sang kho B, audit_logs 3 dòng có kho cũ/mới và lý do','applied x3 | 3',
    o || ' | ' || (select count(*) from audit_logs where action = 'correct_asset_warehouse' and record_id in (v_a1::text,v_a2::text,v_a3::text))::text,
    o = 'applied,applied,applied' and (select count(*) from assets where id in (v_a1,v_a2,v_a3) and warehouse_id = v_wb) = 3
    and (select count(*) from audit_logs where action = 'correct_asset_warehouse' and record_id in (v_a1::text,v_a2::text,v_a3::text)
         and old_data->>'warehouse_id' = v_wa::text and new_data->>'warehouse_id' = v_wb::text and notes = 'Sửa kho nhập nhầm ban đầu') = 3);
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], %L, 'Sửa kho lần nữa không đổi', true)$q$, v_a1, v_wb));
  insert into _r values (12,'12. tất cả đã ở kho đích: áp dụng bị từ chối','ERR 22023', left(o,25), o like 'ERR 22023:%Không có GCN nào%');

  -- tất cả hoặc không gì cả
  update assets set custody_status = 'in_transit' where id = v_a2;
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L,%L]::uuid[], %L, 'Sửa kho có một GCN đang luân chuyển', true)$q$, v_a2, v_a4, v_wa));
  insert into _r values (13,'13. 1 GCN in_transit trong lô: WH_BLOCKED, không GCN nào đổi','ERR 55000 WH_BLOCKED | A4 còn kho A',
    left(o,30) || ' | ' || (select name from warehouses where id = (select warehouse_id from assets where id = v_a4)),
    o like 'ERR 55000: WH_BLOCKED%' and (select warehouse_id from assets where id = v_a4) = v_wa and (select warehouse_id from assets where id = v_a2) = v_wb);
  update assets set custody_status = 'in_stock' where id = v_a2;
  insert into transactions (type, notes, created_by, warehouse_id) values ('checkout', 'Phiếu thử test 0100', v_admin, v_wa) returning id into v_tx;
  insert into transaction_items (transaction_id, asset_id, type, reason, status) values (v_tx, v_a1, 'checkout', 'mượn', 'pending');
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status || ':' || r_message, ' / ') from correct_asset_warehouse(array[%L]::uuid[], %L, 'Sửa kho khi còn phiếu chờ', false)$q$, v_a1, v_wa));
  insert into _r values (14,'14. GCN còn phiếu chờ duyệt: báo error','error:Còn phiếu chờ', left(o,50), o like 'error:Còn phiếu chờ%');
  update assets set mortgage_status = 'mortgaged' where id = v_a3;
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status, ',') from correct_asset_warehouse(array[%L]::uuid[], %L, 'Sửa kho GCN đang thế chấp', false)$q$, v_a3, v_wa));
  insert into _r values (15,'15. GCN đang thế chấp: báo error','error', o, o = 'error');
  update profiles set role = 'investor' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from correct_asset_warehouse(array[%L]::uuid[], %L, 'Nhà đầu tư thử sửa kho', false)$q$, v_a4, v_wb));
  insert into _r values (16,'16. investor bị chặn','ERR 42501', left(o,25), o like 'ERR 42501:%');
end $t$;
select n, test, expected, actual, ok from _r order by n;
rollback;