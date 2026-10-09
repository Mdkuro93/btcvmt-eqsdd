-- Test 0096 (1 khối, tự rollback). Cần cấu hình như test 0095 (dự án "Test" có vùng/địa bàn, admin@btcvmt.vn, >=1 kho).
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
  v_admin uuid; v_pname text; v_area uuid; v_reg uuid; v_wh uuid; v_wname text; base jsonb; o text; v_cnt int; v_dv int; v_tx int; v1 text; v2 text; v_e text; v_item uuid;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select p.name, p.area_id, ar.region_id into v_pname, v_area, v_reg from projects p join areas ar on ar.id = p.area_id join regions rg on rg.id = ar.region_id order by (p.name = 'Test') desc, p.name limit 1;
  perform set_config('request.jwt.claims', '', true);
  select id, name into v_wh, v_wname from warehouses order by name limit 1;
  update regions set code = 'ZZ4' where id = v_reg;  update areas set province_code = 'QTR' where id = v_area;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-96-1', 'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền', 'generate_receipt', 'Có');

  insert into _r values (1,'1. chỉ mục UNIQUE theo dòng đã gỡ; có trigger chốt chặn mức giao dịch','0|1',
    (select count(*) from pg_indexes where indexname='idx_unique_transaction_items_voucher_code') || '|' || (select count(*) from pg_trigger where tgname='trg_transaction_items_voucher_guard' and not tgisinternal),
    not exists (select 1 from pg_indexes where indexname='idx_unique_transaction_items_voucher_code') and exists (select 1 from pg_trigger where tgname='trg_transaction_items_voucher_guard' and not tgisinternal));

  o := pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Test 0096 phiếu chung', true, null) where r_result='created'$q$,
        jsonb_build_array(base||'{"certificate_no":"IMP96-001"}'::jsonb, base||'{"certificate_no":"IMP96-002"}'::jsonb, base||'{"certificate_no":"IMP96-003"}'::jsonb)::text));
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id), count(*) into v_dv, v_tx, v_cnt from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no like 'IMP96-00%' and ti.reason='cấp mới';
  insert into _r values (2,'2. nhập 3 GCN: cả 3 tạo được, chung 1 mã phiếu, 1 giao dịch, 3 dòng','3 created | 1|1|3', o||' created | '||v_dv||'|'||v_tx||'|'||v_cnt, o='3' and v_dv=1 and v_tx=1 and v_cnt=3);

  o := pg_temp.act(v_admin, format($q$select count(*) from import_assets_bulk(%L::jsonb, 'Test 0096 phiếu khác', true, null) where r_result='created'$q$, jsonb_build_array(base||'{"certificate_no":"IMP96-101"}'::jsonb)::text));
  select ti.voucher_code into v1 from transaction_items ti join assets x on x.id=ti.asset_id where x.certificate_no='IMP96-001';
  select ti.id, ti.voucher_code into v_item, v2 from transaction_items ti join assets x on x.id=ti.asset_id where x.certificate_no='IMP96-101';
  insert into _r values (3,'3. hai giao dịch có hai mã phiếu khác nhau','khác nhau', v1||' / '||v2, v1 is not null and v2 is not null and v1<>v2);

  v_e := '';
  begin update transaction_items set voucher_code = v1 where id = v_item; v_e := 'KHÔNG chặn';
  exception when unique_violation then v_e := 'unique'; end;
  insert into _r values (4,'4. gán mã phiếu của giao dịch này cho dòng thuộc giao dịch khác bị chặn','unique', v_e, v_e='unique');

  v_e := '';
  begin update transaction_items set status = status where id = v_item; v_e := 'ok'; exception when others then v_e := sqlerrm; end;
  insert into _r values (5,'5. cập nhật dòng không đụng tới mã phiếu vẫn chạy bình thường','ok', v_e, v_e='ok');
end $t$;
select n, test, expected, actual, ok from _r order by n;
rollback;
