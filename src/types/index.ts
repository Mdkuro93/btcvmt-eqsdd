export type Role = 'btc_manager' | 'capital_dept' | 'project_dept' | 're_dept' | 'viewer' | 'super_admin' | 'admin' | 'warehouse_manager';

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
  areas?: { name: string; region_id?: string; regions?: { name: string } };
}

export interface Profile {
  id: string;
  email?: string;
  full_name?: string;
  role: Role;
  region_id: string | null;      // NULL = không giới hạn vùng (all)
  area_id: string | null;         // NULL = toàn vùng
  project_ids: string[] | null;   // NULL = không giới hạn theo dự án cụ thể
  managed_warehouse_ids?: string[] | null; // Danh sách ID kho Thủ kho phụ trách
  permissions: string[] | null;   // NULL = dùng mặc định theo role; có giá trị = ghi đè chi tiết
  status: 'active' | 'inactive' | 'disabled';
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
