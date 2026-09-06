export type Role = 'btc_manager' | 'capital_dept' | 'project_dept' | 're_dept' | 'viewer' | 'super_admin' | 'admin' | 'warehouse_manager' | 'supervisor' | 'investor' | 'user' | 'quan_ly' | 'chuyen_vien' | 'nguoi_dung' | (string & {});

export interface Region {
  id: string;
  name: string;
}

export interface Area {
  id: string;
  region_id: string;
  name: string;
  regions?: { name: string };
}


export interface StorageLocation {
  id: string;
  warehouse_id: string;
  floor: string | null;
  row: string | null;
  shelf: string | null;
  box: string | null;
  capacity: number | null;
}

export interface Warehouse {
  id: string;
  name: string;
  region_id: string | null;
  code?: string | null;         // e.g. "001", "002"
  region_code?: string | null;  // e.g. "VMB", "VMT", "VMN"
  is_central: boolean;
  regions?: { name: string };
}

export interface Project {
  id: string;
  area_id: string;
  name: string;
  default_owner_entity_id?: string | null;
  areas?: { name: string; region_id?: string; regions?: { name: string } };
}

export interface AppUser {
  id: string;
  username: string;
  role: Role | string;
  status: 'pending' | 'approved' | 'rejected' | 'disabled' | 'active' | 'inactive';
  access_expires_at: string | null;
  created_at?: string;
  full_name?: string;
  phone?: string | null;
  organization?: string | null;
  purpose?: string | null;
}

export interface AppUserSession {
  id: string;
  username: string;
  role: Role | string;
  status: 'pending' | 'approved' | 'rejected' | 'disabled' | 'active' | 'inactive';
  access_expires_at: string | null;
  created_at?: string;
  full_name?: string;
}

export interface Profile {
  id: string;
  username?: string;
  email?: string;
  full_name?: string;
  role: Role;
  originalRole?: Role | string;
  region_id: string | null;      // NULL = không giới hạn vùng (all)
  area_id: string | null;         // NULL = toàn vùng
  project_ids: string[] | null;   // NULL = không giới hạn theo dự án cụ thể
  managed_warehouse_ids?: string[] | null; // Danh sách ID kho Thủ kho phụ trách
  assigned_warehouse_ids?: string[] | null; // Danh sách ID kho được phân công phụ trách/giám sát
  owner_entity_ids?: string[] | null; // Danh sách ID thực thể CĐT/NĐT được gắn với tài khoản
  permissions: string[] | null;   // NULL = dùng mặc định theo role; có giá trị = ghi đè chi tiết
  status: 'active' | 'inactive' | 'disabled' | 'pending' | 'approved' | 'rejected';
  access_expires_at?: string | null; // Thời gian hết hạn tra cứu tạm thời (ISO timestamp)
  phone?: string | null;
  organization?: string | null;
  purpose?: string | null;
  created_at?: string;
  regions?: { name: string };
  areas?: { name: string };
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'request_approved' | 'request_approved_with_changes' | 'request_rejected' | string;
  title: string;
  body: string;
  transaction_item_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  asset_id: string;
  confirmed_asset_id?: string | null;
  type: TransactionType;
  status: TransactionStatus;
  details?: any;
  requested_details?: any;
  voucher_code?: string | null;
  decision_notes?: string | null;
  decided_at?: string | null;
  decided_by?: { full_name?: string; email?: string } | null;
  asset?: Asset;
  confirmed_asset?: Asset;
}

export type CustodyStatus = 'in_stock' | 'checked_out' | 'in_transit';
export type LifecycleStatus = 'active' | 'split' | 'invalidated';
export type SaleStatus = 'not_ready' | 'ready_for_sale' | 'sold';
export type MortgageStatus = 'none' | 'mortgaged';

