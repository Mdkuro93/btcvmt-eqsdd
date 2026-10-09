-- Test 0093 (1 khối, tự rollback). Cần: admin@btcvmt.vn, >=1 GCN có dự án (dự án có địa bàn và vùng). Dùng 2 kho (tự tạo kho tạm nếu chỉ có 1).
-- Kết quả: test, expected, actual, ok
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
  v_admin uuid; a uuid; v_proj uuid; src uuid; tgt uuid; v_pname text; v_wname text; v_tname text; v_area uuid; v_aname0 text;
  v_rname text; v_rcode text; v_pcode text; base jsonb; o text; b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  v_cnt int; v_dv int; v_tx int; v_v1 text; v_v2 text; v_code text; v_alt uuid;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select a1.id, a1.project_id, a1.warehouse_id, p.name, p.area_id into a, v_proj, src, v_pname, v_area
  from assets a1 join projects p on p.id = a1.project_id order by a1.created_at limit 1;
  if v_admin is null or a is null then insert into _r values (0,'chuẩn bị','admin + 1 GCN có dự án','thiếu',false); return; end if;
  perform set_config('request.jwt.claims', '', true);
  if src is null then select id into src from warehouses order by created_at limit 1; end if;
  select id into tgt from warehouses where id <> src order by created_at limit 1;
  if tgt is null then
    begin insert into warehouses (name) values ('KHO TEST 0093 B') returning id into tgt;
    exception when others then insert into _r values (0,'chuẩn bị: cần 2 kho','có 2 kho','không tạo được kho tạm: '||sqlerrm,false); return; end;
  end if;
  select name into v_wname from warehouses where id = src;
  select name into v_tname from warehouses where id = tgt;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-93-1',
                             'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền');
  select ar.name, rg.name into v_aname0, v_rname from areas ar join regions rg on rg.id = ar.region_id where ar.id = v_area;
  v_rcode := public._region_code_from_name(v_rname);

  -- 1. hàm quy chiếu mã tỉnh/vùng
  insert into _r values (1,'1. quy chiếu: Đà Nẵng→DNG, TP. Hồ Chí Minh→HCM, Quảng Trị→QTR, tên lạ→NULL; Miền Trung→VMT, Miền Bắc→VMB, Miền Nam→VMN',
    'DNG|HCM|QTR|NULL|VMT|VMB|VMN',
    coalesce(public._province_code_from_name('Đà Nẵng'),'NULL') || '|' || coalesce(public._province_code_from_name('TP. Hồ Chí Minh'),'NULL') || '|' || coalesce(public._province_code_from_name('quảng  trị'),'NULL') || '|' || coalesce(public._province_code_from_name('Khu vực lạ'),'NULL') || '|' ||
    coalesce(public._region_code_from_name('Miền Trung'),'NULL') || '|' || coalesce(public._region_code_from_name('Miền Bắc'),'NULL') || '|' || coalesce(public._region_code_from_name('Miền Nam'),'NULL'),
    public._province_code_from_name('Đà Nẵng') = 'DNG' and public._province_code_from_name('TP. Hồ Chí Minh') = 'HCM' and public._province_code_from_name('quảng  trị') = 'QTR'
      and public._province_code_from_name('Khu vực lạ') is null and public._region_code_from_name('Miền Trung') = 'VMT' and public._region_code_from_name('Miền Bắc') = 'VMB' and public._region_code_from_name('Miền Nam') = 'VMN');

  -- 2. mã tài sản theo tỉnh của dự án (đặt địa bàn = Quảng Trị)
  begin
    update areas set name = 'Quảng Trị' where id = v_area;
  exception when unique_violation then
    select id into v_alt from areas where name = 'Quảng Trị' and region_id = (select region_id from areas where id = v_area);
    update projects set area_id = v_alt where id = v_proj;
  end;
  select area_id into v_area from projects where id = v_proj;
  if v_rcode is null then
    insert into _r values (2,'2. mã tài sản theo dự án (bỏ qua: vùng của dự án "'||coalesce(v_rname,'null')||'" chưa chuẩn Miền Bắc/Trung/Nam)','bỏ qua','bỏ qua',true);
  else
    o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-001"}'::jsonb), 'Nhập thử mã theo dự án 0093', true, null);
    select asset_code into v_code from assets where certificate_no = 'IMP93-001';
    insert into _r values (2,'2. mã tài sản theo dự án: <vùng dự án>_QTR_BDS_…, không dùng mặc định', v_rcode || '_QTR_BDS_xxxxxxxx', coalesce(v_code,'null') || ' | ' || left(o,60),
      v_code ~ ('^' || v_rcode || '_QTR_BDS_[0-9]{8}$'));
  end if;

  -- 3. địa bàn không trùng tên tỉnh: lỗi rõ ràng, không đoán
  update areas set name = 'Khu vực không có mã tỉnh' where id = v_area;
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-002"}'::jsonb), null, false, null);
  insert into _r values (3,'3. địa bàn không phải tên tỉnh: báo lỗi, không sinh mã mặc định','1:error ... mã tỉnh', left(o,170), o like '1:error:Không xác định được mã tỉnh%' or (v_rcode is null and o like '1:error:Không xác định được mã vùng%'));
  update areas set name = 'Quảng Trị' where id = v_area;

  -- 4. một phiếu nhập chung cho 3 GCN trong cùng một lần
  o := pg_temp.imp(v_admin, jsonb_build_array(
        base || '{"certificate_no":"IMP93-101","generate_receipt":"Có"}'::jsonb,
        base || '{"certificate_no":"IMP93-102","generate_receipt":"Có"}'::jsonb,
        base || '{"certificate_no":"IMP93-103","generate_receipt":"Có"}'::jsonb), 'Nhập 3 GCN một phiếu 0093', true, null);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id), count(*) into v_dv, v_tx, v_cnt
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP93-101','IMP93-102','IMP93-103') and ti.reason = 'cấp mới';
  insert into _r values (4,'4. 3 GCN cùng đợt: CHUNG 1 mã phiếu, 1 giao dịch, 3 dòng phiếu','1 mã | 1 giao dịch | 3 dòng', v_dv || ' mã | ' || v_tx || ' giao dịch | ' || v_cnt || ' dòng', v_dv = 1 and v_tx = 1 and v_cnt = 3 and (select count(*) from regexp_matches(o, 'created', 'g')) = 3);

  -- 5. nhiều lần gọi cùng p_batch_id (chia lô) vẫn chung một phiếu; khác batch thì phiếu mới
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-201","generate_receipt":"Có"}'::jsonb, base || '{"certificate_no":"IMP93-202","generate_receipt":"Có"}'::jsonb), 'Lô 1 đợt nhập 0093', true, b1);
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-203","generate_receipt":"Có"}'::jsonb, base || '{"certificate_no":"IMP93-204","generate_receipt":"Có"}'::jsonb), 'Lô 2 đợt nhập 0093', true, b1);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id), count(*) into v_dv, v_tx, v_cnt
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP93-201','IMP93-202','IMP93-203','IMP93-204') and ti.reason = 'cấp mới';
  insert into _r values (5,'5a. 2 lần gọi cùng batch: 4 GCN chung 1 phiếu','1 mã | 1 giao dịch | 4 dòng', v_dv || ' mã | ' || v_tx || ' giao dịch | ' || v_cnt || ' dòng', v_dv = 1 and v_tx = 1 and v_cnt = 4);
  select max(ti.voucher_code) into v_v1 from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP93-201' and ti.reason = 'cấp mới';
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-301","generate_receipt":"Có"}'::jsonb), 'Đợt nhập khác 0093', true, b2);
  select max(ti.voucher_code) into v_v2 from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP93-301' and ti.reason = 'cấp mới';
  insert into _r values (6,'5b. batch khác: phiếu nhập mới (mã khác)','2 mã khác nhau', coalesce(v_v1,'null') || ' / ' || coalesce(v_v2,'null'), v_v1 is not null and v_v2 is not null and v_v1 <> v_v2);

  -- 6. đợt nhập nhiều kho: mỗi kho một phiếu
  o := pg_temp.imp(v_admin, jsonb_build_array(
        base || '{"certificate_no":"IMP93-401","generate_receipt":"Có"}'::jsonb,
        (base || jsonb_build_object('warehouse_name', v_tname)) || '{"certificate_no":"IMP93-402","generate_receipt":"Có"}'::jsonb), 'Đợt nhập hai kho 0093', true, null);
  select count(distinct ti.voucher_code), count(distinct ti.transaction_id) into v_dv, v_tx
  from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no in ('IMP93-401','IMP93-402') and ti.reason = 'cấp mới';
  insert into _r values (7,'6. đợt nhập hai kho: mỗi kho một phiếu riêng (phiếu thuộc đúng một kho)','2 mã | 2 giao dịch', v_dv || ' mã | ' || v_tx || ' giao dịch', v_dv = 2 and v_tx = 2);

  -- 7. không chọn sinh phiếu: không có phiếu
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP93-501","generate_receipt":"Không"}'::jsonb), 'Tồn đầu kỳ 0093', true, null);
  select count(*) into v_cnt from transaction_items ti join assets x on x.id = ti.asset_id where x.certificate_no = 'IMP93-501';
  insert into _r values (8,'7. generate_receipt = Không: không có phiếu','0 dòng phiếu', v_cnt || ' dòng phiếu', v_cnt = 0 and o like '1:created:%');
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;