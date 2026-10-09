-- Test 0095 (1 khối, tự rollback). Cần: admin@btcvmt.vn, >=1 dự án có địa bàn và vùng (dự án "Test" là phù hợp nhất), >=1 kho.
-- Tự đặt mã vùng/mã tỉnh cho dữ liệu thử TRONG giao dịch rồi rollback. Kết quả: n, test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;

create or replace function pg_temp.act(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v;
  exception when others then v := 'ERR ' || sqlstate || ': ' || sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, '');
end $f$;

create or replace function pg_temp.imp(p_uid uuid, p_rows jsonb, p_reason text, p_apply boolean, p_batch uuid) returns text language plpgsql as $f$
begin
  return pg_temp.act(p_uid, format($q$select string_agg(r_row||':'||r_result||':'||coalesce(r_message,'')||'#'||coalesce(r_asset_code,'')||'#'||coalesce(r_voucher,''), ' || ' order by r_row) from import_assets_bulk(%L::jsonb, %L, %s, %L::uuid)$q$, p_rows::text, p_reason, p_apply::text, p_batch));
end $f$;

do $t$
declare
  v_admin uuid; v_proj uuid; v_pname text; v_area uuid; v_reg uuid; v_src uuid; v_tgt uuid; v_wname text; v_tname text;
  base jsonb; o text; b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  v_cnt int; v_dv int; v_tx int; v_v1 text; v_v2 text; v_code text; v_code2 text; v_other uuid; v_e text; v_ok boolean;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select p.id, p.name, p.area_id, ar.region_id into v_proj, v_pname, v_area, v_reg
  from projects p join areas ar on ar.id = p.area_id join regions rg on rg.id = ar.region_id
  order by (p.name = 'Test') desc, p.name limit 1;
  if v_admin is null or v_proj is null then insert into _r values (0,'chuẩn bị','admin + 1 dự án có địa bàn/vùng','thiếu',false); return; end if;
  perform set_config('request.jwt.claims', '', true);
  select id into v_src from warehouses order by name limit 1;
  select id into v_tgt from warehouses where id <> v_src order by name limit 1;
  if v_tgt is null then
    begin insert into warehouses (name) values ('KHO TEST 0095 B') returning id into v_tgt;
    exception when others then insert into _r values (0,'chuẩn bị: cần 2 kho','có 2 kho','không tạo được kho tạm: '||sqlerrm,false); return; end;
  end if;
  select name into v_wname from warehouses where id = v_src;
  select name into v_tname from warehouses where id = v_tgt;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-95-1',
                             'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền');

  -- 1. hàm cũ suy mã từ tên đã bị xóa; allocate_asset_code không còn nhập nhằng
  insert into _r values (1,'1. đã xóa _region_code_from_name/_province_code_from_name; chỉ còn 2 bản allocate_asset_code (1 và 3 tham số, không mặc định)',
    'null|null|2|0 mặc định',
    coalesce(to_regprocedure('public._region_code_from_name(text)')::text,'null') || '|' || coalesce(to_regprocedure('public._province_code_from_name(text)')::text,'null') || '|' ||
      (select count(*) from pg_proc where proname='allocate_asset_code' and pronamespace='public'::regnamespace) || '|' ||
      (select coalesce(sum(pronargdefaults),0) from pg_proc where proname='allocate_asset_code' and pronamespace='public'::regnamespace) || ' mặc định',
    to_regprocedure('public._region_code_from_name(text)') is null and to_regprocedure('public._province_code_from_name(text)') is null
      and (select count(*) from pg_proc where proname='allocate_asset_code' and pronamespace='public'::regnamespace) = 2
      and (select coalesce(sum(pronargdefaults),0) from pg_proc where proname='allocate_asset_code' and pronamespace='public'::regnamespace) = 0);

  -- 2. cột regions.code: chuẩn hóa in hoa, CHECK định dạng, UNIQUE
  update regions set code = ' zz4 ' where id = v_reg;
  select code into v_code from regions where id = v_reg;
  insert into _r values (2,'2a. đặt mã vùng " zz4 " -> tự chuẩn hóa ZZ4','ZZ4', v_code, v_code = 'ZZ4');
  v_e := '';
  begin update regions set code = 'a' where id = v_reg; exception when check_violation then v_e := 'check'; end;
  insert into _r values (3,'2b. mã vùng sai định dạng (1 ký tự) bị CHECK chặn','check', v_e, v_e = 'check');
  select id into v_other from regions where id <> v_reg order by name limit 1;
  if v_other is null then
    insert into _r values (4,'2c. mã vùng trùng bị UNIQUE chặn (bỏ qua: chỉ có 1 vùng)','bỏ qua','bỏ qua',true);
  else
    v_e := '';
    begin update regions set code = 'ZZ4' where id = v_other; exception when unique_violation then v_e := 'unique'; end;
    insert into _r values (4,'2c. mã vùng trùng bị UNIQUE chặn','unique', v_e, v_e = 'unique');
  end if;

  -- 3. thiếu mã vùng -> lỗi chỉ chỗ cấu hình, không mặc định
  update regions set code = null where id = v_reg;
  update areas set province_code = 'QTR' where id = v_area;
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-001"}'::jsonb), null, false, null);
  insert into _r values (5,'3. vùng chưa có mã: lỗi "chưa có mã vùng ... Danh mục > Vùng"','1:error:Vùng "..." chưa có mã vùng', left(o,150), o like '1:error:Vùng "%" chưa có mã vùng: cấu hình tại Danh mục > Vùng.%');

  -- 4. thiếu mã tỉnh
  update regions set code = 'ZZ4' where id = v_reg;
  update areas set province_code = null where id = v_area;
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-002"}'::jsonb), null, false, null);
  insert into _r values (6,'4. địa bàn chưa có mã tỉnh: lỗi "chưa có mã tỉnh ... Danh mục > Địa bàn"','1:error:Địa bàn "..." chưa có mã tỉnh', left(o,150), o like '1:error:Địa bàn "%" chưa có mã tỉnh: cấu hình tại Danh mục > Địa bàn.%');

  -- 5. cấu hình đủ: vùng thứ 4 (mã tự đặt ZZ4), tên vùng KHÔNG ảnh hưởng
  update areas set province_code = 'QTR' where id = v_area;
  update regions set name = 'Miền Bắc (tên chỉ để hiển thị)' where id = v_reg;
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-101"}'::jsonb), 'Nhập thử mã theo cấu hình 0095', true, null);
  select asset_code into v_code from assets where certificate_no = 'IMP95-101';
  insert into _r values (7,'5. vùng tự đặt mã ZZ4 (tên vùng chứa "Bắc" vẫn không suy VMB): ZZ4_QTR_BDS_xxxxxxxx','ZZ4_QTR_BDS_xxxxxxxx', coalesce(v_code,'null') || ' | ' || left(o,70), v_code ~ '^ZZ4_QTR_BDS_[0-9]{8}$');

  -- 6. đổi cấu hình -> mã mới theo tiền tố mới; mã cũ giữ nguyên
  update regions set code = 'ZZ5' where id = v_reg;
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-102"}'::jsonb), 'Nhập thử đổi mã vùng 0095', true, null);
  select asset_code into v_code2 from assets where certificate_no = 'IMP95-102';
  insert into _r values (8,'6. đổi mã vùng sang ZZ5: GCN mới mang ZZ5_QTR_BDS_00000001; GCN cũ giữ ZZ4_...','ZZ5_QTR_BDS_00000001 | ZZ4_QTR_BDS_00000001', coalesce(v_code2,'null') || ' | ' || (select asset_code from assets where certificate_no='IMP95-101'),
    v_code2 = 'ZZ5_QTR_BDS_00000001' and (select asset_code from assets where certificate_no='IMP95-101') = v_code);
  update regions set code = 'ZZ4' where id = v_reg;

  -- 7. allocate_asset_code gọi trực tiếp (không còn "is not unique")
  v_e := pg_temp.act(v_admin, $q$select allocate_asset_code('ZZ4_QTR_BDS_')$q$);
  insert into _r values (9,'7a. allocate_asset_code(prefix) chạy được, kế tiếp ZZ4_QTR_BDS_00000002','ZZ4_QTR_BDS_00000002', v_e, v_e = 'ZZ4_QTR_BDS_00000002');
  v_e := pg_temp.act(v_admin, $q$select allocate_asset_code('ZZ4','QTR','BDS')$q$);
  insert into _r values (10,'7b. allocate_asset_code(vùng,tỉnh,loại) cùng bộ đếm: 00000003','ZZ4_QTR_BDS_00000003', v_e, v_e = 'ZZ4_QTR_BDS_00000003');
  v_e := pg_temp.act(v_admin, $q$select allocate_asset_code('ZZ4','','BDS')$q$);
  insert into _r values (11,'7c. thiếu mã tỉnh: báo lỗi, không dùng DNG mặc định','ERR 22023', left(v_e,60), v_e like 'ERR 22023:%');
  v_e := pg_temp.act(v_admin, $q$select allocate_asset_code('SAI')$q$);
  insert into _r values (12,'7d. tiền tố sai định dạng: báo lỗi','ERR 22023', left(v_e,60), v_e like 'ERR 22023:%');

  -- 8. một phiếu nhập chung, batch, hai kho, không phiếu
  o := pg_temp.imp(v_admin, jsonb_build_array(
        base || '{"certificate_no":"IMP95-201","generate_receipt":"Có"}'::jsonb,
        base || '{"certificate_no":"IMP95-202","generate_receipt":"Có"}'::jsonb,
        base || '{"certificate_no":"IMP95-203","generate_receipt":"Có"}'::jsonb), 'Nhập 3 GCN một phiếu 0095', true, null);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id), count(*) into v_dv, v_tx, v_cnt
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP95-201','IMP95-202','IMP95-203') and ti.reason = 'cấp mới';
  insert into _r values (13,'8a. 3 GCN cùng đợt: CHUNG 1 mã phiếu, 1 giao dịch, 3 dòng','1 mã | 1 giao dịch | 3 dòng', v_dv || ' mã | ' || v_tx || ' giao dịch | ' || v_cnt || ' dòng', v_dv = 1 and v_tx = 1 and v_cnt = 3);

  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-301","generate_receipt":"Có"}'::jsonb, base || '{"certificate_no":"IMP95-302","generate_receipt":"Có"}'::jsonb), 'Lô 1 đợt nhập 0095', true, b1);
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-303","generate_receipt":"Có"}'::jsonb), 'Lô 2 đợt nhập 0095', true, b1);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id), count(*) into v_dv, v_tx, v_cnt
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP95-301','IMP95-302','IMP95-303') and ti.reason = 'cấp mới';
  insert into _r values (14,'8b. 2 lần gọi cùng batch: 3 GCN chung 1 phiếu','1 mã | 1 giao dịch | 3 dòng', v_dv || ' mã | ' || v_tx || ' giao dịch | ' || v_cnt || ' dòng', v_dv = 1 and v_tx = 1 and v_cnt = 3);
  select max(ti.voucher_code) into v_v1 from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP95-301' and ti.reason = 'cấp mới';
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-401","generate_receipt":"Có"}'::jsonb), 'Đợt nhập khác 0095', true, b2);
  select max(ti.voucher_code) into v_v2 from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP95-401' and ti.reason = 'cấp mới';
  insert into _r values (15,'8c. batch khác: phiếu nhập mới (mã khác)','2 mã khác nhau', coalesce(v_v1,'null') || ' / ' || coalesce(v_v2,'null'), v_v1 is not null and v_v2 is not null and v_v1 <> v_v2);

  o := pg_temp.imp(v_admin, jsonb_build_array(
        base || '{"certificate_no":"IMP95-501","generate_receipt":"Có"}'::jsonb,
        (base || jsonb_build_object('warehouse_name', v_tname)) || '{"certificate_no":"IMP95-502","generate_receipt":"Có"}'::jsonb), 'Đợt nhập hai kho 0095', true, null);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id) into v_dv, v_tx
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP95-501','IMP95-502') and ti.reason = 'cấp mới';
  insert into _r values (16,'8d. đợt nhập hai kho: mỗi kho một phiếu','2 mã | 2 giao dịch', v_dv || ' mã | ' || v_tx || ' giao dịch', v_dv = 2 and v_tx = 2);

  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-601","generate_receipt":"Không"}'::jsonb), 'Tồn đầu kỳ 0095', true, null);
  select count(*) into v_cnt from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP95-601';
  insert into _r values (17,'8e. generate_receipt = Không: không có phiếu','0 dòng phiếu', v_cnt || ' dòng phiếu', v_cnt = 0 and o like '1:created:%');

  -- 9. GCN đã thế chấp: đã xuất thế chấp, không ở kho, không phiếu
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-701","mortgage_bank":"Ngân hàng thử"}'::jsonb), 'Nhập GCN đã thế chấp 0095', true, null);
  insert into _r values (18,'9. GCN thế chấp: checked_out + mortgaged, không phiếu','checked_out|mortgaged|0',
    (select custody_status||'|'||mortgage_status from assets where certificate_no='IMP95-701') || '|' || (select count(*) from transaction_items ti join assets x on x.id=ti.asset_id where x.certificate_no='IMP95-701'),
    (select custody_status = 'checked_out' and mortgage_status = 'mortgaged' from assets where certificate_no='IMP95-701')
      and not exists (select 1 from transaction_items ti join assets x on x.id=ti.asset_id where x.certificate_no='IMP95-701'));

  -- 10. trùng số GCN cần xác nhận
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP95-101"}'::jsonb), null, false, null);
  insert into _r values (19,'10. trùng số GCN không có lý do: DUPLICATE_UNCONFIRMED','1:error:DUPLICATE_UNCONFIRMED', left(o,80), o like '1:error:DUPLICATE_UNCONFIRMED%');
end
$t$;

select n, test, expected, actual, ok from _r order by n;
rollback;
