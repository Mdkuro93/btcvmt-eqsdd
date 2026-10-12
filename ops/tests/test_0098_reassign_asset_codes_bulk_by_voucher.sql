-- Test 0098 (1 khối, tự rollback; 17 dòng). Cần: admin@btcvmt.vn, dự án "Test" (có vùng/địa bàn), >=1 kho, đã chạy 0095-0098.
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
  v_admin uuid; v_pname text; v_area uuid; v_reg uuid; v_wname text; v_wid uuid; base jsonb; o text;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid; v_v1 text; v_v2 text; v_tx1 uuid;
  v_codes text;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select p.name, p.area_id, ar.region_id into v_pname, v_area, v_reg from projects p join areas ar on ar.id = p.area_id join regions rg on rg.id = ar.region_id order by (p.name = 'Test') desc, p.name limit 1;
  perform set_config('request.jwt.claims', '', true);
  select id, name into v_wid, v_wname from warehouses order by name limit 1;
  update regions set code = 'ZZ5' where id = v_reg;  update areas set province_code = 'QTR' where id = v_area;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-98-1', 'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền', 'generate_receipt', 'Có');
  -- Phiếu 1: 3 GCN; Phiếu 2: 2 GCN (hai lần nhập riêng => hai phiếu khác nhau)
  perform pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Nhập thử test 0098 lần 1', true, null)$q$,
     jsonb_build_array(base||'{"certificate_no":"RB98-001"}'::jsonb, base||'{"certificate_no":"RB98-002"}'::jsonb, base||'{"certificate_no":"RB98-003"}'::jsonb)::text));
  perform pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Nhập thử test 0098 lần 2', true, null)$q$,
     jsonb_build_array(base||'{"certificate_no":"RB98-004"}'::jsonb, base||'{"certificate_no":"RB98-005"}'::jsonb)::text));
  select id into v_a1 from assets where certificate_no = 'RB98-001';  select id into v_a2 from assets where certificate_no = 'RB98-002';
  select id into v_a3 from assets where certificate_no = 'RB98-003';  select id into v_a4 from assets where certificate_no = 'RB98-004';
  select id into v_a5 from assets where certificate_no = 'RB98-005';
  select voucher_code, transaction_id into v_v1, v_tx1 from transaction_items where asset_id = v_a1;
  select voucher_code into v_v2 from transaction_items where asset_id = v_a4;
  insert into _r values (1,'1. chuẩn bị: phiếu 1 có 3 GCN, phiếu 2 có 2 GCN, hai mã phiếu khác nhau, mã ZZ5_QTR_BDS_','3 | 2 | khác',
    (select count(*) from transaction_items where voucher_code = v_v1)::text || ' | ' || (select count(*) from transaction_items where voucher_code = v_v2)::text || ' | ' || (v_v1 <> v_v2)::text,
    (select count(*) from transaction_items where voucher_code = v_v1) = 3 and (select count(*) from transaction_items where voucher_code = v_v2) = 2 and v_v1 <> v_v2
    and (select count(*) from assets where certificate_no like 'RB98-%' and asset_code like 'ZZ5\_QTR\_BDS\_%') = 5);

  -- cấu hình chưa đổi: tất cả đã đúng mã
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status, ',') from reassign_asset_codes_bulk(%L, 'Kiểm tra xem mã còn đúng không', null, null, false, false)$q$, v_v1));
  insert into _r values (2,'2. cấu hình chưa đổi: xem trước cả 3 GCN đều "skipped"','skipped,skipped,skipped', o, o = 'skipped,skipped,skipped');
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Áp dụng khi không có gì cần đổi', null, null, false, true)$q$, v_v1));
  insert into _r values (3,'3. áp dụng khi tất cả đã đúng mã: bị từ chối','ERR 22023', left(o,30), o like 'ERR 22023:%Không có GCN nào%');

  update areas set province_code = 'QT2' where id = v_area;   -- cấu hình mã tỉnh trước đó sai, đã sửa
  o := pg_temp.act(v_admin, format($q$select string_agg(r_status||':'||r_new_prefix, ',') from reassign_asset_codes_bulk(%L, 'Sửa mã tỉnh đã cấu hình sai', null, null, false, false)$q$, v_v1));
  insert into _r values (4,'4. xem trước phiếu 1: 3 GCN "ready", tiền tố mới ZZ5_QT2_BDS_, chưa ghi gì','3 dòng ready',
    o, o = 'ready:ZZ5_QT2_BDS_,ready:ZZ5_QT2_BDS_,ready:ZZ5_QT2_BDS_' and (select count(*) from assets where id in (v_a1,v_a2,v_a3) and asset_code like 'ZZ5\_QTR\_%') = 3);

  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'ngắn', null, null, false, true)$q$, v_v1));
  insert into _r values (5,'5. lý do dưới 10 ký tự bị chặn','ERR 22023', left(o,25), o like 'ERR 22023:%');
  o := pg_temp.act(v_admin, $q$select count(*) from reassign_asset_codes_bulk('KHONG-CO-PHIEU-NAY', 'Phiếu không tồn tại thử', null, null, false, false)$q$);
  insert into _r values (6,'6. mã phiếu không tồn tại','ERR P0002', left(o,25), o like 'ERR P0002:%');

  -- chỉ nhận phiếu nhập cấp mới
  update transaction_items set reason = 'trả' where asset_id = v_a5 and voucher_code = v_v2;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Phiếu lẫn dòng khác lý do', null, null, false, false)$q$, v_v2));
  insert into _r values (7,'7. phiếu có dòng không phải "cấp mới": bị từ chối','ERR 22023 ... không phải phiếu nhập cấp mới', left(o,70), o like 'ERR 22023:%không phải phiếu nhập cấp mới%');
  update transaction_items set reason = 'cấp mới' where asset_id = v_a5 and voucher_code = v_v2;

  -- quản lý kho
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[gen_random_uuid()] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Quản lý kho thử tái cấp phiếu', null, null, false, true)$q$, v_v1));
  insert into _r values (8,'8. quản lý kho KHÔNG phụ trách kho của phiếu: bị chặn cả phiếu','ERR 42501 ... ngoài kho bạn phụ trách', left(o,70), o like 'ERR 42501:%ngoài kho bạn phụ trách%');

  update profiles set managed_warehouse_ids = array[v_wid] where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select string_agg(r_new_code, ',' order by r_new_code) from reassign_asset_codes_bulk(%L, 'Sửa mã tỉnh đã cấu hình sai', null, null, false, true)$q$, v_v1));
  insert into _r values (9,'9. quản lý kho đúng kho: tái cấp cả phiếu 1, mã mới 00000001..00000003','ZZ5_QT2_BDS_00000001,..02,..03', o,
    o = 'ZZ5_QT2_BDS_00000001,ZZ5_QT2_BDS_00000002,ZZ5_QT2_BDS_00000003'
    and (select count(*) from assets where id in (v_a1,v_a2,v_a3) and asset_code like 'ZZ5\_QT2\_BDS\_%' and cardinality(former_asset_codes) = 1) = 3);
  insert into _r values (10,'10. phiếu 2 KHÔNG bị đụng (chỉ đúng phiếu được chọn)','2 GCN còn mã ZZ5_QTR_',
    (select count(*) from assets where id in (v_a4,v_a5) and asset_code like 'ZZ5\_QTR\_%')::text,
    (select count(*) from assets where id in (v_a4,v_a5) and asset_code like 'ZZ5\_QTR\_%') = 2);
  insert into _r values (11,'11. asset_code_history: 3 dòng, lý do ghi kèm "[Tái cấp theo phiếu ...]", vai trò warehouse_manager','3',
    (select count(*) from asset_code_history where asset_id in (v_a1,v_a2,v_a3))::text,
    (select count(*) from asset_code_history h where h.asset_id in (v_a1,v_a2,v_a3) and h.reason = '[Tái cấp theo phiếu ' || v_v1 || '] Sửa mã tỉnh đã cấu hình sai' and h.changed_by_role = 'warehouse_manager' and h.had_history = false) = 3);
  insert into _r values (12,'12. audit_logs: 1 dòng tổng hợp reassign_asset_codes_bulk (3 GCN) + 3 dòng từng GCN','1 + 3',
    (select count(*) from audit_logs where record_id = v_tx1::text and action = 'reassign_asset_codes_bulk')::text || ' + ' || (select count(*) from audit_logs where record_id in (v_a1::text,v_a2::text,v_a3::text) and action = 'reassign_asset_code')::text,
    (select count(*) from audit_logs where record_id = v_tx1::text and action = 'reassign_asset_codes_bulk' and (new_data->>'reassigned')::int = 3) = 1
    and (select count(*) from audit_logs where record_id in (v_a1::text,v_a2::text,v_a3::text) and action = 'reassign_asset_code') = 3);

  -- tất cả hoặc không gì cả: 1 GCN đang luân chuyển chặn cả phiếu 2
  update assets set custody_status = 'in_transit' where id = v_a4;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Sửa mã tỉnh phiếu hai', null, null, false, true)$q$, v_v2));
  insert into _r values (13,'13. phiếu 2 có 1 GCN in_transit: áp dụng bị chặn BULK_BLOCKED, KHÔNG GCN nào đổi, không có lịch sử mới','ERR 55000 BULK_BLOCKED | 0 dòng lịch sử',
    left(o,40) || ' | ' || (select count(*) from asset_code_history where asset_id in (v_a4,v_a5))::text,
    o like 'ERR 55000: BULK_BLOCKED%' and (select count(*) from assets where id in (v_a4,v_a5) and asset_code like 'ZZ5\_QTR\_%') = 2
    and (select count(*) from asset_code_history where asset_id in (v_a4,v_a5)) = 0);
  update assets set custody_status = 'in_stock' where id = v_a4;

  -- GCN có lịch sử (đã xuất kho) trong phiếu: quản lý kho bị chặn; admin cần xác nhận
  update assets set custody_status = 'checked_out' where id = v_a5;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Quản lý kho thử phiếu có lịch sử', null, null, true, true)$q$, v_v2));
  insert into _r values (14,'14. quản lý kho + phiếu có GCN đã phát sinh lịch sử: bị chặn (chỉ quản trị viên)','ERR 55000 BULK_BLOCKED ... quản trị', left(o,60), o like 'ERR 55000: BULK_BLOCKED%quản trị%');
  update profiles set role = 'admin' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Admin tái cấp phiếu có lịch sử', null, null, false, true)$q$, v_v2));
  insert into _r values (15,'15. admin chưa xác nhận lịch sử: bị chặn HISTORY_UNCONFIRMED','ERR 22023 HISTORY_UNCONFIRMED', left(o,40), o like 'ERR 22023: HISTORY_UNCONFIRMED%');
  o := pg_temp.act(v_admin, format($q$select string_agg(r_new_code, ',' order by r_new_code) from reassign_asset_codes_bulk(%L, 'Admin tái cấp phiếu có lịch sử', null, null, true, true)$q$, v_v2));
  insert into _r values (16,'16. admin xác nhận: tái cấp cả phiếu 2, mã tiếp theo 00000004, 00000005; GCN có lịch sử ghi had_history=true','ZZ5_QT2_BDS_00000004,..05 | 1 dòng had_history', o || ' | ' || (select count(*) from asset_code_history where asset_id in (v_a4,v_a5) and had_history)::text,
    o = 'ZZ5_QT2_BDS_00000004,ZZ5_QT2_BDS_00000005' and (select count(*) from asset_code_history where asset_id = v_a5 and had_history) = 1 and (select count(*) from asset_code_history where asset_id = v_a4 and not had_history) = 1);

  -- vai trò không được phép
  update profiles set role = 'investor' where id = v_admin;
  o := pg_temp.act(v_admin, format($q$select count(*) from reassign_asset_codes_bulk(%L, 'Nhà đầu tư thử tái cấp', null, null, false, false)$q$, v_v1));
  insert into _r values (17,'17. vai trò không có quyền (investor) bị chặn','ERR 42501', left(o,25), o like 'ERR 42501:%');
end $t$;
select n, test, expected, actual, ok from _r order by n;
rollback;