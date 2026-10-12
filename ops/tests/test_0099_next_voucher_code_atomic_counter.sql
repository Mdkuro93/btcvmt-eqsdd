-- Test 0099 (1 khối, tự rollback; 7 dòng). Cần >=1 kho, 1 giao dịch (transactions) bất kỳ để gắn dòng phiếu thử.
begin;
create temp table _r(n int, test text, expected text, actual text, ok boolean) on commit drop;
do $t$
declare
  v_w uuid; v_tx uuid; v_asset uuid; v_pre text; v_y text := '/' || extract(year from now())::text;
  c1 text; c2 text; c3 text; c4 text; o text; v_pxpre text; v_pxmax int; v_pxexp text;
begin
  select id into v_w from warehouses order by name limit 1;
  select id into v_tx from transactions limit 1;
  select id into v_asset from assets limit 1;
  v_pre := (select upper(coalesce(region_code,'VMT')) || '-' || lpad(coalesce(code,'1'),3,'0') || '-PN-' from warehouses where id = v_w);
  -- mã phiếu thử có số lớn để chắc chắn là lớn nhất
  insert into transaction_items (transaction_id, asset_id, type, reason, status, voucher_code)
  values (v_tx, v_asset, 'checkin', 'cấp mới', 'approved', v_pre || '7000' || v_y);
  c1 := _next_voucher_code(v_w, 'PN');
  insert into _r values (1,'1. gieo từ MAX hiện có: số kế tiếp là 7001','…-7001' || v_y, c1, c1 = v_pre || '7001' || v_y);
  c2 := _next_voucher_code(v_w, 'PN');
  insert into _r values (2,'2. gọi liên tiếp KHÔNG chèn dòng: vẫn ra số mới (bộ đếm nguyên tử, bản cũ trả trùng)','…-7002' || v_y, c2, c2 = v_pre || '7002' || v_y);
  insert into transaction_items (transaction_id, asset_id, type, reason, status, voucher_code)
  values (v_tx, v_asset, 'checkin', 'cấp mới', 'approved', v_pre || '7003' || v_y);
  c3 := _next_voucher_code(v_w, 'PN');
  insert into _r values (3,'3. mã 7003 đã bị dùng nơi khác: bỏ qua, ra 7004','…-7004' || v_y, c3, c3 = v_pre || '7004' || v_y);
  -- PX: DB thật có thể đã có phiếu xuất cùng tiền tố; số kỳ vọng = MAX hiện có + 1 (không phải luôn 0001)
  v_pxpre := replace(v_pre, '-PN-', '-PX-');
  select coalesce(max(nullif(substring(upper(voucher_code) from '^' || v_pxpre || '([0-9]+)' || v_y || '$'), '')::int), 0)
    into v_pxmax from transaction_items where voucher_code is not null and upper(voucher_code) like v_pxpre || '%' || v_y;
  v_pxexp := v_pxpre || lpad((v_pxmax + 1)::text, 4, '0') || v_y;
  c4 := _next_voucher_code(v_w, 'PX');
  insert into _r values (4,'4. loại phiếu PX có bộ đếm riêng, gieo từ MAX PX hiện có (+1)', v_pxexp, c4, c4 = v_pxexp);
  begin perform _next_voucher_code(v_w, 'ZZ'); o := 'khong loi'; exception when others then o := sqlstate; end;
  insert into _r values (5,'5. loại phiếu sai bị từ chối','22023', o, o = '22023');
  insert into _r values (6,'6. bộ đếm lưu đúng: last_seq của PN = 7004','7004', (select last_seq::text from voucher_code_counters where prefix = v_pre || v_y), (select last_seq from voucher_code_counters where prefix = v_pre || v_y) = 7004);
  insert into _r values (7,'7. định dạng [VÙNG]-[KHO]-PN-[4 SỐ]/[NĂM]','khớp regex', c1, c1 ~ '^[A-Z0-9]+-[0-9]{3}-PN-[0-9]{4,}/[0-9]{4}$');
end $t$;
select n, test, expected, actual, ok from _r order by n;
rollback;