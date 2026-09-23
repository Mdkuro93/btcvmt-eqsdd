# Sổ bàn giao dự án BTC VMT (cập nhật 21/09/2026)

> Mục đích: lưu lại các quyết định và trạng thái quan trọng để phiên làm việc mới (hoặc người mới) không phải
> dò lại từ đầu. Đọc cùng `AGENTS.md`. Khi có thay đổi lớn, cập nhật file này.

## 1. Bối cảnh

- Hệ thống quản lý GCN/TSĐB: React + Vite + Supabase, phát triển qua AI Studio (Gemini). Quy tắc dự án ở `AGENTS.md`.
- **Chỉ có 1 dự án Supabase dùng cho hệ thống này** (gói Free, tên hiển thị "GCN-VMT", nhánh `main` gắn nhãn PRODUCTION).
  Hiện **chưa go-live**: toàn bộ dữ liệu đang là dữ liệu thử. Kế hoạch: khi xác nhận go-live, dọn dữ liệu thử bằng
  `scripts/golive/` (xem `scripts/golive/README.md`). Không dựng môi trường thử nghiệm thứ hai (đã đủ 2 dự án Free).
- Gói Free: **không có sao lưu tự động**, dự án tự tạm dừng sau 1 tuần không hoạt động. Trước go-live nên cân nhắc
  nâng cấp Pro; nếu không, phải tự xuất CSV định kỳ + dùng `scripts/golive/01_sao_luu_trong_db.sql`.

## 2. Cách làm việc với AI Studio (bài học)

