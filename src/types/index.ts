export type Role = 'btc_manager' | 'capital_dept' | 'project_dept' | 're_dept' | 'viewer';

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

export interface Warehouse {
  id: string;
  name: string;
  region_id: string | null;
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
  permissions: string[] | null;   // NULL = dùng mặc định theo role; có giá trị = ghi đè chi tiết
  status: 'active' | 'inactive' | 'disabled';
  regions?: { name: string };
  areas?: { name: string };
}

export type CustodyStatus = 'in_stock' | 'checked_out';
export type LifecycleStatus = 'active' | 'split' | 'invalidated';
export type SaleStatus = 'not_ready' | 'ready_for_sale' | 'sold';
export type MortgageStatus = 'none' | 'mortgaged';

export interface Asset {
  id: string;
  certificate_no: string;
  project_id: string | null;
  subdivision: string | null;
  area: number | null;
  owner_name: string | null;
  custody_status: CustodyStatus;
  lifecycle_status: LifecycleStatus;
  sale_status: SaleStatus;
  mortgage_status: MortgageStatus;
  warehouse_id: string | null;
  current_holder_dept: string | null;
  created_at: string;
  projects?: {
    name: string;
    areas?: {
      name: string;
      region_id?: string;
      regions?: { name: string };
    };
  };
  warehouses?: { name: string; is_central: boolean };
}

export type TransactionType = 'checkout' | 'checkin' | 'split' | 'mortgage' | 'sale_update';
export type TransactionStatus = 'pending' | 'approved' | 'rejected' | 'completed';
