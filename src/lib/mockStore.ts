import { Asset, Region, Area, Warehouse, Project, Profile, Role } from '../types';
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
  { id: 'wh-01', name: 'Kho Trung Tâm BTC', region_id: 'reg-01', is_central: true, regions: { name: 'Miền Nam' } },
  { id: 'wh-02', name: 'Kho Dự Án Bình Dương', region_id: 'reg-01', is_central: false, regions: { name: 'Miền Nam' } },
  { id: 'wh-03', name: 'Kho Chi Nhánh Hà Nội', region_id: 'reg-02', is_central: false, regions: { name: 'Miền Bắc' } },
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
    certificate_no: 'GCN-VMT-001',
    subdivision: 'Phân khu A',
    area: 450.5,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'not_ready',
    mortgage_status: 'none',
    project_id: 'proj-01',
    warehouse_id: 'wh-01',
    current_holder_dept: null,
    created_at: '2025-01-10T08:00:00Z',
    projects: { name: 'Dự án Khu Đô Thị VMT Central', areas: { name: 'TP. Hồ Chí Minh', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Trung Tâm BTC', is_central: true },
  },
  {
    id: 'asset-02',
    certificate_no: 'GCN-VMT-002',
    subdivision: 'Lô B2',
    area: 1200.0,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    custody_status: 'checked_out',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-02',
    warehouse_id: 'wh-02',
    current_holder_dept: 'Ban Nguồn Vốn',
    created_at: '2025-01-12T09:30:00Z',
    projects: { name: 'Dự án Khu Dân Cư VMT Riverside', areas: { name: 'Bình Dương', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Dự Án Bình Dương', is_central: false },
  },
  {
    id: 'asset-03',
    certificate_no: 'GCN-VMT-003',
    subdivision: 'Khu công nghiệp',
    area: 3500.8,
    owner_name: 'Công ty TNHH BĐS VMT Đồng Nai',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-03',
    warehouse_id: 'wh-01',
    current_holder_dept: null,
    created_at: '2025-01-15T11:00:00Z',
    projects: { name: 'Dự án Tổ Hợp Thương Mại VMT Plaza', areas: { name: 'Đồng Nai', region_id: 'reg-01' } },
    warehouses: { name: 'Kho Trung Tâm BTC', is_central: true },
  },
  {
    id: 'asset-04',
    certificate_no: 'GCN-VMT-004',
    subdivision: 'Tháp C',
    area: 820.0,
    owner_name: 'Công ty Cổ phần Đầu tư VMT',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'sold',
    mortgage_status: 'none',
    project_id: 'proj-04',
    warehouse_id: 'wh-03',
    current_holder_dept: null,
    created_at: '2025-01-20T14:15:00Z',
    projects: { name: 'Dự án VMT Capital Tower', areas: { name: 'Hà Nội', region_id: 'reg-02' } },
    warehouses: { name: 'Kho Chi Nhánh Hà Nội', is_central: false },
  },
];

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

const STORAGE_KEYS = {
  REGIONS: 'btcvmt_regions',
  AREAS: 'btcvmt_areas',
  WAREHOUSES: 'btcvmt_warehouses',
  PROJECTS: 'btcvmt_projects',
  ASSETS: 'btcvmt_assets',
  TRANSACTIONS: 'btcvmt_transactions',
  LOGS: 'btcvmt_activity_logs',
  PROFILES: 'btcvmt_profiles',
};

function getStored<T>(key: string, defaultData: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) {
      localStorage.setItem(key, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(item);
  } catch {
    return defaultData;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
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
        areas: area ? { name: area.name, region_id: area.region_id } : p.areas,
      };
    });
  },
  saveProjects: (data: Project[]) => setStored(STORAGE_KEYS.PROJECTS, data),

  getAssets: (filters?: any): Asset[] => {
    let assets = getStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    const projects = mockStore.getProjects();
    const warehouses = mockStore.getWarehouses();

    assets = assets.map(a => {
      const proj = projects.find(p => p.id === a.project_id);
      const wh = warehouses.find(w => w.id === a.warehouse_id);
      return {
        ...a,
        projects: proj ? { name: proj.name, areas: proj.areas } : a.projects,
        warehouses: wh ? { name: wh.name, is_central: wh.is_central } : a.warehouses,
      };
    });

    if (filters) {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        assets = assets.filter(
          a =>
            a.certificate_no?.toLowerCase().includes(s) ||
            a.subdivision?.toLowerCase().includes(s) ||
            a.owner_name?.toLowerCase().includes(s)
        );
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
        assets = assets.filter(a => a.subdivision?.toLowerCase().includes(filters.subdivision.toLowerCase()));
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
    if (typeof params === 'object' && params !== null) {
      if (params.assetId) {
        logs = logs.filter(l => l.asset_id === params.assetId);
      }
      if (params.actionType) {
        logs = logs.filter(l => l.action_type === params.actionType);
      }
    }
    return logs;
  },
  saveLogs: (data: any[]) => setStored(STORAGE_KEYS.LOGS, data),

  getProfiles: (): Profile[] => getStored(STORAGE_KEYS.PROFILES, MOCK_PROFILES),
  saveProfiles: (data: Profile[]) => setStored(STORAGE_KEYS.PROFILES, data),

  resetDemoData: () => {
    setStored(STORAGE_KEYS.REGIONS, MOCK_REGIONS);
    setStored(STORAGE_KEYS.AREAS, MOCK_AREAS);
    setStored(STORAGE_KEYS.WAREHOUSES, MOCK_WAREHOUSES);
    setStored(STORAGE_KEYS.PROJECTS, MOCK_PROJECTS);
    setStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    setStored(STORAGE_KEYS.TRANSACTIONS, MOCK_TRANSACTIONS);
    setStored(STORAGE_KEYS.LOGS, MOCK_ACTIVITY_LOGS);
    setStored(STORAGE_KEYS.PROFILES, MOCK_PROFILES);
  },
};
