import { Asset, Region, Area, Warehouse, Project, Profile, Role, AuditLog } from '../types';
import { DEFAULT_PERMISSIONS_BY_ROLE } from './permissions';

const MOCK_REGIONS: Region[] = [
  { id: 'reg-01', name: 'Miền Nam' },
  { id: 'reg-02', name: 'Miền Bắc' },
  { id: 'reg-03', name: 'Miền Trung' },
];

const MOCK_AREAS: Area[] = [
  { id: 'area-01', region_id: 'reg-01', name: 'TP. Hồ Chí Minh', regions: { name: 'Miền Nam' } },
  { id: 'area-02', region_id: 'reg-01', name: 'Bình Dương', regions: { name: 'Miền Nam' } },
  { id: 'area-03', region_id: 'reg-01', name: 'Đồng Nai', regions: { name: 'Miền Nam' } },
  { id: 'area-04', region_id: 'reg-02', name: 'Hà Nội', regions: { name: 'Miền Bắc' } },
];

const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-01', name: 'Kho Trung Tâm BTC', code: '001', region_code: 'VMN', region_id: 'reg-01', is_central: true, regions: { name: 'Miền Nam' } },
  { id: 'wh-02', name: 'Kho Dự Án Bình Dương', code: '002', region_code: 'VMN', region_id: 'reg-01', is_central: false, regions: { name: 'Miền Nam' } },
  { id: 'wh-03', name: 'Kho Chi Nhánh Hà Nội', code: '003', region_code: 'VMB', region_id: 'reg-02', is_central: false, regions: { name: 'Miền Bắc' } },
];

const MOCK_PROJECTS: Project[] = [
  { id: 'proj-01', area_id: 'area-01', name: 'Dự án Khu Đô Thị VMT Central', areas: { name: 'TP. Hồ Chí Minh', region_id: 'reg-01' } },
  { id: 'proj-02', area_id: 'area-02', name: 'Dự án Khu Dân Cư VMT Riverside', areas: { name: 'Bình Dương', region_id: 'reg-01' } },
  { id: 'proj-03', area_id: 'area-03', name: 'Dự án Tổ Hợp Thương Mại VMT Plaza', areas: { name: 'Đồng Nai', region_id: 'reg-01' } },
  { id: 'proj-04', area_id: 'area-04', name: 'Dự án VMT Capital Tower', areas: { name: 'Hà Nội', region_id: 'reg-02' } },
];

