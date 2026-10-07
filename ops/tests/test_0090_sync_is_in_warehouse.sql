-- Test 0090 (1 khối, tự rollback). Kết quả: test, expected, actual, ok
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
do $t$
declare a uuid; v boolean; v_cnt int;
begin
  select id into a from assets order by created_at limit 1;
  if a is null then insert into _r values (0,'chuẩn bị','có 1 GCN','thiếu',false); return; end if;
  perform set_config('request.jwt.claims', '', true);

  update assets set custody_status = 'checked_out' where id = a;
  select is_in_warehouse into v from assets where id = a;
  insert into _r values (1,'1. xuất kho (checked_out) => is_in_warehouse = false','false', v::text, v = false);

  update assets set custody_status = 'in_stock' where id = a;
  select is_in_warehouse into v from assets where id = a;
  insert into _r values (2,'2. nhập lại (in_stock) => is_in_warehouse = true','true', v::text, v = true);

  update assets set custody_status = 'in_transit' where id = a;
  select is_in_warehouse into v from assets where id = a;
  insert into _r values (3,'3. đang luân chuyển (in_transit) => false','false', v::text, v = false);

  -- sửa trực tiếp is_in_warehouse không bị trigger ghi đè (giữ nhánh vô hiệu hóa sổ)
  update assets set custody_status = 'in_stock' where id = a;
  update assets set is_in_warehouse = false where id = a;
  select is_in_warehouse into v from assets where id = a;
  insert into _r values (4,'4. chỉ sửa is_in_warehouse: giữ nguyên giá trị đặt tay','false', v::text, v = false);

  -- không còn dòng lệch sau khi đồng bộ lại
  update assets set is_in_warehouse = (custody_status = 'in_stock') where is_in_warehouse is distinct from (custody_status = 'in_stock');
  select count(*) into v_cnt from assets where is_in_warehouse is distinct from (custody_status = 'in_stock');
  insert into _r values (5,'5. không còn GCN lệch','0', v_cnt::text, v_cnt = 0);
end
$t$;
select test, expected, actual, ok from _r order by n;
rollback;