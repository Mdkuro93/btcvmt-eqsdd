# Hướng dẫn chạy Supabase Migrations

Thư mục này chứa toàn bộ các script SQL để khởi tạo và cập nhật cơ sở dữ liệu. Nhằm đảm bảo tính thống nhất và an toàn khi chạy trên môi trường thực tế (Production), tất cả các file đã được đổi tên và đánh số thứ tự từ `0000` đến `0008`.

## ⚠️ LƯU Ý ĐẶC BIỆT DÀNH CHO PRODUCTION
**TUYỆT ĐỐI KHÔNG CHẠY LẠI FILE `0000_initial_schema.sql` TRÊN DATABASE THẬT MÀ ĐANG CÓ DỮ LIỆU.**
- File `0000_initial_schema.sql` chứa các lệnh `DROP TABLE ... CASCADE`. Nếu chạy lại file này, toàn bộ dữ liệu trên database của bạn sẽ bị xoá vĩnh viễn.
- File này chỉ được dùng khi khởi tạo một database hoàn toàn mới (môi trường Dev/Test) hoặc khi bạn đã backup kỹ và muốn đập đi xây lại toàn bộ hệ thống.

## Danh sách các Migration và Thứ tự thực thi
Nếu bạn đang cập nhật một database có sẵn, hãy chạy các file từ `0001` đến `0008` (hoặc chỉ chạy các file mà database của bạn chưa có).

* **`0000_initial_schema.sql`**: (Tên cũ: `supabase-schema.sql`) Chứa Schema gốc của hệ thống. Dùng để khởi tạo bảng lần đầu. Đã bị lệch so với hệ thống do có thêm tính năng.
* **`0001_patch_schema.sql`**: (Tên cũ: `patch_schema.sql`)
  * Thay đổi: Thêm các cột cho bảng `assets` (`certificate_group`, `lot_no`, `usage_term_type`, `usage_term_date`), migrate dữ liệu cũ từ `usage_term` sang format mới và xoá cột `usage_term`.
  * Thay đổi: Ghi đè function `decide_transaction_item` phục vụ cho luồng duyệt tài sản.
* **`0002_audit_logs.sql`**: (Tên cũ: `audit_logs_migration.sql`)
  * Thay đổi: Thêm cột `updated_by` vào `assets`, tạo bảng `audit_logs` để ghi nhật ký, cấp quyền (RLS) và đánh index.
* **`0003_add_commercial_fields.sql`**: (Tên cũ: `migration_add_commercial_fields.sql`)
  * Thay đổi: Thêm các trường dữ liệu kinh doanh cho `assets` (`business_project`, `business_plot`, `is_commercial_allocated`) và đánh index.
* **`0004_rls_and_access_control.sql`**: (Tên cũ: `004_rls_and_access_control_migration.sql`)
  * Thay đổi: Bật `ROW LEVEL SECURITY (RLS)` cho tất cả các bảng lớn (assets, profiles, warehouses, regions, areas, projects, transactions, transaction_items).
  * Thay đổi: Tạo bảng `access_logs` và áp dụng hệ thống chính sách (Policies) để phân quyền dữ liệu tuỳ theo người dùng.
* **`0005_report_snapshots_and_rls_lock.sql`**: (Tên cũ: `005_report_snapshots_and_rls_lock.sql`)
  * Thay đổi: Tạo bảng `report_snapshots` lưu lịch sử chốt kỳ báo cáo, bật RLS, cấm sửa/xoá sau khi báo cáo đã bị khóa.
* **`0006_merge_app_users_into_profiles.sql`**: (Tên cũ: `006_merge_app_users_into_profiles.sql`)
  * Thay đổi: Thêm cột `access_expires_at` và `username` vào bảng `profiles` để hợp nhất với bảng `app_users` nhằm dọn dẹp hệ thống đăng nhập.
* **`0007_performance_indexes.sql`**: (Tên cũ: `performance_indexes.sql`)
  * Thay đổi: Tạo hàng loạt các Index lớn để tăng tốc truy vấn hệ thống (đặc biệt là bảng assets).
* **`0008_update_profiles_role_constraint.sql`**: (Tạo mới)
  * Thay đổi: Cập nhật ràng buộc (CHECK constraint) cho cột `role` trong bảng `profiles` nhằm bao gồm đầy đủ tất cả các vai trò mới như `super_admin`, `admin`, `warehouse_manager`, `chuyen_vien`, v.v.

Bạn hãy xem xét kỹ và chạy từng file SQL trên Supabase Editor nhé!