const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-01',
    asset_code: 'VMN_BDS_00000001',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự',
    certificate_no: 'GCN-VMT-001',
    subdivision: 'Phân khu A',
    lot_no: 'A-01',
    business_project_name: 'Khu Đô Thị Central Palm',
    business_plot_code: 'PALM-A01',
    area: 450.5,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    map_sheet_no: '04',
    land_lot_no: '112',
    province: 'TP. Hồ Chí Minh',
    district: 'Quận 2 (Thành phố Thủ Đức)',
    ward: 'Phường An Phú',
    address_detail: '12 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-vmt-001.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'not_ready',
    mortgage_status: 'none',
    project_id: 'proj-01',
    warehouse_id: 'wh-01',
    current_holder_dept: null,
    created_at: '2025-01-10T08:00:00Z',
    projects: { name: 'Dự án Khu Đô Thị VMT Central', areas: { name: 'TP. Hồ Chí Minh', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Trung Tâm BTC', code: '001', region_code: 'VMN', is_central: true },
  },
  {
    id: 'asset-02',
    asset_code: 'VMN_BDS_00000002',
    collateral_type: 'BDS',
    asset_type: 'Shophouse / Nhà phố thương mại',
    certificate_no: 'GCN-VMT-002',
    subdivision: 'Lô B2',
    lot_no: 'B-02',
    business_project_name: 'Spana Riverside',
    business_plot_code: 'SP-SH-02',
    area: 1200.0,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    map_sheet_no: '12',
    land_lot_no: '88',
    province: 'Bình Dương',
    district: 'TP. Thuận An',
    ward: 'Phường Lái Thiêu',
    address_detail: 'Đại lộ Bình Dương, Phường Lái Thiêu, TP. Thuận An, Bình Dương',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2072)',
    mortgage_bank: 'Ngân hàng BIDV - Chi nhánh TP.HCM',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ1',
    mortgage_valuation: 35000000000,
    mortgage_expected_release_date: '2026-12-31',
    expected_return_date: '2026-02-01',
    borrow_purpose: 'Mượn sổ nộp hồ sơ thẩm định tín dụng mở rộng hạn mức',
    scan_file_url: 'https://example.com/scan-gcn-vmt-002.pdf',
    custody_status: 'checked_out',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-02',
    warehouse_id: 'wh-02',
    current_holder_dept: 'Ban Nguồn Vốn',
    created_at: '2025-01-12T09:30:00Z',
    projects: { name: 'Dự án Khu Dân Cư VMT Riverside', areas: { name: 'Bình Dương', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Dự Án Bình Dương', code: '002', region_code: 'VMN', is_central: false },
  },
  {
    id: 'asset-03',
    asset_code: 'VMN_BDS_00000003',
    collateral_type: 'BDS',
    asset_type: 'Đất nền',
    certificate_no: 'GCN-VMT-003',
    subdivision: 'Khu công nghiệp',
    lot_no: 'CN-01',
    area: 3500.8,
    owner_name: 'Công ty TNHH BĐS VMT Đồng Nai',
    map_sheet_no: '25',
    land_lot_no: '405',
    province: 'Đồng Nai',
    district: 'TP. Biên Hòa',
    ward: 'Phường Long Bình',
    address_detail: 'KCN Long Bình, TP. Biên Hòa, Đồng Nai',
    land_use_purpose: 'Đất cơ sở sản xuất phi nông nghiệp (SKC)',
    land_use_term: 'Đến 2068',
    scan_file_url: 'https://example.com/scan-gcn-vmt-003.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-03',
    warehouse_id: 'wh-01',
    current_holder_dept: null,
    created_at: '2025-01-15T11:00:00Z',
    projects: { name: 'Dự án Tổ Hợp Thương Mại VMT Plaza', areas: { name: 'Đồng Nai', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Trung Tâm BTC', code: '001', region_code: 'VMN', is_central: true },
  },
  {
    id: 'asset-04',
    asset_code: 'VMB_BDS_00000001',
    collateral_type: 'BDS',
    asset_type: 'Tòa nhà văn phòng',
    certificate_no: 'GCN-VMT-004',
    subdivision: 'Tháp C',
    lot_no: 'TC-04',
    area: 820.0,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    map_sheet_no: '08',
    land_lot_no: '15',
    province: 'Hà Nội',
    district: 'Quận Cầu Giấy',
    ward: 'Phường Dịch Vọng Hậu',
    address_detail: 'Duy Tân, Quận Cầu Giấy, Hà Nội',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-vmt-004.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'sold',
    mortgage_status: 'none',
    project_id: 'proj-04',
    warehouse_id: 'wh-03',
    current_holder_dept: null,
    created_at: '2025-01-20T14:15:00Z',
    projects: { name: 'Dự án VMT Capital Tower', areas: { name: 'Hà Nội', region_id: 'reg-02' } },
    warehouses: { name: 'Kho Chi Nhánh Hà Nội', code: '003', region_code: 'VMB', is_central: false },
  },
];

function generateMockAssets(count: number) {
  const subdivisions = ['Phân khu A', 'Lô B2', 'Khu công nghiệp', 'Tháp C', 'Khu Biệt Thự', 'Khu Nhà Phố', 'Block D', 'Block E'];
  const custodyStatuses: ('in_stock' | 'checked_out')[] = ['in_stock', 'checked_out'];
  const lifecycleStatuses: ('active' | 'split' | 'invalidated')[] = ['active', 'split', 'invalidated'];
  const saleStatuses: ('not_ready' | 'ready_for_sale' | 'sold')[] = ['not_ready', 'ready_for_sale', 'sold'];
  const mortgageStatuses: ('none' | 'mortgaged')[] = ['none', 'mortgaged'];
  
  let currentId = 5;

  for (let i = 0; i < count; i++) {
    const proj = MOCK_PROJECTS[Math.floor(Math.random() * MOCK_PROJECTS.length)];
    const wh = MOCK_WAREHOUSES[Math.floor(Math.random() * MOCK_WAREHOUSES.length)];
    const certNo = `GCN-VMT-${(currentId++).toString().padStart(4, '0')}`;
    
    // Skew random to make mostly 'active'
    let lsIdx = Math.floor(Math.random() * 10);
    let ls: 'active' | 'split' | 'invalidated' = 'active';
    if (lsIdx === 8) ls = 'split';
    if (lsIdx === 9) ls = 'invalidated';

    MOCK_ASSETS.push({
      id: `asset-gen-${i}`,
      certificate_no: certNo,
      subdivision: subdivisions[Math.floor(Math.random() * subdivisions.length)],
      area: Math.floor(Math.random() * 5000) + 50,
      owner_name: 'Công ty Cổ phần Đầu tư VMT',
      map_sheet_no: Math.floor(Math.random() * 50).toString(),
      land_lot_no: Math.floor(Math.random() * 500).toString(),
      province: 'Tỉnh / TP Ngẫu Nhiên',
      district: 'Quận / Huyện Ngẫu Nhiên',
      ward: 'Phường / Xã Ngẫu Nhiên',
      address_detail: 'Địa chỉ ngẫu nhiên',
      land_use_purpose: 'Đất ở tại đô thị (ODT)',
      land_use_term: 'Lâu dài',
      custody_status: custodyStatuses[Math.floor(Math.random() * custodyStatuses.length)],
      lifecycle_status: ls,
      sale_status: saleStatuses[Math.floor(Math.random() * saleStatuses.length)],
      mortgage_status: mortgageStatuses[Math.floor(Math.random() * mortgageStatuses.length)],
      project_id: proj.id,
      warehouse_id: wh.id,
      current_holder_dept: null,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString(),
      projects: { name: proj.name, areas: proj.areas as any },
      warehouses: { name: wh.name, code: wh.code, region_code: wh.region_code, is_central: wh.is_central },
    });
  }
}

generateMockAssets(500);

const MOCK_TRANSACTIONS: any[] = [
  {
    id: 'tx-01',
    type: 'checkout',
    created_at: '2025-02-14T09:00:00Z',
    notes: 'Mượn sổ đỏ phục vụ thẩm định hồ sơ vay ngân hàng BIDV',
    created_by: { full_name: 'Chuyên viên Ban Nguồn Vốn', email: 'capital@btcvmt.vn' },
    items: [
      {
        id: 'txi-01',
        asset_id: 'asset-02',
        type: 'checkout',
        status: 'approved',
        details: { department: 'Ban Nguồn Vốn', reason: 'Vay thế chấp BIDV' },
        asset: MOCK_ASSETS[1],
        decided_by: { full_name: 'Quản trị viên (BTC VMT)' },
        decision_notes: 'Đã bàn giao sổ ngày 15/02',
      },
    ],
  },
  {
    id: 'tx-02',
    type: 'sale_update',
    created_at: '2025-02-20T14:00:00Z',
    notes: 'Đăng ký sẵn sàng bán cho lô công nghiệp',
    created_by: { full_name: 'Chuyên viên Ban KD BĐS', email: 're_dept@btcvmt.vn' },
    items: [
      {
        id: 'txi-02',
        asset_id: 'asset-03',
        type: 'sale_update',
        status: 'pending',
        details: { saleStatus: 'ready_for_sale' },
        asset: MOCK_ASSETS[2],
      },
    ],
  },
];

const MOCK_ACTIVITY_LOGS: any[] = [
  {
    id: 'log-01',
    asset_id: 'asset-01',
    log_date: '2025-01-10T08:00:00Z',
    action_type: 'Thêm mới GCN',
    document_no: 'CT-001',
    description: 'Nhập thông tin GCN-VMT-001 vào Kho Trung Tâm BTC',
    used_by: 'BTC VMT',
    performer: { full_name: 'Quản trị viên (BTC VMT)', email: 'admin@btcvmt.vn' },
    warehouse: { name: 'Kho Trung Tâm BTC' },
  },
  {
    id: 'log-02',
    asset_id: 'asset-02',
    log_date: '2025-02-15T10:30:00Z',
    action_type: 'Mượn/Xuất sổ',
    document_no: 'PXB-2025/02',
    description: 'Phê duyệt yêu cầu Mượn/Xuất cho Ban Nguồn Vốn',
    used_by: 'Ban Nguồn Vốn',
    performer: { full_name: 'Quản trị viên (BTC VMT)', email: 'admin@btcvmt.vn' },
    warehouse: { name: 'Kho Dự Án Bình Dương' },
  },
];

const MOCK_PROFILES: Profile[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@btcvmt.vn',
    full_name: 'Quản trị viên (BTC VMT)',
    role: 'btc_manager',
    region_id: null,
    area_id: null,
    project_ids: null,
    permissions: DEFAULT_PERMISSIONS_BY_ROLE['btc_manager'],
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'capital@btcvmt.vn',
    full_name: 'Chuyên viên Ban Nguồn Vốn',
    role: 'capital_dept',
    region_id: null,
    area_id: null,
    project_ids: null,
    permissions: DEFAULT_PERMISSIONS_BY_ROLE['capital_dept'],
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'project@btcvmt.vn',
    full_name: 'Chuyên viên Ban DAĐT',
    role: 'project_dept',
    region_id: null,
    area_id: null,
    project_ids: null,
    permissions: DEFAULT_PERMISSIONS_BY_ROLE['project_dept'],
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 're_dept@btcvmt.vn',
    full_name: 'Chuyên viên Ban KD BĐS',
    role: 're_dept',
    region_id: null,
    area_id: null,
    project_ids: null,
    permissions: DEFAULT_PERMISSIONS_BY_ROLE['re_dept'],
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'viewer@btcvmt.vn',
    full_name: 'Khách Tra Cứu',
    role: 'viewer',
    region_id: null,
    area_id: null,
    project_ids: null,
    permissions: DEFAULT_PERMISSIONS_BY_ROLE['viewer'],
    status: 'active',
  },
];

const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    record_id: 'asset-01',
    action: 'UPDATE',
    old_data: {
      business_project_name: 'Dự án Palm City',
      business_plot_code: 'PLM-01',
      subdivision: 'Phân khu A',
      area: 420.0,
    },
    new_data: {
      business_project_name: 'Khu Đô Thị Central Palm',
      business_plot_code: 'PALM-A01',
      subdivision: 'Phân khu A',
      area: 450.5,
    },
    changed_by: '00000000-0000-0000-0000-000000000001',
    changed_by_name: 'Nguyễn Văn Quản Trị (Ban TCKT)',
    notes: 'Cập nhật điều chỉnh mã lô kinh doanh theo bảng hàng đợt 2',
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    profiles: {
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Nguyễn Văn Quản Trị',
      email: 'manager@btcvmt.vn',
    },
  },
  {
    id: 'audit-002',
    record_id: 'asset-01',
    action: 'BULK_UPDATE',
    old_data: {
      sale_status: 'not_ready',
    },
    new_data: {
      sale_status: 'ready_for_sale',
    },
    changed_by: '00000000-0000-0000-0000-000000000004',
    changed_by_name: 'Trần Thị Bích (Ban KD BĐS)',
    notes: 'Cập nhật hàng loạt trạng thái sẵn sàng bán cho phân khu A',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    profiles: {
      id: '00000000-0000-0000-0000-000000000004',
      full_name: 'Trần Thị Bích',
      email: 're_dept@btcvmt.vn',
    },
  },
  {
    id: 'audit-003',
    record_id: 'asset-02',
    action: 'IMPORT',
    old_data: {
      business_project_name: null,
      business_plot_code: null,
    },
    new_data: {
      business_project_name: 'Spana Riverside',
      business_plot_code: 'SP-SH-02',
    },
    changed_by: '00000000-0000-0000-0000-000000000001',
    changed_by_name: 'Nguyễn Văn Quản Trị (Ban TCKT)',
    notes: 'Nhập thông tin tên và mã lô kinh doanh từ file Excel Danh_sach_ban_hang_2026.xlsx',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    profiles: {
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Nguyễn Văn Quản Trị',
      email: 'manager@btcvmt.vn',
    },
  },
];

