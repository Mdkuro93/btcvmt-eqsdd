# Project Instructions & Rules — Dự án BTC VMT

> File này được AI Studio tự động áp dụng mỗi phiên làm việc. Vi phạm bất kỳ điều
> nào dưới đây đều bị coi là lỗi cần sửa ngay, không có ngoại lệ.

---

## 1. KHÔNG BAO GIỜ âm thầm dùng dữ liệu giả (mockStore) khi Supabase đã cấu hình

```js
export async function myApiFunction() {
  if (!isSupabaseConfigured) {
    return mockStore.getSomething();   // ✅ CHỈ được dùng mock ở đây
  }

  const { data, error } = await withTimeout(
    supabase.from('table').select('*'),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Thông báo lỗi rõ ràng bằng tiếng Việt: ' + error.message);
    // ❌ TUYỆT ĐỐI KHÔNG được catch rồi fallback sang mockStore ở đây
  }

  return data;
}
```

**Quy tắc kiểm tra nhanh**: nếu trong code có `catch` hoặc kiểm tra `if (error)` mà sau đó gọi
đến `mockStore.xxx()`, và đoạn code đó nằm **ngoài** nhánh `if (!isSupabaseConfigured)` —
đó là lỗi. Không có ngoại lệ. Điều này áp dụng cho MỌI cách gọi error, kể cả
`isSchemaMissingError(error)` — không được dùng để tự động fallback sang mock khi
Supabase đã cấu hình; phải throw lỗi rõ ràng để lộ ra vấn đề thật (VD: sai FK,
thiếu quan hệ), không được che giấu bằng dữ liệu giả.

*(Đã từng vi phạm ở: `investorEntities.ts`, `voucherEngine.ts`, `reports.ts`,
`users.ts`, `transactions.ts`, `assets.ts` — lặp lại nhiều lần dù đã sửa.)*

---

## 2. KHÔNG dùng `require()` — dự án dùng ES Module (import/export) qua Vite

```js
// ❌ SAI
const { supabase } = require('../lib/supabase');
// ✅ ĐÚNG
import { supabase } from '../lib/supabase';
```

---

## 3. KHÔNG tự bịa dữ liệu mẫu khi field bị thiếu (đặc biệt trong báo cáo/export)

```js
// ❌ SAI
asset.mortgage_bank || 'BIDV - CN TP.HCM'
asset.created_at || '15/01/2024'
// ✅ ĐÚNG
asset.mortgage_bank || 'Chưa cập nhật'
asset.created_at || '-'
```

---

## 4. Mọi bảng/API mới đều phải có RLS đúng phạm vi kho/dự án/pháp nhân

| Role | Field xác định phạm vi |
|---|---|
| `admin`/`super_admin`/`btc_manager` | Không giới hạn |
| `warehouse_manager` | `profiles.managed_warehouse_ids` |
| `capital_dept` / `project_dept` / `re_dept` | `profiles.assigned_warehouse_ids` |
| `investor` | `profiles.owner_entity_ids` so với `assets.current_owner_entity_id` |
| `viewer` | Bảng `viewer_warehouse_access` (có `expires_at`) |
| `supervisor` | `profiles.assigned_warehouse_ids`, chỉ SELECT, không được ghi |

Viết RLS mới → luôn tham chiếu đúng bảng trên. Nếu policy cần kiểm tra vai trò của
chính user hiện tại (self-check) trên CHÍNH bảng đó (VD: policy trên `profiles`
kiểm tra `profiles.role`), TUYỆT ĐỐI KHÔNG viết subquery trực tiếp tới cùng bảng
(`EXISTS (SELECT 1 FROM profiles WHERE ...)` ngay trong policy của `profiles`) —
sẽ gây lỗi "infinite recursion detected in policy". Phải bọc qua 1 hàm riêng
(`LANGUAGE plpgsql`, không dùng `LANGUAGE sql` vì có thể bị Postgres inline gây
đệ quy tương tự) để Postgres không nhúng thẳng.

---

## 5. Cấu trúc giao dịch kho: chỉ có 2 `type` gốc, phân biệt bằng `reason`

```
transaction_items.type   ∈ ('checkout', 'checkin')
transaction_items.reason ∈ ('mượn','thế chấp','chuyển nhượng','xuất bán','tách sổ',
                             'thu hồi','đổi sổ','trả','giải chấp','nhập sau bán','cấp mới')
```
KHÔNG tạo thêm `type` mới. Đổi chủ sở hữu luôn qua RPC `transfer_asset_ownership`.

