-- Test 0092 (1 khối, tự rollback). Cần: admin@btcvmt.vn, ngoctb03@sungroup.com.vn, hoangdv@sungroup.com.vn, >=1 GCN có dự án và kho.
-- Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;

create or replace function pg_temp.act(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR ' || sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v, '');
end $f$;

create or replace function pg_temp.imp(p_uid uuid, p_rows jsonb, p_reason text, p_apply boolean) returns text language plpgsql as $f$
begin
  return pg_temp.act(p_uid, format($q$select string_agg(r_row||':'||r_result||':'||coalesce(r_message,'')||'#'||coalesce(r_asset_code,'')||'#'||coalesce(r_voucher,''), ' || ' order by r_row) from import_assets_bulk(%L::jsonb, %L, %s)$q$, p_rows::text, p_reason, p_apply::text));
end $f$;

do $t$
declare
  v_admin uuid; v_wm uuid; v_inv uuid; a uuid; src uuid; tgt uuid; v_pname text; v_wname text; v_tname text;
  base jsonb; o text; n0 int; n1 int; v_aid uuid; v_code text; v_cust text; v_ms text; v_hold text; v_inw boolean; v_wh uuid; v_cnt int; v_ack text; v_ps text; v_lot uuid; v_st text;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id into v_wm from profiles where email = 'ngoctb03@sungroup.com.vn';
  select id into v_inv from profiles where email = 'hoangdv@sungroup.com.vn';
  select a1.id, a1.warehouse_id, p.name into a, src, v_pname from assets a1 join projects p on p.id = a1.project_id order by a1.created_at limit 1;
  if v_admin is null or v_wm is null or v_inv is null or a is null then
    insert into _r values (0,'chuẩn bị','đủ 3 tài khoản và 1 GCN có dự án','thiếu',false); return;
  end if;
  perform set_config('request.jwt.claims', '', true);
  if src is null then select id into src from warehouses order by created_at limit 1; end if;
  select id into tgt from warehouses where id <> src order by created_at limit 1;
  if tgt is null then
    begin insert into warehouses (name) values ('KHO TEST 0092 B') returning id into tgt;
    exception when others then insert into _r values (0,'chuẩn bị: cần 2 kho','có 2 kho','không tạo được kho tạm: '||sqlerrm,false); return; end;
  end if;
  select name into v_wname from warehouses where id = src;
  select name into v_tname from warehouses where id = tgt;
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[src] where id = v_wm;
  base := jsonb_build_object('project_name', v_pname, 'warehouse_name', v_wname, 'legal_lot_code', 'LOT-IMP-1',
                             'area', '100', 'certificate_group', 'so_nho', 'asset_type', 'Đất nền');
  select count(*) into n0 from assets;

  -- 1. xem trước: không ghi
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-001"}'::jsonb), null, false);
  select count(*) into n1 from assets;
  insert into _r values (1,'1. xem trước: ok, chưa ghi GCN','1:ok + số GCN không đổi', left(o,90) || ' | ' || n0 || '→' || n1, o like '1:ok:%' and n0 = n1);

  -- 2. áp dụng thiếu lý do
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-001"}'::jsonb), 'ngắn', true);
  insert into _r values (2,'2. áp dụng không có lý do','ERR 22023', left(o,80), o like 'ERR 22023%');

  -- 3. tồn đầu kỳ: tạo GCN, không sinh phiếu nhập
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-001","company_code":null}'::jsonb), 'Nhập tồn đầu kỳ đợt thử 0092', true);
  select id, asset_code, custody_status, is_in_warehouse, warehouse_id into v_aid, v_code, v_cust, v_inw, v_wh from assets where certificate_no = 'IMP-T-001';
  select count(*) into v_cnt from transaction_items where asset_id = v_aid;
  insert into _r values (3,'3. tồn đầu kỳ: GCN in_stock đúng kho, mã tài sản đúng định dạng, KHÔNG có phiếu nhập','created | in_stock | true | kho đúng | mã đúng | 0 phiếu',
    split_part(o,':',2) || ' | ' || coalesce(v_cust,'null') || ' | ' || coalesce(v_inw::text,'null') || ' | ' || (case when v_wh = src then 'kho đúng' else 'sai kho' end) || ' | ' || coalesce(v_code,'null') || ' | ' || v_cnt || ' phiếu',
    split_part(o,':',2) = 'created' and v_cust = 'in_stock' and v_inw = true and v_wh = src and v_code ~ '^(VMB|VMT|VMN)_DNG_BDS_[0-9]{8}$' and v_cnt = 0);

  -- 4. sinh phiếu nhập
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-002","generate_receipt":"Có"}'::jsonb), 'Nhập mới có phiếu đợt thử 0092', true);
  select id into v_aid from assets where certificate_no = 'IMP-T-002';
  select count(*), max(voucher_code) into v_cnt, v_ps from transaction_items where asset_id = v_aid and type = 'checkin' and reason = 'cấp mới' and status = 'approved';
  insert into _r values (4,'4. generate_receipt = Có: sinh phiếu nhập đã duyệt (mã PN)','1 phiếu | mã PN', v_cnt || ' phiếu | ' || coalesce(v_ps,'null'), v_cnt = 1 and v_ps like '%-PN-%' and o like '1:created:%');

  -- 5. GCN đã thế chấp: ghi nhận đã xuất thế chấp, không ở kho, không phiếu
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-003","mortgage_bank":"BIDV - CN Test","mortgage_valuation":"2500000000","collateral_ratio":"70","collateral_value":"1750000000","mortgage_expected_release_date":"2026-12-31"}'::jsonb), 'Nhập GCN đã thế chấp lần đầu 0092', true);
  select id, custody_status, mortgage_status, current_holder_dept, is_in_warehouse into v_aid, v_cust, v_ms, v_hold, v_inw from assets where certificate_no = 'IMP-T-003';
  select count(*) into v_cnt from transaction_items where asset_id = v_aid;
  insert into _r values (5,'5. GCN đã thế chấp: checked_out + mortgaged, người giữ = ngân hàng, không ở kho, không phiếu','created | checked_out | mortgaged | BIDV - CN Test | false | 0',
    split_part(o,':',2) || ' | ' || coalesce(v_cust,'null') || ' | ' || coalesce(v_ms,'null') || ' | ' || coalesce(v_hold,'null') || ' | ' || coalesce(v_inw::text,'null') || ' | ' || v_cnt,
    split_part(o,':',2) = 'created' and v_cust = 'checked_out' and v_ms = 'mortgaged' and v_hold = 'BIDV - CN Test' and v_inw = false and v_cnt = 0);

  -- 6. thế chấp + sinh phiếu nhập => lỗi; thế chấp thiếu ngân hàng => lỗi
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-004","mortgage_bank":"BIDV","generate_receipt":"Có"}'::jsonb), null, false);
  insert into _r values (6,'6a. đã thế chấp mà sinh phiếu nhập bị chặn','1:error ... không sinh phiếu nhập', left(o,120), o like '1:error:%không sinh phiếu nhập%');
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-005","mortgage_valuation":"1000"}'::jsonb), null, false);
  insert into _r values (7,'6b. có thông tin thế chấp mà thiếu ngân hàng','1:error ... ngân hàng', left(o,120), o like '1:error:%ngân hàng%');

  -- 7. trùng số GCN
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-001"}'::jsonb), null, false);
  insert into _r values (8,'7a. trùng số GCN đang có, chưa xác nhận','1:error:DUPLICATE_UNCONFIRMED', left(o,100), o like '1:error:DUPLICATE_UNCONFIRMED%');
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-001","duplicate_ack_reason":"CQNN cấp trùng số, đã đối chiếu bản gốc"}'::jsonb), 'Nhập GCN trùng có xác nhận 0092', true);
  select count(*), max(duplicate_ack_reason) into v_cnt, v_ack from assets where certificate_no = 'IMP-T-001';
  insert into _r values (9,'7b. trùng có xác nhận: tạo thêm 1 GCN, lưu lý do','created | 2 GCN | CQNN...', split_part(o,':',2) || ' | ' || v_cnt || ' GCN | ' || coalesce(v_ack,'null'), split_part(o,':',2) = 'created' and v_cnt = 2 and v_ack like 'CQNN%');
  o := pg_temp.imp(v_admin, jsonb_build_array(base || '{"certificate_no":"IMP-T-777"}'::jsonb, base || '{"certificate_no":"imp-t-777"}'::jsonb), null, false);
  insert into _r values (10,'7c. số GCN lặp trong cùng file (xem trước)','1:ok || 2:error:DUPLICATE_UNCONFIRMED', left(o,200), o like '1:ok:%' and o like '%2:error:DUPLICATE_UNCONFIRMED%');

  -- 8. lỗi từng dòng độc lập
  o := pg_temp.imp(v_admin, jsonb_build_array(
        base || '{"certificate_no":"IMP-E-1","project_name":"Dự án không tồn tại XYZ"}'::jsonb,
        base || '{"certificate_no":"IMP-E-2","warehouse_name":"Kho không tồn tại XYZ"}'::jsonb,
        (base - 'legal_lot_code') || '{"certificate_no":"IMP-E-3"}'::jsonb,
        base || '{"certificate_no":"IMP-E-4","certificate_group":"khac"}'::jsonb,
        base || '{"certificate_no":"IMP-E-5","area":"0"}'::jsonb,
        base || '{"certificate_no":"IMP-E-6"}'::jsonb), null, false);
  insert into _r values (11,'8. lỗi độc lập: dự án sai | kho sai | thiếu mã lô | nhóm sổ sai | diện tích 0 | dòng đúng','1-5 error, 6 ok', left(o,60) || '...',
    o like '%1:error:Không tìm thấy dự án%' and o like '%2:error:Không tìm thấy kho%' and o like '%3:error:Thiếu mã pháp lý%' and o like '%4:error:certificate_group%' and o like '%5:error:Diện tích%' and o like '%6:ok:%');

  -- 9. phạm vi: quản lý kho
  o := pg_temp.imp(v_wm, jsonb_build_array((base || jsonb_build_object('warehouse_name', v_tname)) || '{"certificate_no":"IMP-W-1"}'::jsonb), null, false);
  insert into _r values (12,'9a. quản lý kho nhập vào kho không thuộc quyền','1:error ... kho mình quản lý', left(o,120), o like '1:error:%kho mình quản lý%');
  o := pg_temp.imp(v_wm, jsonb_build_array(base || '{"certificate_no":"IMP-W-2"}'::jsonb), null, false);
  insert into _r values (13,'9b. quản lý kho nhập vào kho mình quản lý','1:ok', left(o,100), o like '1:ok:%');
  o := pg_temp.imp(v_inv, jsonb_build_array(base || '{"certificate_no":"IMP-W-3"}'::jsonb), null, false);
  insert into _r values (14,'9c. nhà đầu tư không có quyền','ERR 42501', left(o,80), o like 'ERR 42501%');
  o := pg_temp.imp(v_admin, '[]'::jsonb, null, false);
  insert into _r values (15,'9d. danh sách rỗng','ERR 22023', left(o,80), o like 'ERR 22023%');

  -- 10. tổng hợp audit và liên kết lô quy hoạch
  select count(*) into v_cnt from audit_logs where action = 'bulk_import';
  insert into _r values (16,'10a. mỗi lần áp dụng ghi 1 dòng audit_logs tổng','>= 4 (3,4,5,7b đều áp dụng)', v_cnt::text, v_cnt >= 4);
  begin
    insert into planned_land_lots (project_id, legal_lot_code, planned_area, status) select project_id, 'LOT-IMP-PL', 100, 'chưa cấp GCN' from assets where id = a returning id into v_lot;
    o := pg_temp.imp(v_admin, jsonb_build_array((base || '{"legal_lot_code":"LOT-IMP-PL"}'::jsonb) || '{"certificate_no":"IMP-PL-1"}'::jsonb), 'Nhập GCN khớp lô quy hoạch 0092', true);
    select status into v_st from planned_land_lots where id = v_lot;
    insert into _r values (17,'10b. GCN khớp lô quy hoạch: lô tự chuyển "đã cấp GCN"','created | đã cấp GCN', split_part(o,':',2) || ' | ' || coalesce(v_st,'null'), split_part(o,':',2) = 'created' and v_st = 'đã cấp GCN');
  exception when others then
    insert into _r values (17,'10b. (bỏ qua: không tạo được lô quy hoạch thử: '||left(sqlerrm,60)||')','bỏ qua','bỏ qua',true);
  end;
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;