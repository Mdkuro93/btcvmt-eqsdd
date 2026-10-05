# Prompt sửa code cho AI Studio (quy mô hàng chục nghìn GCN)

Dán TỪNG prompt một, kiểm tra xong mới sang prompt tiếp. Làm theo thứ tự. Mỗi prompt đều kết thúc bằng yêu cầu "không sửa gì ngoài phạm vi".

Điều kiện: đã chạy migration 0067–0070 trên Supabase TRƯỚC prompt 1 và 5.

---

## Prompt 1 — Hủy phiếu cho quản lý kho (đi cùng 0067)
```
Trong src/pages/Requests.tsx, biến canVoidTicket (khoảng dòng 115) hiện chỉ cho admin/super_admin/btc_manager.
Đổi: warehouse_manager cũng được hiện nút "Hủy phiếu", nhưng CHỈ với dòng phiếu mà getResponsibleWarehouseId(item, tx.type)
nằm trong profile.managed_warehouse_ids. Admin/super_admin/btc_manager giữ nguyên (mọi kho).
Điều kiện trạng thái hiện nút (approved / checked_out) giữ nguyên.
DB đã tự chặn (RPC void_transaction_item), phần này chỉ để giao diện hiện đúng. Không sửa gì khác.
```

## Prompt 2 — Tạo đợt kiểm kê gọi RPC (đi cùng 0070)
```
Trong src/api/inventoryAudits.ts, hàm createInventoryAudit, nhánh isSupabaseConfigured:
thay toàn bộ bước 1-3 (đọc danh sách assets, insert inventory_audits, insert inventory_audit_items) bằng MỘT lời gọi:
  const { data: auditId, error } = await supabase.rpc('create_inventory_audit', { p_warehouse_id: warehouseId, p_notes: notes ?? null });
Nếu error thì throw new Error(error.message). Sau đó giữ bước ghi logActivity, dùng số lượng lấy từ detail.total_expected
(thay vì assetList.length), rồi gọi getInventoryAuditDetail(auditId) như cũ.
Không sửa nhánh mock. Không sửa hàm khác.
```

## Prompt 3 — Tải chi tiết kiểm kê theo trang, không bị cắt 1.000 dòng
```
Trong src/api/inventoryAudits.ts, hàm getInventoryAuditDetail:
(a) Truy vấn inventory_audit_items hiện không có range nên Supabase cắt ở 1.000 dòng. Đổi thành lấy theo trang
    (range) với tham số page và pageSize (mặc định 200), kèm { count: 'exact' }; trả thêm totalItems.
(b) Gộp thông tin tài sản vào cùng truy vấn bằng quan hệ asset:assets(...) thay vì gọi .in('id', slice) 500 id
    (URL quá dài có thể bị từ chối). Nếu vẫn phải dùng .in thì chunk tối đa 100 id.
(c) Cập nhật src/pages/InventoryAudits.tsx để có phân trang + ô tìm kiếm + bộ lọc finding_status chạy phía server.
Các số tổng (total_expected, total_found, total_missing...) lấy từ bảng inventory_audits, KHÔNG đếm từ mảng đã tải.
Không sửa gì ngoài phạm vi trên.
```

## Prompt 4 — Hoàn tất kiểm kê không được ghi đè Ghi chú
```
Trong src/api/inventoryAudits.ts, hàm completeInventoryAudit:
(a) Hiện cập nhật assets.notes = '[KIỂM KÊ KHO]...' và '[Vị trí kho thực tế: ...]', GHI ĐÈ toàn bộ ghi chú cũ của GCN.
    Đổi thành NỐI THÊM vào cuối ghi chú hiện có (không mất nội dung cũ). Chưa đổi cấu trúc cột.
(b) Các lệnh .in('id', ids) chia chunk tối đa 100 id mỗi lần.
(c) Nếu một lệnh cập nhật assets lỗi thì dừng, KHÔNG đánh dấu đợt kiểm kê hoàn tất, và báo lỗi thật cho người dùng
    (hiện chỉ console.warn rồi vẫn hoàn tất).
(d) Vòng for cập nhật từng GCN misplaced thành cập nhật theo lô.
Không sửa gì ngoài phạm vi.
```

## Prompt 5 — Kiểm tra trùng GCN và chọn GCN phía server
```
(1) src/components/EditAssetModal.tsx dòng ~84 gọi fetchAssets({}, 1, 5000) để kiểm tra trùng GCN: chỉ kiểm được 1.000 dòng đầu.
    Thay bằng truy vấn trực tiếp trên DB: tìm theo certificate_no (và legal_lot_code, map_sheet_no, land_lot_no,
    project_id) rồi so sánh kết quả. Không tải toàn bộ danh sách.
(2) src/components/DecideRequestModal.tsx dòng ~50 gọi fetchAssets() không tham số (chỉ ra 25 GCN đầu, không lọc kho).
    Đổi thành ô tìm GCN gõ-để-tìm: gọi fetchAssets với search, warehouseId của phiếu, pageSize 20, debounce 300ms.
(3) src/components/CreateAssetModal.tsx, ReviewDeclarationRequestModal.tsx, src/pages/Requests.tsx (dòng ~188, ~219):
    generateNextAssetCode dựa trên mảng fetchAssets() chỉ có 25 dòng. Đổi sang lấy mã lớn nhất theo tiền tố bằng
    truy vấn riêng: .select('asset_code').like('asset_code', prefix + '%').order('asset_code', {ascending:false}).limit(1).
    (DB đã có ràng buộc duy nhất asset_code ở 0069, nếu trùng thì báo lỗi và tự thử lại tối đa 3 lần.)
Không sửa gì ngoài phạm vi.
```