export interface Asset {
  id: string;
  asset_code?: string | null;         // Mã định danh tự sinh: VMT_BDS_00001
  collateral_type?: string | null;     // Loại TSĐB (BDS, TSCD, VONGOP, COPHAN...)
  certificate_no: string;
  project_id: string | null;
  certificate_group?: 'so_lon' | 'so_nho' | null;
  subdivision: string | null;
  lot_no?: string | null;
  area: number | null;
  owner_name: string | null;
  current_owner_entity_id?: string | null; // Thực thể sở hữu (CĐT / NĐT)
  current_owner_role?: 'cdt' | 'ndt' | null; // Vai trò chủ sở hữu hiện tại
  current_owner_entity?: InvestorEntity | null;
  investor_entities?: { name: string; company_code?: string | null } | null;

  // Thông tin kinh doanh / Thương mại (Commercial Info)
  business_project_name?: string | null; // Tên dự án kinh doanh (VD: Cồn Dầu, Spana, Cora...)
  business_plot_code?: string | null;    // Mã lô kinh doanh (VD: LK02-15, BT-VIP-08...)
  
  // Thông tin thửa đất & Địa lý
  map_sheet_no?: string | null;       // Số tờ bản đồ
  land_lot_no?: string | null;        // Số thửa đất
  province?: string | null;           // Tỉnh / Thành phố
  district?: string | null;           // Quận / Huyện
  ward?: string | null;               // Xã / Phường
  address_detail?: string | null;     // Địa chỉ chi tiết

  // Loại đất & Hạn dùng
  usage_purpose?: string | null;      // Mục đích sử dụng (Đất ở, TMDV...)
  land_use_purpose?: string | null;
  usage_term?: string | null;
  land_use_term?: string | null;
  usage_term_type?: 'fixed_date' | 'long_term' | null;
  usage_term_date?: string | null;
  
  // Pháp lý mở rộng
  asset_type?: string | null;         // Loại tài sản (Đất nền, Biệt thự...)
  registry_no?: string | null;        // Số vào sổ cấp GCN
  registry_date?: string | null;      // Ngày vào sổ
  managing_unit?: string | null;      // Đơn vị quản lý sổ      // Thời hạn sử dụng (Lâu dài, 50 năm...)

  // Hồ sơ thế chấp
  mortgage_bank?: string | null;                 // Ngân hàng nhận thế chấp
  mortgage_unit?: string | null;                 // Đơn vị thực hiện thế chấp
  mortgage_bank_2?: string | null;               // Ngân hàng cầm cố, thế chấp 2
  mortgage_unit_2?: string | null;               // Đơn vị vay 2
  mortgage_valuation?: number | null;            // Giá trị định giá
  collateral_ratio?: number | null;              // Tỷ lệ đảm bảo (%)
  credit_grant_rate?: number | null;             // Tỷ lệ cấp tín dụng (%)
  collateral_value?: number | null;              // Giá trị đảm bảo (VNĐ)
  mortgage_expected_release_date?: string | null;// Ngày dự kiến giải chấp

  // Ghi chú
  notes?: string | null;              // Ghi chú tự do cấp tài sản

  // File scan & Tách sổ
  scan_file_url?: string | null;      // Đường dẫn / Upload scan GCN
  parent_asset_id?: string | null;    // Sổ gốc (nếu là sổ con sau tách)

  // Thông tin mượn
  expected_return_date?: string | null; // Hạn trả mượn dự kiến
  borrow_purpose?: string | null;       // Mục đích mượn

  custody_status: CustodyStatus;
  lifecycle_status: LifecycleStatus;
  sale_status: SaleStatus;
  mortgage_status: MortgageStatus;
  warehouse_id: string | null;
  location_id?: string | null;
  current_holder_dept?: string | null;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
  updater?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
  projects?: {
    name: string;
    areas?: {
      name: string;
      region_id?: string;
      regions?: { name: string };
    };
  };
  warehouses?: { name: string; is_central: boolean; code?: string; region_code?: string };
}

export interface AuditLog {
  id: string;
  record_id: string;
  action: 'UPDATE' | 'BULK_UPDATE' | 'IMPORT' | 'CREATE' | 'DELETE' | string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  changed_by?: string | null;
  changed_by_name?: string | null;
  notes?: string | null;
  created_at: string;
  profiles?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export type TransactionType = 'checkout' | 'checkin' | 'split' | 'mortgage' | 'sale_update';
export type TransactionStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  organization?: string | null;
  purpose?: string | null;
  warehouse_id: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  created_at: string;
  reviewer?: { full_name?: string; email?: string } | null;
  warehouse?: Warehouse;
  warehouses?: { name: string; code?: string; is_central?: boolean };
}

