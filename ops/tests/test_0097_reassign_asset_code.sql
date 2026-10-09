-- Test 0097 (1 khối, tự rollback; 16 dòng). Cần: admin@btcvmt.vn, dự án "Test" (có vùng/địa bàn), >=1 kho.
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
  v_admin uuid; v_pname text; v_area uuid; v_reg uuid; v_wname text; base jsonb; v_a1 uuid; v_a2 uuid; v_c1 text; v_c2 text; o text; v_fc text[];
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select p.name, p.area_id, ar.region_id into v_pname, v_area, v_reg from projects p join areas ar on ar.id = p.area_id join regions rg on rg.id = ar.region_id order by (p.name = 'Test') desc, p.name limit 1;
  perform set_config('request.jwt.claims', '', true);
  select name into v_wname from warehouses order by name limit 1;
  update regions set code = 'ZZ4' where id = v_reg;  update areas set province_code = 'QTR' where id = v_area;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-97-1', 'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền');
  -- tồn đầu kỳ (không phiếu) và một GCN đã thế chấp
  perform pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Nhập thử test 0097', true, null)$q$,
     jsonb_build_array(base||'{"certificate_no":"RA97-001"}'::jsonb, base||'{"certificate_no":"RA97-002","mortgage_bank":"Ngân hàng thử"}'::jsonb)::text));
  select id, asset_code into v_a1, v_c1 from assets where certificate_no = 'RA97-001';
  select id into v_a2 from assets where certificate_no = 'RA97-002';
  insert into _r values (1,'1. chuẩn bị: 2 GCN, mã ZZ4_QTR_BDS_...','2 mã đúng tiền tố', v_c1, v_c1 like 'ZZ4\_QTR\_BDS\_%' and v_a2 is not null);

  o := pg_temp.act(v_admin, format($q$select r_applied::text from reassign_asset_code(%L::uuid, 'Kiểm tra xem mã còn đúng không', null, null, false, false)$q$, v_a1));
  insert into _r values (2,'2. cấu hình chưa đổi: mã đã đúng, không cần tái cấp','ERR 22023', left(o,45), o like 'ERR 22023:%đã đúng%');

  update areas set province_code = 'QT2' where id = v_area;   -- giả lập: cấu hình mã tỉnh trước đó sai, đã sửa
  o := pg_temp.act(v_admin, format($q$select r_new_prefix||'|'||r_has_history::text||'|'||r_requires_confirm::text||'|'||r_applied::text||'|'||coalesce(r_new_code,'null') from reassign_asset_code(%L::uuid, 'Sửa mã tỉnh đã cấu hình sai', null, null, false, false)$q$, v_a1));
  insert into _r values (3,'3. xem trước (không ghi): tiền tố mới ZZ4_QT2_BDS_, không có lịch sử, chưa áp dụng','ZZ4_QT2_BDS_|false|false|false|null', o, o = 'ZZ4_QT2_BDS_|false|false|false|null' and (select asset_code from assets where id = v_a1) = v_c1);

  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'ngắn', null, null, false, true)$q$, v_a1));
  insert into _r values (4,'4. lý do dưới 10 ký tự bị chặn','ERR 22023', left(o,25), o like 'ERR 22023:%');

  -- quản lý kho: ngoài phạm vi bị chặn; đúng kho mình phụ trách thì được
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[gen_random_uuid()] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'Quản lý kho thử tái cấp mã', null, null, false, true)$q$, v_a1));
  insert into _r values (5,'5. quản lý kho KHÔNG phụ trách kho của GCN: bị chặn','ERR 42501 ... kho mình phụ trách', left(o,60), o like 'ERR 42501:%kho mình phụ trách%');

  update profiles set managed_warehouse_ids = array[(select warehouse_id from assets where id = v_a1)] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select r_new_code from reassign_asset_code(%L::uuid, 'Sửa mã tỉnh đã cấu hình sai', null, null, false, true)$q$, v_a1));
  select asset_code, former_asset_codes into v_c2, v_fc from assets where id = v_a1;
  insert into _r values (6,'6. quản lý kho phụ trách kho của GCN (chưa có lịch sử): tái cấp được; mã mới ZZ4_QT2_BDS_00000001, mã cũ lưu former_asset_codes','ZZ4_QT2_BDS_00000001 | cũ lưu',
     coalesce(v_c2,'null') || ' | ' || coalesce(v_fc::text,'null'), v_c2 = 'ZZ4_QT2_BDS_00000001' and o = v_c2 and v_fc = array[v_c1]);
  insert into _r values (7,'7. đã ghi audit_logs (mã cũ -> mã mới, lý do)','1 dòng',
     (select count(*) from audit_logs where record_id = v_a1::text and action = 'reassign_asset_code')::text,
     (select count(*) from audit_logs where record_id = v_a1::text and action = 'reassign_asset_code' and old_data->>'asset_code' = v_c1 and new_data->>'asset_code' = v_c2 and notes = 'Sửa mã tỉnh đã cấu hình sai') = 1);

  insert into _r values (15,'7b. bảng asset_code_history: 1 dòng đủ mã cũ/mới, dự án, loại, kho, người làm, vai trò, lý do, thời điểm','1 dòng đủ trường',
     (select count(*) from asset_code_history where asset_id = v_a1)::text,
     (select count(*) from asset_code_history h where h.asset_id = v_a1 and h.old_code = v_c1 and h.new_code = v_c2 and h.old_project_id is not null and h.new_project_id is not null
        and h.old_collateral_type = 'BDS' and h.new_collateral_type = 'BDS' and h.warehouse_id is not null and h.had_history = false
        and h.reason = 'Sửa mã tỉnh đã cấu hình sai' and h.changed_by = v_admin and h.changed_by_role = 'warehouse_manager' and h.changed_at is not null) = 1);

  -- GCN đã thế chấp = có lịch sử
  update profiles set role = 'btc_manager' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'Tái cấp mã GCN đã thế chấp', null, null, true, true)$q$, v_a2));
  insert into _r values (8,'8. GCN đã thế chấp (có lịch sử): btc_manager bị chặn, chỉ quản trị viên','ERR 42501', left(o,25), o like 'ERR 42501:%');
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[(select warehouse_id from assets where id = v_a2)] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'Tái cấp mã GCN đã thế chấp', null, null, true, true)$q$, v_a2));
  insert into _r values (16,'8b. quản lý kho đúng kho nhưng GCN có lịch sử: bị chặn, chỉ quản trị viên','ERR 42501', left(o,25), o like 'ERR 42501:%');
  update profiles set role = 'admin' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select r_requires_confirm::text from reassign_asset_code(%L::uuid, 'Tái cấp mã GCN đã thế chấp', null, null, false, false)$q$, v_a2));
  insert into _r values (9,'9. admin xem trước GCN có lịch sử: yêu cầu xác nhận','true', o, o = 'true');
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'Tái cấp mã GCN đã thế chấp', null, null, false, true)$q$, v_a2));
  insert into _r values (10,'10. admin áp dụng khi chưa xác nhận lịch sử: bị chặn HISTORY_UNCONFIRMED','ERR 22023', left(o,45), o like 'ERR 22023: HISTORY_UNCONFIRMED%');
  o := pg_temp.act(v_admin, format($q$select r_new_code from reassign_asset_code(%L::uuid, 'Tái cấp mã GCN đã thế chấp', null, null, true, true)$q$, v_a2));
  insert into _r values (11,'11. admin xác nhận lịch sử: tái cấp được, mã mới là số kế tiếp','ZZ4_QT2_BDS_00000002', o, o = 'ZZ4_QT2_BDS_00000002');

  -- đổi loại tài sản
  o := pg_temp.act(v_admin, format($q$select r_new_code from reassign_asset_code(%L::uuid, 'Sửa loại tài sản nhập nhầm', null, 'tscd', true, true)$q$, v_a1));
  insert into _r values (12,'12. đổi loại tài sản BDS -> TSCD: mã mới ZZ4_QT2_TSCD_00000001, cột collateral_type cập nhật','ZZ4_QT2_TSCD_00000001 | TSCD', o || ' | ' || (select collateral_type from assets where id = v_a1), o = 'ZZ4_QT2_TSCD_00000001' and (select collateral_type from assets where id = v_a1) = 'TSCD');

  -- mã cũ không bao giờ cấp lại
  o := pg_temp.act(v_admin, $q$select allocate_asset_code('ZZ4_QTR_BDS_')$q$);
  insert into _r values (13,'13. mã cũ không được cấp lại: bộ đếm tiền tố cũ vẫn đi tiếp (01 và 02 đã dùng, kế tiếp 03)','ZZ4_QTR_BDS_00000003', o, o = 'ZZ4_QTR_BDS_00000003');

  -- đang luân chuyển bị chặn
  update assets set custody_status = 'in_transit' where id = v_a1;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_code(%L::uuid, 'Tái cấp mã khi đang luân chuyển', null, 'BDS', true, true)$q$, v_a1));
  insert into _r values (14,'14. GCN đang in_transit bị chặn','ERR 55000', left(o,25), o like 'ERR 55000:%');
end $t$;
select n, test, expected, actual, ok from _r order by n;
rollback;