- AI Studio từng báo cáo sai thực trạng và tự ý sửa ngoài phạm vi (thêm mật khẩu vạn năng, nhánh "email đã tồn tại thì
  ghi đè", tự bỏ cột rồi thử lại...). **Luôn xuất zip và đối chiếu**, chạy `npx tsc --noEmit` trước khi tin báo cáo.
- Dán file dài dễ bị hụt: sau khi dán, kéo xuống cuối file kiểm tra, và đối chiếu lại bằng zip.
- Edge Function và SQL do AI Studio KHÔNG deploy/chạy được: người dùng làm thủ công trên Supabase Dashboard.

## 3. Mô hình bảo mật hiện tại

**Cấp bậc vai trò** (dùng thống nhất ở Edge Function và trigger DB):
`super_admin (100) > admin (80) > btc_manager (60) > warehouse_manager (40) > các vai trò còn lại (0)`.
Chỉ tác động lên tài khoản có cấp bậc THẤP HƠN mình (super_admin: được tác động mọi người khác); không tự xóa mình.

**3 Edge Function** (`supabase/functions/<tên>/index.ts`, deploy thủ công trên Dashboard → Edge Functions):
| Function | Việc | Ai gọi được |
|---|---|---|
| `admin-create-user` | Tạo tài khoản | super_admin, admin, btc_manager, warehouse_manager (chỉ gán vai trò thấp hơn mình) |
| `admin-reset-password` | Đặt lại mật khẩu người khác | super_admin, admin, btc_manager |
| `admin-delete-user` | Xóa hẳn tài khoản (auth.users + profiles) | super_admin, admin |

Quy tắc bắt buộc cho mọi Edge Function (đã tốn nhiều công dò lỗi):
1. **CORS** phải cho phép header `x-application-name` (app gắn header này trên MỌI request). Thiếu → app báo
   "Failed to send a request to the Edge Function".
2. Xác thực bằng `adminClient.auth.getUser(token)` (truyền token). Không dùng `getUser()` không tham số.
3. Công tắc **Verify JWT phải TẮT** (function tự xác thực).
4. Bảng `profiles` phải cấp quyền cho `service_role` (migration 0031), nếu không sẽ báo "permission denied for table profiles".
5. Mỗi function xuất thông báo lỗi tiếng Việt riêng cho từng lý do từ chối (không gộp một câu chung).

**Trong DB (migration 0027 → 0035):**
| Migration | Nội dung |
|---|---|
| 0027 | Gỡ RPC `admin_reset_user_password` (ghi thẳng auth.users, lưu mật khẩu dạng thường) |
| 0028 | Gỡ 2 policy `USING (true)` tạo tay trên `transactions` / `transaction_items` |
| 0029 | Thêm cột `profiles.phone`, `profiles.purpose` (DB thật từng thiếu) |
| 0030 | `has_permission()`: nhóm super_admin/admin/btc_manager luôn có mọi quyền (viết bằng `LANGUAGE sql`; AGENTS.md ghi nên dùng plpgsql — có thể viết lại) |
| 0031 | `GRANT ALL ON public.profiles TO service_role` |
| 0032 | Hàm `resolve_login_account()` (tra email từ tên đăng nhập, cho người chưa đăng nhập) + policy đọc hồ sơ cho nhân sự nội bộ |
| 0033 | Gỡ policy `profiles_select_all` (trước đó người chưa đăng nhập đọc được toàn bộ hồ sơ) |
| 0034 | Trigger `guard_profile_privilege`: chặn tự nâng quyền / sửa / xóa hồ sơ vượt cấp bậc qua API |
| 0035 | Xóa GCN chỉ dành cho admin: bảng `deletion_audit`, trigger chặn xóa trực tiếp `assets`, hàm `admin_delete_asset(s)` |

Các migration 0021–0026 (Data Dictionary v2, vá RPC, cột `certificate_group`, duyệt đề xuất hàng loạt, mã tỉnh cho
`areas`, đồng bộ Cơ quan/Mục đích từ yêu cầu truy cập) đã chạy trước đó. `0000_initial_schema.sql` bắt đầu bằng
`DROP TABLE ... CASCADE` cho các bảng chính: **KHÔNG BAO GIỜ chạy trên DB thật.**

**Lưu ý lệch giữa repo và DB thật** (cần nhớ khi viết migration): DB thật có các thứ không nằm trong repo hoặc khác repo
(ví dụ hàm `is_active_role`, `has_permission` bản plpgsql, các policy tạo tay). Trước khi ghi đè một hàm/policy, chạy
`pg_get_functiondef` / truy vấn `pg_policies` để xem bản thật.

## 4. Đăng nhập bằng tên đăng nhập

Người chưa đăng nhập KHÔNG còn đọc được bảng `profiles`. `AuthContext.tsx` gọi RPC `resolve_login_account(p_account)`
để lấy email + trạng thái của đúng một tài khoản, rồi `signInWithPassword`. Nếu RPC lỗi, app báo lỗi rõ ràng (không đoán email).

## 5. Xóa GCN (chỉ admin / super_admin)

- Giao diện: nút thùng rác ở `Assets.tsx` (hộp thoại `DeleteAssetsModal.tsx`): bắt buộc lý do ≥ 10 ký tự và gõ lại số GCN.
- API: `src/api/assetDeletion.ts` gọi RPC `admin_delete_assets`. Tối đa 50 GCN/lần, tất cả hoặc không gì cả.
- Không xóa được: đang thế chấp, đang xuất kho, còn phiếu chờ duyệt, là sổ mẹ/sổ con, có liên kết tách/gộp.
- Mọi thứ bị xóa được chụp vào bảng `deletion_audit` (chỉ admin đọc):
  `select entity_label, reason, deleted_by_email, deleted_at from public.deletion_audit order by deleted_at desc;`
- Lưu ý: xóa phiếu mới nhất có thể khiến mã phiếu đó được cấp lại (mã tính từ dữ liệu còn tồn tại).
- Trong `assets.ts` còn 2 hàm cũ `deleteAsset` / `deleteMultipleAssets` không còn được dùng (có thể dọn).

## 6. Triển khai Edge Function (làm thủ công)

1. Supabase → Edge Functions → chọn function (hoặc **Deploy a new function → Via Editor**, tên gõ đúng).
2. Tab **Code** → `Ctrl + A` → dán nội dung file trong repo → **Deploy updates**. Dòng đầu file phải là `// Edge Function: <tên>`.
3. Tab **Settings** → tắt **Verify JWT** → **Save changes**.
4. Kiểm tra: mở `https://<project-ref>.supabase.co/functions/v1/<tên>` trên trình duyệt phải hiện `{"success":false,"message":"Method not allowed"}`.
5. Sau khi sửa function phải cập nhật file trong repo (`supabase/functions/<tên>/index.ts`) cho khớp.

## 7. Kiểm tra nhanh sau mỗi thay đổi lớn (smoke test)

- Đăng nhập bằng tên đăng nhập và bằng email; đăng nhập một tài khoản chủ đầu tư và một tài khoản phòng ban.
- Tạo tài khoản (vai trò Chủ đầu tư) → kiểm tra Invocations của `admin-create-user` có lượt gọi thành công.
- Đặt lại mật khẩu, đăng nhập bằng mật khẩu mới (cửa sổ ẩn danh). Xóa tài khoản thử, kiểm tra Authentication → Users đã mất.
- Duyệt một đề xuất GCN mới; xóa GCN đó bằng chức năng admin; kiểm tra `deletion_audit`.
- Trigger nâng quyền: chạy `docs/kiem_thu/kiem_thu_trigger_0034.sql`, TỪNG KHỐI MỘT (A và B phải báo lỗi, C phải thành công).
- Chạy `select count(*)` với role `anon` trên `profiles` phải ra 0:
  `begin; set local role anon; select count(*) from public.profiles; rollback;`

## 8. Việc còn tồn (theo ưu tiên gợi ý)

1. Đổi nhãn "Thủ kho" → "Quản lý kho" ở các chỗ còn sót (`RoleSwitcher.tsx`, `ProtectedRoute.tsx`, `Requests.tsx`, `Reports.tsx`...).
2. Ô "Chủ đầu tư mặc định" cho form Dự án (cột `projects.default_owner_entity_id` đã có, code import đã dùng, form chưa có ô).
3. Gỡ đường dự phòng `auth.signUp()` phía trình duyệt trong `createUserDirect` (`users.ts`) — trái quy tắc AGENTS #15.3.
4. Form tạo tài khoản đặt mật khẩu mặc định `123456` khi để trống — nên bắt nhập hoặc tự sinh ngẫu nhiên.
5. `AuthContext.tsx` còn nhánh đăng nhập thử nghiệm chấp nhận `123456`/`password123` (chỉ khi Supabase chưa cấu hình) — trái AGENTS #13.3.
6. Luồng đăng ký tự phục vụ gọi RPC `register_user` (có thể lưu mật khẩu dạng thường vào `app_users`): kiểm tra RPC có tồn tại trên DB không và gỡ.
7. Viết lại `has_permission()` bằng `plpgsql` cho khớp AGENTS #4.
8. Gỡ URL/khóa Supabase gắn cứng làm giá trị dự phòng (`src/lib/supabase.ts`, `vite.config.ts`) trước khi có môi trường thứ hai.
9. Chức năng "Vô hiệu hóa GCN" cho dữ liệu đúng nhưng hết hiệu lực (hiện chỉ có Vô hiệu tự động khi tách sổ / cấp đổi).
10. Vấn đề "không thấy nội dung kèm phiếu đề xuất nhập": cần ảnh màn hình để xác định.
11. Trước go-live: quyết định nâng gói Pro (sao lưu) hoặc lịch xuất CSV; dọn dữ liệu thử bằng `scripts/golive/`.