const STORAGE_KEYS = {
  REGIONS: 'btcvmt_regions',
  AREAS: 'btcvmt_areas',
  WAREHOUSES: 'btcvmt_warehouses',
  PROJECTS: 'btcvmt_projects',
  ASSETS: 'btcvmt_assets',
  TRANSACTIONS: 'btcvmt_transactions',
  LOGS: 'btcvmt_activity_logs',
  PROFILES: 'btcvmt_profiles',
  AUDIT_LOGS: 'btcvmt_audit_logs',
};

function getStored<T>(key: string, defaultData: T): T {
  if (typeof window === 'undefined') return defaultData;
  if ((window as any)._mockStoreCache && (window as any)._mockStoreCache[key]) {
    return (window as any)._mockStoreCache[key];
  }

  try {
    const item = localStorage.getItem(key);
    let parsed: any;
    if (!item) {
      localStorage.setItem(key, JSON.stringify(defaultData));
      parsed = defaultData;
    } else {
      parsed = JSON.parse(item);
      if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(defaultData) && defaultData.length > 0) {
        localStorage.setItem(key, JSON.stringify(defaultData));
        parsed = defaultData;
      }
    }
    
    if (!(window as any)._mockStoreCache) {
      (window as any)._mockStoreCache = {};
    }
    (window as any)._mockStoreCache[key] = parsed;
    return parsed;
  } catch {
    localStorage.setItem(key, JSON.stringify(defaultData));
    if (!(window as any)._mockStoreCache) {
      (window as any)._mockStoreCache = {};
    }
    (window as any)._mockStoreCache[key] = defaultData;
    return defaultData;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    if (!(window as any)._mockStoreCache) {
      (window as any)._mockStoreCache = {};
    }
    (window as any)._mockStoreCache[key] = data;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('LocalStorage error:', err);
  }
}