---

## 6. Mã số tự sinh (asset_code, voucher_code) PHẢI tính từ dữ liệu thật trong Supabase

```js
// ✅ ĐÚNG
const { data } = await supabase.from('table').select('code').ilike('code', `${prefix}%`);
// ❌ SAI
localStorage.setItem('counter_key', nextValue);
```

---

## 7. File/component không nên vượt quá ~500-700 dòng

Vượt mốc này phải đề xuất tách thành component con trước khi thêm tính năng mới.

---

## 8. Route/trang mới phải dùng `React.lazy()`, không import tĩnh vào `App.tsx`

---

## 9. Không để lại script vá code một lần (`.py`, `.cjs`, `.sh` ở thư mục gốc)

Nếu cần tạo script patch, sau khi áp dụng xong phải tự dọn vào `scripts/_archive/`.

---

## 10. Trước khi báo "đã xong", luôn tự kiểm tra lại

- Build thử không lỗi (`npm run build`).
- Không còn `console.warn(...); return mockStore...` nằm ngoài nhánh `!isSupabaseConfigured`.
- Không còn `require()` trong file `.ts`/`.tsx`.
- Ngoặc `{}`/`()` cân bằng.
- Nếu sửa RLS/migration: đã tạo file migration MỚI (không sửa đè migration cũ đã chạy).
- Không tự ý thêm cột/bảng/RPC mới mà không nói rõ — mọi migration mới đặt số thứ tự
  tăng dần, không ghi đè số cũ.

---

## 11. TUYỆT ĐỐI KHÔNG tự viết migration "vá tất cả trong 1 file" (master fix-all)

Khi gặp lỗi "column X does not exist", "relation Y does not exist" (PGRST205),
"function Z does not exist" (PGRST202) — CHỈ viết đúng phần ALTER/CREATE bị thiếu
cho đúng bảng/cột/hàm bị báo lỗi. KHÔNG được:
- Viết lại `CREATE TABLE IF NOT EXISTS` cho TOÀN BỘ hệ thống chỉ vì 1 bảng thiếu.
- Thêm `CREATE POLICY ... USING (true)` cho bất kỳ bảng nào (RLS permissive gộp
  bằng OR — chỉ 1 policy `true` là phá hết phân quyền).
- Chạy `GRANT ALL ON ALL TABLES ... TO anon` hoặc tương tự.
- Tạo lại bảng `app_users` với cột `password` lưu dạng thường + RPC so sánh trực tiếp.

## 12. Trước khi đưa ra file migration mới, PHẢI liệt kê rõ

- Bảng/cột/hàm nào đang thực sự thiếu (dựa trên thông báo lỗi cụ thể).
- Chính xác các câu lệnh SQL sẽ thêm — không đính kèm phần re-tạo cái đã có sẵn.
- Số thứ tự file tăng dần, không ghi đè số cũ.

---

## 13. CHỈ sửa đúng file / đúng phạm vi được yêu cầu

1. **Phạm vi can thiệp**: Khi được yêu cầu sửa 1 lỗi cụ thể ở 1 file cụ thể,
   **TUYỆT ĐỐI KHÔNG** được nhân tiện sửa thêm các file khác.
2. **Xử lý khi phát hiện vấn đề ngoài phạm vi**: Nếu thấy 1 vấn đề khác ở file
   khác trong lúc làm việc, **CHỈ ĐƯỢC NÊU RA để hỏi lại**, không tự ý sửa luôn.
3. **Nghiêm cấm code dự phòng / fallback giả lập tự ý**:
   - **Tuyệt đối không** thêm mật khẩu cố định/mặc định để "phòng khi đăng nhập
     lỗi" (VD: không chấp nhận '123456', 'password123' cho mọi tài khoản).
   - **Tuyệt đối không** thêm nhánh "nếu Supabase lỗi thì lưu tạm vào
     mockStore/localStorage rồi coi như thành công" (đây là vi phạm trực tiếp
     quy tắc #1, không áp dụng cho bất kỳ file API nào).
4. **Báo cáo sau mỗi lần sửa**:
   - Phải tự liệt kê chính xác: đã đổi những file nào, mỗi file đổi đúng những
     dòng/khối code nào.
   - Không được trả lời chung chung kiểu "đã sửa xong".
   - Nếu số file bị đổi nhiều hơn số file được yêu cầu, phải giải thích rõ lý do
     trước khi thực hiện hoặc trình bày, không được âm thầm gộp vào.