## Prompt 6 — Xuất Excel và chốt báo cáo không dùng 10.000 dòng tải về trình duyệt
```
src/api/reports.ts hàm fetchReportDetailedAssets đang gọi fetchAssets(..., 1, 10000): Supabase cắt ở 1.000 dòng và lọc vùng/kho
chạy phía client sau khi tải, nên báo cáo xuất Excel và bản chốt (report_snapshots.report_data) bị THIẾU dữ liệu mà không báo lỗi.
Yêu cầu:
(a) Tải theo trang (mỗi trang 1.000) cho đến hết, có thanh tiến trình, và đối chiếu số dòng nhận được với totalCount;
    nếu lệch thì báo lỗi, KHÔNG xuất file thiếu.
(b) Chuyển lọc theo vùng và allowedWarehouseIds sang điều kiện truy vấn phía server (như projectId/warehouseId).
(c) Với bản chốt báo cáo: chỉ lưu số liệu tổng hợp (từ get_report_statistics), không lưu toàn bộ danh sách GCN vào report_data.
Không sửa gì ngoài phạm vi.
```

## Prompt 7 — Thêm kiểm tra cho logic tách sổ (khi dev sửa tiếp 0065)
Đưa đoạn này cho người viết migration 0065 để thêm vào hàm `_process_single_declaration_approval` (trong một migration MỚI, không sửa 0065 đã chạy):
```
Sau khi SELECT ... FROM public.assets WHERE id = v_parent_id FOR UPDATE, thêm:
  IF v_parent.invalidation_type = 'FULL' OR v_parent.lifecycle_status = 'invalidated' THEN
    RAISE EXCEPTION 'GCN gốc đã bị vô hiệu toàn phần, không thể tách/cấp đổi tiếp.';
  END IF;
  IF v_rel_type = 'SPLIT_PARTIAL' AND NOT v_is_high_rise THEN
    IF v_req.area IS NULL OR v_req.area <= 0 OR v_req.area > v_parent.area THEN
      RAISE EXCEPTION 'Diện tích tách (%) phải > 0 và không vượt diện tích GCN gốc (%).', v_req.area, v_parent.area;
    END IF;
    IF v_rem_area IS NOT NULL AND abs((v_parent.area - v_req.area) - v_rem_area) > 0.01 THEN
      RAISE EXCEPTION 'Diện tích còn lại (%) không khớp diện tích gốc trừ diện tích tách.', v_rem_area;
    END IF;
  END IF;
Ngoài ra: khi vô hiệu toàn phần, KHÔNG đặt custody_status = 'checked_out' cho GCN đã vô hiệu
(báo cáo "đang xuất kho" sẽ đếm nhầm); dùng lifecycle_status = 'invalidated' để phân biệt.
```

---

## Prompt 8 — Đường link bản scan: kiểm tra định dạng và cách mở (đi cùng 0071)
```
Bản scan GCN lưu dưới dạng đường link SharePoint/OneDrive trong scan_file_url. Hiện không kiểm tra gì và
src/components/DocumentPreviewModal.tsx gắn thẳng giá trị vào <iframe src> và <a href> (nguy cơ XSS với 'javascript:').
Yêu cầu:
(1) Tạo src/lib/scanLink.ts với hàm validateScanLink(input: string): { ok: boolean; url?: string; error?: string }.
    Quy tắc: trim; rỗng thì hợp lệ (trả url rỗng); nếu có giá trị thì bắt buộc bắt đầu bằng https://; hostname phải kết thúc bằng
    sharepoint.com, 1drv.ms hoặc onedrive.live.com; tối đa 2000 ký tự. Đường dẫn Storage tương đối cũ (chỉ gồm chữ, số, _ . / -) vẫn hợp lệ.
(2) Dùng validateScanLink trong CreateAssetModal, EditAssetModal, ReviewDeclarationRequestModal, RequestModal và nhập Excel:
    không hợp lệ thì chặn lưu và báo lỗi tiếng Việt rõ ràng.
(3) DocumentPreviewModal: với link ngoài (SharePoint/OneDrive) KHÔNG nhúng <iframe> (các trang này thường chặn nhúng). Chỉ hiện nút
    "Mở bản scan" mở tab mới bằng window.open(url, '_blank', 'noopener,noreferrer') và nút "Sao chép link". Chỉ giữ iframe/preview
    cho đường dẫn Storage nội bộ. Nếu url không qua validateScanLink thì không render link, hiện thông báo "Link bản scan không hợp lệ".
Không sửa gì ngoài phạm vi.
```