export const mockStore = {
  getRegions: (): Region[] => getStored(STORAGE_KEYS.REGIONS, MOCK_REGIONS),
  saveRegions: (data: Region[]) => setStored(STORAGE_KEYS.REGIONS, data),

  getAreas: (): Area[] => {
    const areas = getStored(STORAGE_KEYS.AREAS, MOCK_AREAS);
    const regions = mockStore.getRegions();
    return areas.map(a => ({
      ...a,
      regions: regions.find(r => r.id === a.region_id) || a.regions,
    }));
  },
  saveAreas: (data: Area[]) => setStored(STORAGE_KEYS.AREAS, data),

  getWarehouses: (): Warehouse[] => {
    const warehouses = getStored(STORAGE_KEYS.WAREHOUSES, MOCK_WAREHOUSES);
    const regions = mockStore.getRegions();
    return warehouses.map(w => ({
      ...w,
      regions: regions.find(r => r.id === w.region_id) || w.regions,
    }));
  },
  saveWarehouses: (data: Warehouse[]) => setStored(STORAGE_KEYS.WAREHOUSES, data),

  getProjects: (): Project[] => {
    const projects = getStored(STORAGE_KEYS.PROJECTS, MOCK_PROJECTS);
    const areas = mockStore.getAreas();
    return projects.map(p => {
      const area = areas.find(a => a.id === p.area_id);
      return {
        ...p,
        areas: area ? { name: area.name, region_id: area.region_id, regions: area.regions } : p.areas,
      };
    });
  },
  saveProjects: (data: Project[]) => setStored(STORAGE_KEYS.PROJECTS, data),

  getAssets: (filters?: any): Asset[] => {
    let assets = getStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    const projects = mockStore.getProjects();
    const warehouses = mockStore.getWarehouses();

    // Track sequence per (region_collateral)
    const counters: Record<string, number> = {};

    assets = assets.map((a) => {
      const proj = projects.find(p => p.id === a.project_id);
      const wh = warehouses.find(w => w.id === a.warehouse_id);
      
      const regionCode = wh?.region_code || (proj?.areas?.region_id === 'reg-02' ? 'VMB' : (proj?.areas?.region_id === 'reg-03' ? 'VMT' : 'VMN'));
      const colType = a.collateral_type || 'BDS';
      const key = `${regionCode}_${colType}`;

      counters[key] = (counters[key] || 0) + 1;

      // Auto-assign asset_code if legacy asset is missing it or doesn't have 8 digits
      let code = a.asset_code;
      if (!code) {
        code = `${regionCode}_${colType}_${String(counters[key]).padStart(8, '0')}`;
      }

      const profiles = mockStore.getProfiles();
      const updaterProf = a.updated_by ? profiles.find(p => p.id === a.updated_by) : null;

      return {
        ...a,
        asset_code: code,
        collateral_type: colType,
        asset_type: a.asset_type || (a.usage_purpose?.includes('thương mại') ? 'Shophouse / Nhà phố thương mại' : (a.usage_purpose?.includes('sản xuất') ? 'Nhà xưởng / Kho bãi KCN' : 'Đất nền')),
        updated_at: a.updated_at || a.created_at,
        updated_by: a.updated_by || null,
        updater: updaterProf ? { id: updaterProf.id, full_name: updaterProf.full_name, email: updaterProf.email } : (a.updater || null),
        projects: proj ? { name: proj.name, areas: proj.areas } : a.projects,
        warehouses: wh ? { name: wh.name, is_central: wh.is_central, code: wh.code, region_code: wh.region_code } : a.warehouses,
      };
    });

    if (filters) {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        assets = assets.filter(
          a =>
            a.certificate_no?.toLowerCase().includes(s) ||
            a.asset_code?.toLowerCase().includes(s) ||
            a.subdivision?.toLowerCase().includes(s) ||
            a.lot_no?.toLowerCase().includes(s) ||
            a.owner_name?.toLowerCase().includes(s) ||
            a.business_project_name?.toLowerCase().includes(s) ||
            a.business_plot_code?.toLowerCase().includes(s)
        );
      }
      if (filters.collateralType) {
        assets = assets.filter(a => a.collateral_type === filters.collateralType);
      }
      if (filters.projectId) {
        assets = assets.filter(a => a.project_id === filters.projectId);
      }
      if (filters.custodyStatus) {
        assets = assets.filter(a => a.custody_status === filters.custodyStatus);
      }
      if (filters.lifecycleStatus) {
        assets = assets.filter(a => a.lifecycle_status === filters.lifecycleStatus);
      }
      if (filters.saleStatus) {
        assets = assets.filter(a => a.sale_status === filters.saleStatus);
      }
      if (filters.mortgageStatus) {
        assets = assets.filter(a => a.mortgage_status === filters.mortgageStatus);
      }
      if (filters.warehouseId) {
        assets = assets.filter(a => a.warehouse_id === filters.warehouseId);
      }
      if (filters.subdivision) {
        const sub = filters.subdivision.toLowerCase();
        assets = assets.filter(a => a.subdivision?.toLowerCase().includes(sub));
      }
    }

    return assets;
  },
  saveAssets: (data: Asset[]) => setStored(STORAGE_KEYS.ASSETS, data),

  getTransactions: (): any[] => {
    let txs = getStored(STORAGE_KEYS.TRANSACTIONS, MOCK_TRANSACTIONS);
    const assets = mockStore.getAssets();

    return txs.map(tx => ({
      ...tx,
      items: (tx.items || []).map((item: any) => ({
        ...item,
        asset: assets.find(a => a.id === item.asset_id) || item.asset,
      })),
    }));
  },
  saveTransactions: (data: any[]) => setStored(STORAGE_KEYS.TRANSACTIONS, data),

  getLogs: (params?: any): any[] => {
    let logs = getStored(STORAGE_KEYS.LOGS, MOCK_ACTIVITY_LOGS);
    const warehouses = mockStore.getWarehouses();
    const assets = mockStore.getAssets();

    logs = logs.map(l => {
      const asset = assets.find(a => a.id === l.asset_id);
      const wh = warehouses.find(w => w.id === l.warehouse_id || w.id === asset?.warehouse_id);
      return {
        ...l,
        asset,
        warehouse: wh ? { name: wh.name } : l.warehouse,
      };
    });

    if (typeof params === 'object' && params !== null) {
      if (params.assetId) {
        logs = logs.filter(l => l.asset_id === params.assetId);
      }
      if (params.actionType) {
        logs = logs.filter(l => l.action_type === params.actionType);
      }
      if (params.warehouseId) {
        logs = logs.filter(l => l.warehouse_id === params.warehouseId || l.asset?.warehouse_id === params.warehouseId);
      }
      if (params.projectId) {
        logs = logs.filter(l => l.asset?.project_id === params.projectId);
      }
      if (params.fromDate) {
        logs = logs.filter(l => new Date(l.log_date) >= new Date(params.fromDate));
      }
      if (params.toDate) {
        const to = new Date(params.toDate);
        to.setHours(23, 59, 59, 999);
        logs = logs.filter(l => new Date(l.log_date) <= to);
      }
    }
    return logs;
  },
  saveLogs: (data: any[]) => setStored(STORAGE_KEYS.LOGS, data),

  getProfiles: (): Profile[] => getStored(STORAGE_KEYS.PROFILES, MOCK_PROFILES),
  saveProfiles: (data: Profile[]) => setStored(STORAGE_KEYS.PROFILES, data),

  getAuditLogs: (recordId?: string): AuditLog[] => {
    let logs: AuditLog[] = getStored(STORAGE_KEYS.AUDIT_LOGS, MOCK_AUDIT_LOGS);
    const profiles = mockStore.getProfiles();

    logs = logs.map(l => {
      const prof = profiles.find(p => p.id === l.changed_by);
      return {
        ...l,
        profiles: prof ? { id: prof.id, full_name: prof.full_name, email: prof.email } : l.profiles,
      };
    });

    if (recordId) {
      logs = logs.filter(l => l.record_id === recordId);
    }
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  saveAuditLogs: (data: AuditLog[]) => setStored(STORAGE_KEYS.AUDIT_LOGS, data),

  addAuditLog: (log: Omit<AuditLog, 'id' | 'created_at'>): AuditLog => {
    const logs = getStored<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, MOCK_AUDIT_LOGS);
    const profiles = mockStore.getProfiles();
    const prof = profiles.find(p => p.id === log.changed_by);

    const newLog: AuditLog = {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
      profiles: prof ? { id: prof.id, full_name: prof.full_name, email: prof.email } : (log.profiles || null),
    };

    logs.unshift(newLog);
    setStored(STORAGE_KEYS.AUDIT_LOGS, logs);
    return newLog;
  },

  resetDemoData: () => {
    setStored(STORAGE_KEYS.REGIONS, MOCK_REGIONS);
    setStored(STORAGE_KEYS.AREAS, MOCK_AREAS);
    setStored(STORAGE_KEYS.WAREHOUSES, MOCK_WAREHOUSES);
    setStored(STORAGE_KEYS.PROJECTS, MOCK_PROJECTS);
    setStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    setStored(STORAGE_KEYS.TRANSACTIONS, MOCK_TRANSACTIONS);
    setStored(STORAGE_KEYS.LOGS, MOCK_ACTIVITY_LOGS);
    setStored(STORAGE_KEYS.PROFILES, MOCK_PROFILES);
    setStored(STORAGE_KEYS.AUDIT_LOGS, MOCK_AUDIT_LOGS);
  },
};