---

## 14. Edge Function (Supabase): CORS, xác thực, phân quyền

1. **CORS**: `Access-Control-Allow-Headers` của MỌI Edge Function PHẢI có đủ:
   `authorization, x-client-info, apikey, content-type, x-application-name`.
   Client (`src/lib/supabase.ts`) gắn `x-application-name` vào MỌI request, kể cả gọi Edge Function;
   thiếu header này trình duyệt chặn ở bước preflight và app chỉ báo "Failed to send a request to the
   Edge Function". Nếu thêm header toàn cục mới vào `src/lib/supabase.ts` thì PHẢI cập nhật CORS của tất cả
   Edge Function trong cùng lần sửa.
2. **Xác thực người gọi**: dùng `adminClient.auth.getUser(token)` với `token` tách từ header `Authorization`.
   CẤM dùng `getUser()` không tham số trong Edge Function (bản supabase-js cũ không đọc được header
   Authorization và luôn báo "session missing").
3. **Mỗi thao tác nhạy cảm là một Edge Function riêng** (tạo tài khoản, đặt lại mật khẩu, xóa tài khoản).
   CẤM gom nhiều `action` vào một function.
4. **Phân quyền theo cấp bậc**: `super_admin (100) > admin (80) > btc_manager (60) > warehouse_manager (40) > còn lại (0)`.
   Người gọi chỉ được tác động lên tài khoản có cấp bậc THẤP HƠN mình (riêng `super_admin` được tác động mọi
   tài khoản khác). Không cho tự đặt lại mật khẩu / tự xóa chính mình qua các function quản trị. Không cho
   gán vai trò ngang hoặc cao hơn vai trò của người tạo.
5. **Mật khẩu**: CẤM viết RPC/SQL sửa trực tiếp `auth.users`; CẤM lưu mật khẩu (kể cả dạng thường) ở bất kỳ
   bảng nào (kể cả `app_users`); CẤM mật khẩu mặc định/vạn năng. Đặt lại mật khẩu CHỈ qua
   `auth.admin.updateUserById` trong Edge Function.
6. **Mã nguồn phải nằm trong repo**: `supabase/functions/<tên>/index.ts` phải luôn khớp bản đã deploy.
   Khi sửa Edge Function phải cập nhật file trong repo trước, rồi mới deploy. Công tắc "Verify JWT" của
   các function này để TẮT (function tự xác thực theo mục 2).

---

## 15. CẤM tự động "chữa lỗi" bằng cách nuốt lỗi, tự thử lại, hoặc ghi đè dữ liệu

