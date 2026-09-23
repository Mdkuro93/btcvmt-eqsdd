-- KIỂM THỬ trigger 0034 (KHÔNG thay đổi dữ liệu: mỗi khối đều có ROLLBACK ở cuối).
-- Chạy TỪNG KHỐI MỘT trong SQL Editor (bôi đen đúng 1 khối rồi Run, hoặc dán riêng từng khối).
-- Các khối mô phỏng việc tài khoản admin@btcvmt.vn gọi thẳng vào bảng profiles.

-- ============ KHỐI A — PHẢI BÁO LỖI: admin tự nâng mình thành super_admin ============
-- Kết quả mong đợi: "Bạn không được tự thay đổi vai trò của chính mình."
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.profiles where lower(email) = 'admin@btcvmt.vn'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set role = 'super_admin' where lower(email) = 'admin@btcvmt.vn';
rollback;

-- ============ KHỐI B — PHẢI BÁO LỖI: admin nâng người khác lên ngang mình (admin) ============
-- Kết quả mong đợi: "Không được gán vai trò ngang hoặc cao hơn vai trò của bạn."
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.profiles where lower(email) = 'admin@btcvmt.vn'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set role = 'admin' where lower(email) = 'ngoctb03@sungroup.com.vn';
rollback;

-- ============ KHỐI C — PHẢI THÀNH CÔNG (rồi hoàn tác): admin đổi vai trò cấp thấp ============
-- Kết quả mong đợi: "Success. No rows returned" (không có lỗi). Dữ liệu không bị đổi vì có rollback.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id::text from public.profiles where lower(email) = 'admin@btcvmt.vn'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set role = 'viewer' where lower(email) = 'ngoctb03@sungroup.com.vn';
rollback;