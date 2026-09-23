# Quy trình GO-LIVE: dọn dữ liệu thử nghiệm

> Thư mục này chứa các script dùng **một lần** khi chuyển từ giai đoạn thử nghiệm sang vận hành thật.
> **KHÔNG** đặt các file này vào `supabase/migrations/` (đó là nơi chứa thay đổi cấu trúc; script dọn dữ liệu
> mà bị chạy nhầm ở đó sẽ xóa sạch dữ liệu). Vị trí đúng: `scripts/golive/`.

## Bối cảnh

- Hệ thống chỉ có **một dự án Supabase**. Trước go-live, toàn bộ dữ liệu trong đó là dữ liệu thử.
- Khi bạn xác nhận go-live, dùng bộ script này để xóa sạch dữ liệu thử, giữ lại danh mục và tài khoản cần thiết.
- Sau go-live, dữ liệu nhập sai được xử lý bằng chức năng **Xóa GCN của admin** (có lưu vết), KHÔNG dùng script này nữa.

## Các file

| File | Việc | Mức độ |
|---|---|---|
| `00_dem_so_dong.sql` | Đếm số dòng mọi bảng trong `public` | Chỉ đọc, an toàn |
| `01_sao_luu_trong_db.sql` | Sao lưu các bảng vào schema `golive_backup_<ngày>_<giờ>` | Chỉ thêm, an toàn |
| `02_don_du_lieu_thu.sql` | Xóa dữ liệu nghiệp vụ (và tùy chọn tài khoản thử) | **KHÔNG hoàn tác được** |

## Quy trình từng bước

**Trước khi chạy (ngày go-live):**
1. Thông báo mọi người **ngừng dùng hệ thống** (script khóa bảng trong lúc dọn).
2. Vào Supabase → Table Editor, **xuất CSV** các bảng quan trọng (`assets`, `transactions`, `transaction_items`,
   `profiles`...) và cất ở nơi khác. Đây là lớp dự phòng thứ hai, ngoài bản sao lưu trong DB.
3. Chạy `00_dem_so_dong.sql`. Ghi lại (chụp màn hình) kết quả. **Kiểm tra bảng nào KHÔNG nằm trong danh sách
   `v_business_tables` của file 02** mà đang có dữ liệu (ví dụ bảng mới được thêm sau này): thêm nó vào danh sách
   trong `02_don_du_lieu_thu.sql` nếu đó là dữ liệu thử.
4. Chạy `01_sao_luu_trong_db.sql`. Kết quả cuối phải hiện tên schema `golive_backup_...` mới nhất.

**Dọn dữ liệu:**
5. Mở `02_don_du_lieu_thu.sql`, sửa 3 dòng cấu hình ở đầu:
   - `v_confirm`: đổi `CHUA_XAC_NHAN` thành `DONG_Y_XOA_DU_LIEU_THU`.
   - `v_keep_emails`: liệt kê email các tài khoản **giữ lại** (chữ thường). Phải có ít nhất 1 admin.
   - `v_delete_other_accounts`: `true` = xóa mọi tài khoản còn lại; `false` = chỉ dọn dữ liệu nghiệp vụ.
   > **Khuyến nghị: chạy lần đầu với `false`.** Kiểm tra xong mới xóa tài khoản thử riêng (bằng nút xóa trong
   > Quản lý người dùng hoặc chạy lại script với `true`). Lý do: nếu cần khôi phục, nghiệp vụ chỉ khôi phục được
   > khi các tài khoản còn nguyên (xem mục Khôi phục).
6. Chạy `02_don_du_lieu_thu.sql`. Toàn bộ chạy trong **một giao dịch**: có lỗi ở đâu là hoàn tác hết, không mất gì.
   Script tự từ chối nếu chưa xác nhận, nếu email giữ lại gõ sai, hoặc nếu sau khi dọn không còn admin nào.
7. Chạy lại `00_dem_so_dong.sql`: các bảng nghiệp vụ phải về `0`, các bảng danh mục còn nguyên.

**Việc thủ công sau khi dọn (script không làm được):**
- **File scan GCN trên Supabase Storage:** vào Storage → bucket chứa bản scan → xóa các file thử. (Xóa dòng trong
  `storage.objects` bằng SQL sẽ để lại file thật, nên phải xóa qua giao diện.)