(Bổ sung cho quy tắc #1 và #13.)
1. Tạo tài khoản mà email đã tồn tại trong `auth.users` → PHẢI báo lỗi rõ ràng. CẤM tự tìm hồ sơ cũ để ghi đè
   vai trò/thông tin hoặc tự đặt lại mật khẩu.
2. PostgREST báo thiếu cột / lỗi schema cache → PHẢI throw lỗi kèm gợi ý cần migration nào. CẤM tự bỏ cột khỏi
   payload rồi thử lại (làm mất dữ liệu âm thầm).
3. Khi gọi Edge Function thất bại → báo lỗi thật cho người dùng. CẤM tự chuyển sang đường thay thế ở phía
   trình duyệt (ví dụ `auth.signUp()` từ client) nếu chưa được yêu cầu rõ.

---

## 16. Không tạo policy RLS "mở toang" và không để DB thật lệch repo

1. CẤM policy `USING (true)` / `WITH CHECK (true)` cho lệnh ghi (INSERT/UPDATE/DELETE/ALL). Policy SELECT
   `USING (true)` chỉ được dùng cho bảng danh mục không nhạy cảm.
2. Mọi thay đổi chạy tay trên Supabase (SQL Editor / Dashboard) PHẢI có file migration tương ứng trong
   `supabase/migrations/` ngay trong cùng lần làm, để repo luôn phản ánh đúng DB thật.
3. Trước khi ghi đè một hàm SQL đang chạy (`CREATE OR REPLACE`), PHẢI chạy `pg_get_functiondef` để xem bản
   thật trong DB và ghi bản cũ vào phần ROLLBACK của migration.

---
## 17. Kế hoạch go-live, sổ bàn giao và script dọn dữ liệu
Kế hoạch go-live, sổ bàn giao và script dọn dữ liệu nằm ở docs/HANDOVER.md và scripts/golive/. Không đặt script dọn dữ liệu vào supabase/migrations/.
---

## Lịch sử các lỗi đã từng xảy ra do quên các quy tắc trên (tham khảo)

1. `createUserDirect()` dùng `auth.signUp()` từ client → làm admin bị đăng xuất
   khỏi phiên (đã sửa bằng Edge Function `admin-create-user`, dùng service_role).
2. `app_users` lưu mật khẩu dạng thường, đối chiếu ở client — đã gộp vào Supabase
   Auth (username ánh xạ sang email nội bộ `username@btcvmt.vn`, không hiển thị
   ra UI).
3. Export Excel tự bịa dữ liệu mẫu (`BIDV...`, `15/01/2024`) — vi phạm quy tắc #3.
4. `transferAssetOwnership()` ban đầu 2 lệnh ghi tách rời, không atomic — đã
   chuyển thành 1 RPC Postgres duy nhất.
5. RPC `transfer_asset_ownership` set quyền quá chặt — vi phạm quy tắc #4.
6. `require()` chèn nhầm trong `transactions.ts` do script vá tự động.
7. Bộ đếm mã phiếu (PN/PX) dùng `localStorage` — vi phạm quy tắc #6, đã sửa.
8. `investorEntities.ts`, `voucherEngine.ts`, `reports.ts`, `users.ts`,
   `transactions.ts` — vi phạm quy tắc #1 lặp lại nhiều lần ở nhiều file khác nhau.
9. FK cột `assets.updated_by` trỏ sai sang `auth.users` thay vì `profiles`, khiến
   PostgREST không JOIN được → bị `isSchemaMissingError` bắt nhầm → toàn bộ danh
   sách GCN âm thầm hiện dữ liệu mock (`MOCK_ASSETS` trong `mockStore.ts`) dù
   Supabase hoàn toàn bình thường — nhắc lại tầm quan trọng của quy tắc #1 và #4:
   mọi FK JOIN qua `!column_name` phải khớp đúng bảng đích thật, và lỗi liên quan
   quan hệ/schema PHẢI throw rõ ràng, không được tự động fallback.
10. `has_permission()` viết `LANGUAGE sql` bị Postgres inline vào policy gọi nó,
    gây "infinite recursion detected in policy" khi dùng trong policy của chính
    bảng `profiles` — đã đổi sang `LANGUAGE plpgsql` (xem quy tắc #4).
11. AI Studio từng tự ý thêm mật khẩu vạn năng `123456`/`password123` chấp nhận
    cho MỌI tài khoản vào `AuthContext.tsx` khi chỉ được yêu cầu sửa file cấu
    hình URL Supabase — vi phạm nghiêm trọng quy tắc #13.
12. Edge Function `admin-reset-password` / `admin-delete-user` / `admin-create-user` bị trình duyệt chặn ở bước
    preflight vì CORS thiếu `x-application-name` (client gắn header này trên mọi request) — mọi lời gọi báo
    "Failed to send a request to the Edge Function", riêng tạo tài khoản âm thầm rơi sang `auth.signUp()` phía
    client. (quy tắc #14.1)
13. Edge Function dùng `userClient.auth.getUser()` không tham số nên luôn trả 401 "Phiên đăng nhập không hợp lệ"
    dù người gọi đã đăng nhập. Đã sửa bằng `getUser(token)`. (quy tắc #14.2)
14. Nhánh `action: 'reset_password'` nhét trong `admin-create-user` cho phép `warehouse_manager` đặt lại mật khẩu
    của bất kỳ ai kể cả `super_admin`; RPC `admin_reset_user_password` ghi thẳng `auth.users` và ghi mật khẩu
    dạng thường vào `app_users` — đã gỡ (migration 0027). (quy tắc #14.3–14.5)
15. Hai policy `transactions_authenticated_policy` / `transaction_items_authenticated_policy`
    (`FOR ALL ... USING (true)`) tạo tay trên DB, không có trong repo, vô hiệu hóa toàn bộ phân quyền phiếu —
    đã gỡ (migration 0028). (quy tắc #16)
16. AI Studio tự thêm nhánh "email đã tồn tại → ghi đè hồ sơ + đặt lại mật khẩu" và cơ chế "gặp lỗi cột `phone`
    thì tự bỏ `phone` rồi thử lại" để che lỗi thiếu cột `profiles.phone/purpose` (nguyên nhân thật: DB lệch
    repo, đã sửa bằng migration 0029). (quy tắc #15)