export interface ViewerWarehouseAccess {
  id: string;
  user_id: string;
  warehouse_id: string;
  approved_by: string;
  approved_at: string;
  expires_at: string | null;
  notes?: string | null;
  user?: Profile;
  warehouse?: Warehouse;
  approver?: Profile;
  profiles?: { full_name?: string; email?: string };
  warehouses?: { name: string; code?: string; is_central?: boolean };
}

export interface AccessLog {
  id: string;
  user_id: string;
  action: 'login' | 'view_asset' | 'search' | 'export' | string;
  resource_table?: string | null;
  resource_id?: string | null;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
  user?: { full_name?: string; email?: string } | null;
  profiles?: { full_name?: string; email?: string } | null;
}

export type ReportPeriodStatus = 'open' | 'locked';

/**
 * Cấu trúc dữ liệu tĩnh (Denormalized) của từng tài sản trong kỳ báo cáo
 * Lưu toàn bộ chuỗi văn bản tĩnh (Tên phòng ban, loại đất, loại tài sản, dự án...)
 * để tránh việc đổi tên danh mục sau này làm biến dạng số liệu lịch sử đã chốt.
 */
export interface DenormalizedReportAsset {
  asset_id: string;
  asset_code?: string;
  certificate_no: string;
  
  // CHUỖI VĂN BẢN TĨNH (STATIC TEXT)
  project_name: string;                   // Tên dự án tĩnh: VD "KĐT Nam Hòa Xuân"
  business_project_name?: string;         // Tên dự án kinh doanh tĩnh: VD "Cồn Dầu"
  area_name?: string;                     // Tên khu vực/vùng tĩnh
  region_name?: string;                   // Tên miền tĩnh: VD "Vùng Miền Trung (VMT)"
  warehouse_name: string;                 // Tên kho tĩnh: VD "Kho Trung Tâm BTC"
  department_name?: string;               // Tên đơn vị quản lý: VD "Ban Nguồn Vốn"
  current_holder_dept?: string;           // Tên đơn vị đang mượn sổ: VD "Ban Pháp chế"
  
  asset_type_name: string;                // Loại tài sản tĩnh: VD "Bất động sản đất nền", "Biệt thự"
  land_use_type_name: string;             // Loại đất tĩnh: VD "Đất ở tại đô thị", "Đất TMDV"
  usage_purpose?: string;                 // Mục đích sử dụng tĩnh
  usage_term?: string;                    // Thời hạn sử dụng tĩnh: VD "Lâu dài", "Đến năm 2070"
  
  owner_name: string;                     // Chủ sở hữu tĩnh: VD "Công ty Cổ phần Đầu tư VMT"
  certificate_group_label?: string;       // Nhóm sổ: "Sổ lớn" | "Sổ nhỏ" | "Sổ con (Tách)" | "Sổ chính"
  subdivision?: string;                   // Phân khu: "B2-12"
  lot_no?: string;                        // Số lô/thửa: "35"
  land_lot_no?: string;                   // Thửa đất số: "105"
  map_sheet_no?: string;                  // Tờ bản đồ số: "12"
  plot_code: string;                      // Mã lô đất: "B2-12-35"
  business_plot_code?: string;            // Mã kinh doanh: "LK02-15"
  area: number;                           // Diện tích (m²)
  address_detail: string;                 // Địa chỉ chi tiết
  
  // Thông tin thế chấp tĩnh
  mortgage_status_label: string;          // "Đã thế chấp" | "Chưa thế chấp"
  mortgage_bank_name?: string;            // "BIDV - Chi nhánh TP.HCM"
  mortgage_unit_name?: string;            // "Ban Nguồn Vốn"
  mortgage_bank_2_name?: string;
  mortgage_unit_2_name?: string;
  mortgage_valuation?: number;            // Giá trị định giá (VNĐ)
  collateral_ratio?: number;              // Tỷ lệ đảm bảo (%)
  collateral_value?: number;              // Giá trị đảm bảo (VNĐ)
  