- **Danh mục thử:** rà lại Vùng, Địa bàn, Kho, Dự án, Pháp nhân CĐT/NĐT trong "Quản trị danh mục", xóa mục thử.
- **Authentication → Users:** xóa các tài khoản thử còn sót (đặc biệt tài khoản không có hồ sơ trong `profiles`).
- Đổi mật khẩu các tài khoản admin nếu từng dùng mật khẩu thử.
- **Kiểm tra nhanh:** đăng nhập bằng tên đăng nhập và email, tạo 1 tài khoản mới, đặt lại mật khẩu, tạo 1 GCN mới,
  duyệt, xóa bằng chức năng admin (xem `docs/HANDOVER.md`, mục "Kiểm tra nhanh").

**Sau đó:**
- Nhập dữ liệu thật (Import Excel 27 cột).
- Sau khoảng 1–2 tuần vận hành ổn định: xóa bản sao lưu để giải phóng dung lượng (gói Free giới hạn 0,5 GB):
  `DROP SCHEMA golive_backup_YYYYMMDD_HHMI CASCADE;`

## Khôi phục từ bản sao lưu (nếu dọn nhầm)

Bản sao lưu là các bảng cùng tên trong schema `golive_backup_...`. Chỉ khôi phục được nghiệp vụ khi các tài khoản
tương ứng còn tồn tại (các cột `created_by`, `requester_id`... tham chiếu tới `profiles`). Đúng thứ tự **cha → con**
(thay `<schema>` bằng tên thật):

```sql
INSERT INTO public.assets                     SELECT * FROM <schema>.assets;
INSERT INTO public.transactions               SELECT * FROM <schema>.transactions;
INSERT INTO public.transaction_items          SELECT * FROM <schema>.transaction_items;
INSERT INTO public.collaterals                SELECT * FROM <schema>.collaterals;
INSERT INTO public.asset_lineage_events       SELECT * FROM <schema>.asset_lineage_events;
INSERT INTO public.asset_lineage_links        SELECT * FROM <schema>.asset_lineage_links;
INSERT INTO public.asset_ownership_transfers  SELECT * FROM <schema>.asset_ownership_transfers;
INSERT INTO public.inventory_audits           SELECT * FROM <schema>.inventory_audits;
INSERT INTO public.inventory_audit_items      SELECT * FROM <schema>.inventory_audit_items;
INSERT INTO public.activity_logs              SELECT * FROM <schema>.activity_logs;
-- các bảng còn lại (asset_declaration_requests, report_snapshots, audit_logs, access_logs, notifications,
-- access_requests, viewer_warehouse_access): khôi phục tương tự nếu cần
```

**Giới hạn cần biết:** bản sao lưu KHÔNG chứa mật khẩu. Nếu đã xóa tài khoản (`v_delete_other_accounts = true`),
đăng nhập của các tài khoản đó không khôi phục được; phải tạo lại bằng chức năng Tạo tài khoản. Bản sao lưu vẫn
dùng để tra cứu dữ liệu cũ.

## Lưu ý

- Mã phiếu và mã GCN tự sinh được tính từ dữ liệu còn tồn tại, nên sau khi dọn sẽ tự bắt đầu lại từ đầu.
- Script dùng `TRUNCATE` không có `CASCADE` để không xóa lan ngoài ý muốn. Nếu còn bảng lạ tham chiếu tới các bảng
  nghiệp vụ, Postgres báo lỗi "cannot truncate a table referenced in a foreign key constraint" và mọi thứ được hoàn tác:
  khi đó thêm bảng đó vào danh sách `v_business_tables` (đặt TRƯỚC bảng mà nó tham chiếu) rồi chạy lại.
- Các script đã được kiểm thử trên PostgreSQL 16 với dữ liệu giả lập (từ chối khi chưa xác nhận, từ chối khi email sai,
  hoàn tác khi không còn admin, giữ nguyên danh mục, sao lưu không chứa mật khẩu, khôi phục đúng thứ tự). Chưa chạy trên
  DB thật: hãy đọc kết quả bước 3 kỹ trước khi chạy bước 6.