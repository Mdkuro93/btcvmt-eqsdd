-- Test 0091 (1 khối, tự rollback). Cần: admin@btcvmt.vn, ngoctb03@sungroup.com.vn, hoangdv@sungroup.com.vn, >=1 GCN.
-- Tự dùng 2 kho (nếu DB chỉ có 1 kho, test tạo thêm 1 kho tạm). Kết quả: test, expected, actual, ok
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

do $t$
declare
  v_admin uuid; v_src_m uuid; v_tgt_m uuid; a uuid; b uuid; src uuid; tgt uuid; v_area numeric;
  o text; out_item uuid; in_item uuid; v_cnt int; v_st text; v_wh uuid; v_stage text; v_area2 numeric; v_notes text; n int := 0;
  v_tx uuid; v_x uuid; v_ps text; v_e1 text; v_e2 text;
begin
  select id into v_admin from profiles where email = 'admin@btcvmt.vn';
  select id into v_src_m from profiles where email = 'ngoctb03@sungroup.com.vn';
  select id into v_tgt_m from profiles where email = 'hoangdv@sungroup.com.vn';
  select id, warehouse_id, area into a, src, v_area from assets order by created_at limit 1;
  select id into b from assets order by created_at offset 1 limit 1;
  if v_admin is null or v_src_m is null or v_tgt_m is null or a is null or b is null then
    insert into _r values (0,'chuẩn bị','đủ 3 tài khoản và >=2 GCN','thiếu',false); return;
  end if;
  perform set_config('request.jwt.claims', '', true);
  if src is null then select id into src from warehouses order by created_at limit 1; end if;
  select id into tgt from warehouses where id <> src order by created_at limit 1;
  if tgt is null then
    begin
      insert into warehouses (name) values ('KHO TEST 0091') returning id into tgt;
    exception when others then
      insert into _r values (0,'chuẩn bị: cần 2 kho','có 2 kho','không tạo được kho tạm: ' || sqlerrm, false); return;
    end;
  end if;
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[src] where id = v_src_m;
  update profiles set role = 'warehouse_manager', managed_warehouse_ids = array[tgt] where id = v_tgt_m;
  update assets set custody_status='in_stock', warehouse_id=src, lifecycle_status='active', invalidation_type='NONE', current_holder_dept=null where id in (a, b);

  -- 1. kho xuất lập lệnh luân chuyển
  o := pg_temp.act(v_src_m, format($q$select r_result||'|'||coalesce(r_out_item_id::text,'')||'|'||coalesce(r_in_item_id::text,'')||'|'||coalesce(r_out_voucher,'')||'|'||coalesce(r_message,'') from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, a, tgt));
  out_item := nullif(split_part(o,'|',2),'')::uuid; in_item := nullif(split_part(o,'|',3),'')::uuid;
  select custody_status, warehouse_id into v_st, v_wh from assets where id = a;
  select details->'transfer'->>'stage' into v_stage from transaction_items where id = in_item;
  select count(*) into v_cnt from transaction_items where id = out_item and status = 'approved' and voucher_code like '%-PX-%';
  insert into _r values (1,'1. kho xuất tạo lệnh: GCN in_transit (vẫn ở kho xuất), PX duyệt có mã, PN chờ','created | in_transit | kho xuất | PX ok | awaiting_receipt',
    split_part(o,'|',1) || ' | ' || coalesce(v_st,'null') || ' | ' || (case when v_wh = src then 'kho xuất' else 'sai kho' end) || ' | ' || (case when v_cnt = 1 then 'PX ok' else 'thiếu PX' end) || ' | ' || coalesce(v_stage,'null'),
    split_part(o,'|',1) = 'created' and v_st = 'in_transit' and v_wh = src and v_cnt = 1 and v_stage = 'awaiting_receipt');

  -- 2. người không phải kho xuất không tạo được
  o := pg_temp.act(v_tgt_m, format($q$select r_result||'|'||coalesce(r_message,'') from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, b, src));
  insert into _r values (2,'2. quản lý kho đích không tạo lệnh cho GCN của kho khác','error ... quản lý kho xuất', left(o,120), o like 'error|%kho xuất%');

  -- 3. GCN đang luân chuyển không tạo lại
  o := pg_temp.act(v_src_m, format($q$select r_result||'|'||coalesce(r_message,'') from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, a, tgt));
  insert into _r values (3,'3. GCN đang luân chuyển không tạo lệnh lần hai','error ... không đang lưu kho', left(o,120), o like 'error|%không đang lưu kho%');

  -- 4. kho đích trùng kho hiện tại
  o := pg_temp.act(v_src_m, format($q$select r_result||'|'||coalesce(r_message,'') from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, b, src));
  insert into _r values (4,'4. kho đích trùng kho hiện tại','error ... chính kho đích', left(o,120), o like 'error|%chính kho đích%');

  -- 5. kho xuất không tự xác nhận nhận
  o := pg_temp.act(v_src_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, null, null)::text$q$, in_item));
  insert into _r values (5,'5. kho xuất không xác nhận nhận thay kho đích','ERR 42501', left(o,100), o like 'ERR 42501%');

  -- 6. duyệt/hủy phiếu thông thường bị chặn
  o := pg_temp.act(v_admin, format($q$select decide_transaction_item(%L::uuid, 'approved', null, null, null)::text$q$, in_item));
  insert into _r values (6,'6. decide_transaction_item không duyệt được phiếu luân chuyển','ERR 42501 ... Luân chuyển kho', left(o,140), o like 'ERR 42501%Luân chuyển kho%');
  o := pg_temp.act(v_admin, format($q$select void_transaction_item(%L::uuid, 'thử hủy phiếu luân chuyển')::text$q$, out_item));
  insert into _r values (7,'7. void_transaction_item không hủy được phiếu xuất luân chuyển','ERR 42501 ... Luân chuyển kho', left(o,140), o like 'ERR 42501%Luân chuyển kho%');

  -- 8. phiếu khác của cùng GCN không duyệt được khi đang chờ nhận
  insert into transactions (type, notes, created_by) values ('checkout', 'phiếu thử mượn', v_admin) returning id into v_tx;
  insert into transaction_items (transaction_id, asset_id, type, reason, details, status) values (v_tx, a, 'checkout', 'mượn', '{"department":"Phòng thử"}'::jsonb, 'pending') returning id into v_x;
  o := pg_temp.act(v_admin, format($q$select decide_transaction_item(%L::uuid, 'approved', null, null, null)::text$q$, v_x));
  insert into _r values (8,'8. phiếu mượn khác không duyệt được khi GCN đang chờ nhận luân chuyển','ERR 22023 ... luân chuyển giữa kho', left(o,140), o like 'ERR 22023%luân chuyển giữa kho%');
  delete from transaction_items where id = v_x; delete from transactions where id = v_tx;

  -- 9. kho đích nhận đúng
  o := pg_temp.act(v_tgt_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, 'Đã đối chiếu đủ', null, null)::text$q$, in_item));
  select custody_status, warehouse_id into v_st, v_wh from assets where id = a;
  select status, voucher_code into v_stage, v_ps from transaction_items where id = in_item;
  select details->'transfer'->>'stage' into v_notes from transaction_items where id = out_item;
  insert into _r values (9,'9. kho đích xác nhận nhận: GCN in_stock tại kho đích, PN duyệt có mã, PX = received','in_stock | kho đích | approved | PN | received',
    coalesce(v_st,'null') || ' | ' || (case when v_wh = tgt then 'kho đích' else 'sai kho' end) || ' | ' || coalesce(v_stage,'null') || ' | ' || (case when v_ps like '%-PN-%' then 'PN' else coalesce(v_ps,'null') end) || ' | ' || coalesce(v_notes,'null'),
    v_st = 'in_stock' and v_wh = tgt and v_stage = 'approved' and v_ps like '%-PN-%' and v_notes = 'received');

  -- 10. đề xuất điều chỉnh -> chờ kho xuất
  update assets set warehouse_id = src, custody_status = 'in_stock' where id = a;
  o := pg_temp.act(v_src_m, format($q$select r_out_item_id::text||'|'||r_in_item_id::text from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, a, tgt));
  out_item := nullif(split_part(o,'|',1),'')::uuid; in_item := nullif(split_part(o,'|',2),'')::uuid;
  o := pg_temp.act(v_tgt_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, '{"area": 123.5, "notes": "Đã đối chiếu thực tế"}'::jsonb, 'Diện tích thực tế khác bản ghi hệ thống')::text$q$, in_item));
  select custody_status, area into v_st, v_area2 from assets where id = a;
  select status, details->'transfer'->>'stage' into v_stage, v_ps from transaction_items where id = in_item;
  insert into _r values (10,'10. kho đích đề xuất điều chỉnh: phiếu vẫn pending, GCN vẫn in_transit, chưa đổi dữ liệu','pending | adjustment_proposed | in_transit | area không đổi',
    coalesce(v_stage,'null') || ' | ' || coalesce(v_ps,'null') || ' | ' || coalesce(v_st,'null') || ' | ' || (case when v_area2 is not distinct from v_area then 'area không đổi' else 'area ĐÃ đổi' end),
    v_stage = 'pending' and v_ps = 'adjustment_proposed' and v_st = 'in_transit' and v_area2 is not distinct from v_area);

  o := pg_temp.act(v_tgt_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, null, null)::text$q$, in_item));
  insert into _r values (11,'11. đang chờ kho xuất kiểm tra thì kho đích không xác nhận lại','ERR 22023 ... chờ kho xuất', left(o,120), o like 'ERR 22023%chờ kho xuất%');

  o := pg_temp.act(v_tgt_m, format($q$select review_warehouse_transfer_adjustment(%L::uuid, true, 'tự duyệt')::text$q$, in_item));
  insert into _r values (12,'12. kho đích không tự kiểm tra đề xuất của mình','ERR 42501', left(o,100), o like 'ERR 42501%');

  -- 13. kho xuất từ chối (phải có lý do), trả về kho đích
  o := pg_temp.act(v_src_m, format($q$select review_warehouse_transfer_adjustment(%L::uuid, false, 'ngắn')::text$q$, in_item));
  insert into _r values (13,'13a. từ chối đề xuất mà lý do quá ngắn','ERR 22023', left(o,100), o like 'ERR 22023%');
  o := pg_temp.act(v_src_m, format($q$select review_warehouse_transfer_adjustment(%L::uuid, false, 'Diện tích theo bản gốc là đúng, kiểm tra lại')::text$q$, in_item));
  select details->'transfer'->>'stage' into v_stage from transaction_items where id = in_item;
  select custody_status into v_st from assets where id = a;
  insert into _r values (14,'13b. kho xuất từ chối đề xuất có lý do','adjustment_rejected | in_transit', coalesce(v_stage,'null') || ' | ' || coalesce(v_st,'null'), v_stage = 'adjustment_rejected' and v_st = 'in_transit');

  -- 14. kho đích đề xuất lại, kho xuất chấp nhận => áp điều chỉnh, hoàn tất nhận
  -- Lưu ý: RPC chỉ nhận số dạng chuẩn (123.5); giao diện phải chuẩn hóa 123,5 -> 123.5 trước khi gọi
  o := pg_temp.act(v_tgt_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, '{"area": "123.5", "notes": "Đã đối chiếu thực tế"}'::jsonb, 'Đo lại thực tế diện tích 123,5 m2')::text$q$, in_item));
  v_e1 := o;
  o := pg_temp.act(v_src_m, format($q$select review_warehouse_transfer_adjustment(%L::uuid, true, 'Đã kiểm tra, đồng ý điều chỉnh')::text$q$, in_item));
  v_e2 := o;
  select custody_status, warehouse_id, area, notes into v_st, v_wh, v_area2, v_notes from assets where id = a;
  select count(*) into v_cnt from audit_logs where record_id = a::text and action = 'transfer_adjust';
  select status into v_stage from transaction_items where id = in_item;
  insert into _r values (15,'14. kho xuất chấp nhận: áp điều chỉnh, GCN in_stock tại kho đích, PN approved, có audit_logs','in_stock | kho đích | 123.5 | Đã đối chiếu thực tế | approved | 1',
    coalesce(v_st,'null') || ' | ' || (case when v_wh = tgt then 'kho đích' else 'sai kho' end) || ' | ' || coalesce(v_area2::text,'null') || ' | ' || coalesce(v_notes,'null') || ' | ' || coalesce(v_stage,'null') || ' | ' || v_cnt
      || (case when v_st = 'in_stock' then '' else ' || đề xuất lại: ' || left(v_e1,90) || ' || chấp nhận: ' || left(v_e2,90) end),
    v_st = 'in_stock' and v_wh = tgt and v_area2 = 123.5 and v_notes = 'Đã đối chiếu thực tế' and v_stage = 'approved' and v_cnt = 1);

  -- 15. đề xuất chứa trường không cho phép (số GCN)
  update assets set warehouse_id = src, custody_status = 'in_stock' where id = a;
  o := pg_temp.act(v_src_m, format($q$select r_out_item_id::text||'|'||r_in_item_id::text from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, a, tgt));
  out_item := nullif(split_part(o,'|',1),'')::uuid; in_item := nullif(split_part(o,'|',2),'')::uuid;
  o := pg_temp.act(v_tgt_m, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, '{"certificate_no": "X-999"}'::jsonb, 'Số GCN trên bản gốc khác hệ thống')::text$q$, in_item));
  insert into _r values (16,'15. đề xuất sửa số GCN bị chặn (dùng chức năng riêng)','ERR 22023 ... không được điều chỉnh', left(o,140), o like 'ERR 22023%không được điều chỉnh%');

  -- 16. kho đích từ chối nhận
  o := pg_temp.act(v_tgt_m, format($q$select reject_warehouse_transfer_receipt(%L::uuid, 'ngắn')::text$q$, in_item));
  insert into _r values (17,'16a. từ chối nhận mà lý do quá ngắn','ERR 22023', left(o,100), o like 'ERR 22023%');
  o := pg_temp.act(v_tgt_m, format($q$select reject_warehouse_transfer_receipt(%L::uuid, 'Hồ sơ giao thiếu bản gốc, trả lại kho xuất')::text$q$, in_item));
  select custody_status, warehouse_id into v_st, v_wh from assets where id = a;
  select status into v_stage from transaction_items where id = in_item;
  select status into v_ps from transaction_items where id = out_item;
  insert into _r values (18,'16b. từ chối nhận: GCN về lại kho xuất, PN rejected, PX cancelled','in_stock | kho xuất | rejected | cancelled',
    coalesce(v_st,'null') || ' | ' || (case when v_wh = src then 'kho xuất' else 'sai kho' end) || ' | ' || coalesce(v_stage,'null') || ' | ' || coalesce(v_ps,'null'),
    v_st = 'in_stock' and v_wh = src and v_stage = 'rejected' and v_ps = 'cancelled');

  -- 17. thu hồi lệnh (chỉ kho xuất / admin)
  o := pg_temp.act(v_src_m, format($q$select r_out_item_id::text||'|'||r_in_item_id::text from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, a, tgt));
  out_item := nullif(split_part(o,'|',1),'')::uuid; in_item := nullif(split_part(o,'|',2),'')::uuid;
  o := pg_temp.act(v_tgt_m, format($q$select cancel_warehouse_transfer(%L::uuid, 'Kho đích thử thu hồi lệnh xuất')::text$q$, in_item));
  insert into _r values (19,'17a. kho đích không thu hồi lệnh của kho xuất','ERR 42501', left(o,100), o like 'ERR 42501%');
  o := pg_temp.act(v_src_m, format($q$select cancel_warehouse_transfer(%L::uuid, 'Nhập nhầm GCN, thu hồi lệnh luân chuyển')::text$q$, in_item));
  select custody_status, warehouse_id into v_st, v_wh from assets where id = a;
  select status into v_stage from transaction_items where id = in_item;
  select status into v_ps from transaction_items where id = out_item;
  insert into _r values (20,'17b. kho xuất thu hồi lệnh: GCN về kho xuất, PN và PX cancelled','in_stock | kho xuất | cancelled | cancelled',
    coalesce(v_st,'null') || ' | ' || (case when v_wh = src then 'kho xuất' else 'sai kho' end) || ' | ' || coalesce(v_stage,'null') || ' | ' || coalesce(v_ps,'null'),
    v_st = 'in_stock' and v_wh = src and v_stage = 'cancelled' and v_ps = 'cancelled');

  -- 18. admin lập lệnh và xác nhận nhận
  o := pg_temp.act(v_admin, format($q$select r_in_item_id::text from create_warehouse_transfer(array[%L]::uuid[], %L::uuid)$q$, b, tgt));
  in_item := nullif(split_part(o,'|',1),'')::uuid;
  o := pg_temp.act(v_admin, format($q$select confirm_warehouse_transfer_receipt(%L::uuid, null, null, null)::text$q$, in_item));
  select custody_status, warehouse_id into v_st, v_wh from assets where id = b;
  insert into _r values (21,'18. admin lập lệnh và xác nhận nhận được','in_stock | kho đích', coalesce(v_st,'null') || ' | ' || (case when v_wh = tgt then 'kho đích' else 'sai kho' end), v_st = 'in_stock' and v_wh = tgt);
end
$t$;

select test, expected, actual, ok from _r order by n;
rollback;