  // Trạng thái lưu kho & Vòng đời tĩnh
  custody_status_label: string;           // "Lưu kho an toàn" | "Đang xuất mượn" | "Đang luân chuyển"
  lifecycle_status_label: string;         // "Hiệu lực" | "Đã tách thửa" | "Đã hủy"
  notes?: string;                         // Ghi chú chi tiết tĩnh
}

export interface ReportSnapshot {
  id: string;
  report_code: string;                    // Mã báo cáo: BC-2026-08
  report_period: string;                  // Tên kỳ báo cáo: "Tháng 08/2026", "Năm 2026"
  period_status: ReportPeriodStatus;      // 'open' | 'locked'
  title: string;                          // Tiêu đề báo cáo
  region?: string;
  warehouse_id?: string | null;
  warehouse_name?: string | null;         // Tên kho tĩnh
  department_name?: string | null;        // Đơn vị lập báo cáo tĩnh
  submitted_by?: string | null;
  submitted_by_name?: string | null;      // Tên người nộp tĩnh
  submitted_at: string;
  
  locked_at?: string | null;              // Thời điểm khóa
  locked_by?: string | null;
  locked_by_name?: string | null;         // Người khóa tĩnh
  
  reopened_at?: string | null;            // Thời điểm mở khóa gần nhất
  reopened_by?: string | null;
  reopened_by_name?: string | null;       // Người mở khóa tĩnh
  reopen_reason?: string | null;          // Lý do mở khóa bắt buộc
  
  total_assets: number;
  total_area: number;
  total_valuation: number;
  total_collateral_value: number;
  
  // Dữ liệu tĩnh denormalized JSONB
  report_data: DenormalizedReportAsset[];
  
  summary_stats?: Record<string, any>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// INVENTORY AUDITS (KIỂM KÊ KHO THỰC TẾ)
// ==============================================================================

export type InventoryAuditStatus = 'in_progress' | 'completed';
export type InventoryAuditFindingStatus = 'pending' | 'matched' | 'missing' | 'misplaced';

export interface InventoryAuditItem {
  id: string;
  audit_id: string;
  asset_id: string;
  expected_status: string;           // 'in_stock'
  expected_location?: string | null; // Vị trí dự kiến (kệ/ngăn/kho)
  actual_found: boolean;             // Đã tìm thấy hay chưa
  actual_location?: string | null;   // Vị trí thực tế nếu sai vị trí
  finding_status: InventoryAuditFindingStatus; // 'pending' | 'matched' | 'missing' | 'misplaced'
  note?: string | null;              // Ghi chú hiện trạng
  audited_at?: string | null;
  created_at?: string;
  updated_at?: string;
  asset?: Asset;
}

export interface InventoryAudit {
  id: string;
  warehouse_id: string;
  performed_by: string;
  started_at: string;
  completed_at?: string | null;
  status: InventoryAuditStatus;
  notes?: string | null;
  total_expected: number;
  total_found: number;
  total_missing: number;
  total_misplaced: number;
  created_at?: string;
  updated_at?: string;
  warehouse?: Warehouse;
  warehouses?: { name: string; code?: string; is_central?: boolean; region_code?: string };
  performer?: Profile | { full_name?: string; email?: string };
  profiles?: { full_name?: string; email?: string };
  items?: InventoryAuditItem[];
}

export interface InvestorEntity {
  id: string;
  name: string;
  company_code?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface AssetOwnershipTransfer {
  id: string;
  asset_id: string;
  from_entity_id?: string | null;
  from_role?: string | null;
  to_entity_id: string;
  to_role: 'cdt' | 'ndt';
  transferred_at?: string;
  transferred_by?: string | null;
  note?: string | null;
  asset?: Asset;
  from_entity?: InvestorEntity;
  to_entity?: InvestorEntity;
  performer?: Profile | { id?: string; full_name?: string | null; email?: string | null } | null;
}


