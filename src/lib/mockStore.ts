import { Asset, Region, Area, Warehouse, Project, Profile, Role, AuditLog, ReportSnapshot, DenormalizedReportAsset, InventoryAudit, InventoryAuditItem, InvestorEntity, AssetOwnershipTransfer } from '../types';
import { DEFAULT_PERMISSIONS_BY_ROLE } from './permissions';
import { DEMO_PROFILES } from './demoProfiles';

export const MOCK_REGIONS: Region[] = [
  { id: 'reg-01', name: 'Miền Nam' },
  { id: 'reg-02', name: 'Miền Trung' },
  { id: 'reg-03', name: 'Miền Bắc' },
];

export const MOCK_AREAS: Area[] = [
  // Miền Nam
  { id: 'area-01', region_id: 'reg-01', name: 'TP. Hồ Chí Minh', regions: { name: 'Miền Nam' } },
  { id: 'area-02', region_id: 'reg-01', name: 'Bình Dương', regions: { name: 'Miền Nam' } },
  { id: 'area-03', region_id: 'reg-01', name: 'Đồng Nai', regions: { name: 'Miền Nam' } },
  { id: 'area-04', region_id: 'reg-01', name: 'Long An', regions: { name: 'Miền Nam' } },
  { id: 'area-05', region_id: 'reg-01', name: 'Bà Rịa - Vũng Tàu', regions: { name: 'Miền Nam' } },
  { id: 'area-06', region_id: 'reg-01', name: 'Kiên Giang (Phú Quốc)', regions: { name: 'Miền Nam' } },
  { id: 'area-07', region_id: 'reg-01', name: 'Cần Thơ', regions: { name: 'Miền Nam' } },

  // Miền Trung
  { id: 'area-08', region_id: 'reg-02', name: 'TP. Đà Nẵng', regions: { name: 'Miền Trung' } },
  { id: 'area-09', region_id: 'reg-02', name: 'Quảng Nam', regions: { name: 'Miền Trung' } },
  { id: 'area-10', region_id: 'reg-02', name: 'Khánh Hòa (Nha Trang)', regions: { name: 'Miền Trung' } },
  { id: 'area-11', region_id: 'reg-02', name: 'Bình Định (Quy Nhơn)', regions: { name: 'Miền Trung' } },
  { id: 'area-12', region_id: 'reg-02', name: 'Thừa Thiên Huế', regions: { name: 'Miền Trung' } },
  { id: 'area-13', region_id: 'reg-02', name: 'Quảng Ngãi', regions: { name: 'Miền Trung' } },

  // Miền Bắc
  { id: 'area-14', region_id: 'reg-03', name: 'TP. Hà Nội', regions: { name: 'Miền Bắc' } },
  { id: 'area-15', region_id: 'reg-03', name: 'Hải Phòng', regions: { name: 'Miền Bắc' } },
  { id: 'area-16', region_id: 'reg-03', name: 'Quảng Ninh', regions: { name: 'Miền Bắc' } },
  { id: 'area-17', region_id: 'reg-03', name: 'Bắc Ninh', regions: { name: 'Miền Bắc' } },
  { id: 'area-18', region_id: 'reg-03', name: 'Hưng Yên', regions: { name: 'Miền Bắc' } },
];

export const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-01', name: 'Kho Tổng Trung Tâm Tập Đoàn VMT', code: '001', region_code: 'VMN', region_id: 'reg-01', is_central: true, regions: { name: 'Miền Nam' } },
  { id: 'wh-02', name: 'Kho Lưu Trữ Miền Nam - TP.HCM', code: '002', region_code: 'VMN', region_id: 'reg-01', is_central: false, regions: { name: 'Miền Nam' } },
  { id: 'wh-03', name: 'Kho Dự Án Spana Riverside Bình Dương', code: '003', region_code: 'VMN', region_id: 'reg-01', is_central: false, regions: { name: 'Miền Nam' } },
  { id: 'wh-04', name: 'Kho Dự Án VMT Grand Marina Đồng Nai', code: '004', region_code: 'VMN', region_id: 'reg-01', is_central: false, regions: { name: 'Miền Nam' } },
  { id: 'wh-05', name: 'Kho Chi Nhánh Miền Trung - Đà Nẵng', code: '005', region_code: 'VMT', region_id: 'reg-02', is_central: false, regions: { name: 'Miền Trung' } },
  { id: 'wh-06', name: 'Kho Dự Án Heritage Village Hội An', code: '006', region_code: 'VMT', region_id: 'reg-02', is_central: false, regions: { name: 'Miền Trung' } },
  { id: 'wh-07', name: 'Kho Chi Nhánh Miền Bắc - Hà Nội', code: '007', region_code: 'VMB', region_id: 'reg-03', is_central: false, regions: { name: 'Miền Bắc' } },
  { id: 'wh-08', name: 'Kho Dự Án VMT Capital Tower Cầu Giấy', code: '008', region_code: 'VMB', region_id: 'reg-03', is_central: false, regions: { name: 'Miền Bắc' } },
];

export const MOCK_PROJECTS: Project[] = [
  { id: 'proj-01', area_id: 'area-01', name: 'Dự án Khu Đô Thị VMT Central Palm', areas: { name: 'TP. Hồ Chí Minh', region_id: 'reg-01', regions: { name: 'Miền Nam' } } },
  { id: 'proj-02', area_id: 'area-02', name: 'Dự án Khu Đô Thị Spana Riverside', areas: { name: 'Bình Dương', region_id: 'reg-01', regions: { name: 'Miền Nam' } } },
  { id: 'proj-03', area_id: 'area-03', name: 'Dự án Tổ Hợp Thương Mại & Căn Hộ VMT Grand Marina', areas: { name: 'Đồng Nai', region_id: 'reg-01', regions: { name: 'Miền Nam' } } },
  { id: 'proj-04', area_id: 'area-09', name: 'Dự án Khu Nghỉ Dưỡng VMT Heritage Village Hội An', areas: { name: 'Quảng Nam', region_id: 'reg-02', regions: { name: 'Miền Trung' } } },
  { id: 'proj-05', area_id: 'area-08', name: 'Dự án Khu Phức Hợp VMT Dragon Bay', areas: { name: 'TP. Đà Nẵng', region_id: 'reg-02', regions: { name: 'Miền Trung' } } },
  { id: 'proj-06', area_id: 'area-14', name: 'Dự án Tòa Nhà TTTM & Văn Phòng VMT Capital Tower', areas: { name: 'TP. Hà Nội', region_id: 'reg-03', regions: { name: 'Miền Bắc' } } },
  { id: 'proj-07', area_id: 'area-18', name: 'Dự án Khu Đô Thị Sinh Thái VMT Green Park', areas: { name: 'Hưng Yên', region_id: 'reg-03', regions: { name: 'Miền Bắc' } } },
  { id: 'proj-08', area_id: 'area-06', name: 'Dự án Khu Nghỉ Dưỡng Sunset Horizon Phú Quốc', areas: { name: 'Kiên Giang (Phú Quốc)', region_id: 'reg-01', regions: { name: 'Miền Nam' } } },
];

export const MOCK_INVESTOR_ENTITIES: InvestorEntity[] = [
  { id: 'inv-01', name: 'Công ty Cổ phần Đầu tư Bất động sản VMT Group', company_code: 'VMT_GROUP', note: 'Pháp nhân CĐT chính của Tập đoàn VMT', created_at: '2025-01-15T08:00:00.000Z' },
  { id: 'inv-02', name: 'Công ty TNHH Phát triển Đô thị Spana Land', company_code: 'SPANA_LAND', note: 'Chủ đầu tư dự án Spana Riverside', created_at: '2025-02-10T09:30:00.000Z' },
  { id: 'inv-03', name: 'Công ty Cổ phần Đầu tư Marina Holdings', company_code: 'MARINA_HOLDINGS', note: 'Chủ đầu tư dự án VMT Grand Marina', created_at: '2025-03-01T10:00:00.000Z' },
  { id: 'inv-04', name: 'Công ty TNHH Nghỉ dưỡng Heritage Village', company_code: 'HERITAGE_VILLAGE', note: 'Chủ đầu tư dự án Hội An Heritage', created_at: '2025-03-15T14:20:00.000Z' },
  { id: 'inv-05', name: 'Công ty Cổ phần Đầu tư Tài chính Quốc tế Sun Capital', company_code: 'SUN_CAPITAL', note: 'Nhà đầu tư chiến lược & đối tác tài chính', created_at: '2025-04-05T11:00:00.000Z' },
];

export const MOCK_ASSET_OWNERSHIP_TRANSFERS: AssetOwnershipTransfer[] = [
  {
    id: 'aot-01',
    asset_id: 'asset-01',
    from_entity_id: 'inv-01',
    from_role: 'cdt',
    to_entity_id: 'inv-05',
    to_role: 'ndt',
    transferred_at: '2026-06-15T10:30:00Z',
    transferred_by: 'p-01',
    note: 'Chuyển nhượng quyền sở hữu theo Hợp đồng đầu tư số 15/2026/HĐĐT-VMT-SUNCAP',
  },
  {
    id: 'aot-02',
    asset_id: 'asset-02',
    from_entity_id: 'inv-01',
    from_role: 'cdt',
    to_entity_id: 'inv-02',
    to_role: 'ndt',
    transferred_at: '2026-05-20T14:15:00Z',
    transferred_by: 'p-02',
    note: 'Bàn giao GCN cho Nhà đầu tư đối tác chiến lược Spana Land',
  },
];

export const MOCK_ASSETS: Asset[] = [
  // 1. Dự án VMT Central Palm (TP.HCM)
  {
    id: 'asset-01',
    asset_code: 'VMN_BDS_00000001',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự đơn lập',
    certificate_no: 'GCN-HCM-2024-00189',
    current_owner_entity_id: 'inv-05',
    current_owner_role: 'ndt',
    subdivision: 'Phân khu Palm Oasis',
    lot_no: 'PO-BT-01',
    business_project_name: 'Khu Đô Thị Central Palm',
    business_plot_code: 'PALM-OASIS-01',
    area: 450.5,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '04',
    land_lot_no: '112',
    province: 'TP. Hồ Chí Minh',
    district: 'TP. Thủ Đức (Quận 2 cũ)',
    ward: 'Phường An Phú',
    address_detail: 'Số 18 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-hcm-00189.pdf',
    custody_status: 'checked_out',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    mortgage_bank: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Tân Định',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ1',
    mortgage_valuation: 68000000000,
    credit_grant_rate: 70,
    mortgage_expected_release_date: '2026-12-31',
    expected_return_date: '2026-09-15',
    borrow_purpose: 'Mượn sổ nộp hồ sơ thẩm định mở rộng hạn mức tín dụng dự án VMT Central Palm',
    current_holder_dept: 'Ban Nguồn Vốn',
    project_id: 'proj-01',
    warehouse_id: 'wh-01',
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2026-02-14T09:00:00Z',
  },
  {
    id: 'asset-02',
    asset_code: 'VMN_BDS_00000002',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự song lập',
    certificate_no: 'GCN-HCM-2024-00190',
    subdivision: 'Phân khu Palm Oasis',
    lot_no: 'PO-BT-02',
    business_project_name: 'Khu Đô Thị Central Palm',
    business_plot_code: 'PALM-OASIS-02',
    area: 320.0,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '04',
    land_lot_no: '113',
    province: 'TP. Hồ Chí Minh',
    district: 'TP. Thủ Đức (Quận 2 cũ)',
    ward: 'Phường An Phú',
    address_detail: 'Số 20 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-hcm-00190.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-01',
    warehouse_id: 'wh-01',
    created_at: '2025-01-10T08:30:00Z',
  },
  {
    id: 'asset-03',
    asset_code: 'VMN_BDS_00000003',
    collateral_type: 'BDS',
    asset_type: 'Nhà phố thương mại (Shophouse)',
    certificate_no: 'GCN-HCM-2024-00215',
    subdivision: 'Phân khu Boulevard',
    lot_no: 'BL-SH-05',
    business_project_name: 'Khu Đô Thị Central Palm',
    business_plot_code: 'PALM-BL-05',
    area: 160.0,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '04',
    land_lot_no: '145',
    province: 'TP. Hồ Chí Minh',
    district: 'TP. Thủ Đức',
    ward: 'Phường An Phú',
    address_detail: 'Đại lộ Palm Central, Phường An Phú, TP. Thủ Đức, TP.HCM',
    land_use_purpose: 'Đất ở kết hợp thương mại dịch vụ (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-hcm-00215.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-01',
    warehouse_id: 'wh-02',
    created_at: '2025-01-15T09:00:00Z',
  },

  // 2. Dự án Spana Riverside (Bình Dương)
  {
    id: 'asset-04',
    asset_code: 'VMN_BDS_00000004',
    collateral_type: 'BDS',
    asset_type: 'Shophouse mặt tiền sông',
    certificate_no: 'GCN-BD-2023-01452',
    subdivision: 'Phân khu River Park',
    lot_no: 'RP-SH-08',
    business_project_name: 'Spana Riverside',
    business_plot_code: 'SP-RIVER-SH08',
    area: 210.0,
    owner_name: 'Công ty Cổ phần Đầu tư BĐS VMT Sài Gòn',
    map_sheet_no: '12',
    land_lot_no: '88',
    province: 'Bình Dương',
    district: 'TP. Thuận An',
    ward: 'Phường Lái Thiêu',
    address_detail: 'Đại lộ Ven Sông Sài Gòn, Phường Lái Thiêu, TP. Thuận An, Bình Dương',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    mortgage_bank: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) - CN TP.HCM',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ1',
    mortgage_valuation: 28500000000,
    credit_grant_rate: 68,
    mortgage_expected_release_date: '2026-11-30',
    scan_file_url: 'https://example.com/scan-gcn-bd-01452.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-02',
    warehouse_id: 'wh-03',
    created_at: '2025-01-12T09:30:00Z',
  },
  {
    id: 'asset-05',
    asset_code: 'VMN_BDS_00000005',
    collateral_type: 'BDS',
    asset_type: 'Đất nền liền kề',
    certificate_no: 'GCN-BD-2023-01453',
    subdivision: 'Phân khu River Park',
    lot_no: 'RP-LK-15',
    business_project_name: 'Spana Riverside',
    business_plot_code: 'SP-RIVER-LK15',
    area: 125.0,
    owner_name: 'Công ty Cổ phần Đầu tư BĐS VMT Sài Gòn',
    map_sheet_no: '12',
    land_lot_no: '89',
    province: 'Bình Dương',
    district: 'TP. Thuận An',
    ward: 'Phường Lái Thiêu',
    address_detail: 'Đường D1, Phường Lái Thiêu, TP. Thuận An, Bình Dương',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-bd-01453.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-02',
    warehouse_id: 'wh-03',
    created_at: '2025-01-12T10:00:00Z',
  },

  // 3. Dự án VMT Grand Marina (Đồng Nai)
  {
    id: 'asset-06',
    asset_code: 'VMN_BDS_00000006',
    collateral_type: 'BDS',
    asset_type: 'Đất thương mại dịch vụ TMD',
    certificate_no: 'GCN-ĐN-2024-00891',
    subdivision: 'Khu Trung Tâm Thương Mại',
    lot_no: 'TMD-01',
    business_project_name: 'Tổ Hợp VMT Grand Marina',
    business_plot_code: 'MARINA-PLAZA-01',
    area: 12500.0,
    owner_name: 'Công ty TNHH Phát Triển Đô Thị VMT Đồng Nai',
    map_sheet_no: '35',
    land_lot_no: '520',
    province: 'Đồng Nai',
    district: 'TP. Biên Hòa',
    ward: 'Phường Long Bình Tân',
    address_detail: 'Đường Nguyễn Ái Quốc, Phường Long Bình Tân, TP. Biên Hòa, Đồng Nai',
    land_use_purpose: 'Đất thương mại, dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2074)',
    mortgage_bank: 'Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank) - Hội Sở',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ2',
    mortgage_valuation: 320000000000,
    credit_grant_rate: 70,
    mortgage_expected_release_date: '2028-06-30',
    scan_file_url: 'https://example.com/scan-gcn-dn-00891.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'not_ready',
    mortgage_status: 'mortgaged',
    project_id: 'proj-03',
    warehouse_id: 'wh-04',
    created_at: '2025-02-01T11:00:00Z',
  },
  {
    id: 'asset-07',
    asset_code: 'VMN_BDS_00000007',
    collateral_type: 'BDS',
    asset_type: 'Căn hộ chung cư cao cấp',
    certificate_no: 'GCN-ĐN-2024-00892',
    subdivision: 'Tháp Marina Aqua (Tòa A)',
    lot_no: 'A-2508',
    business_project_name: 'Tổ Hợp VMT Grand Marina',
    business_plot_code: 'MARINA-A-2508',
    area: 98.5,
    owner_name: 'Công ty TNHH Phát Triển Đô Thị VMT Đồng Nai',
    map_sheet_no: '35',
    land_lot_no: '521',
    province: 'Đồng Nai',
    district: 'TP. Biên Hòa',
    ward: 'Phường Long Bình Tân',
    address_detail: 'Tầng 25, Tháp A Grand Marina, TP. Biên Hòa, Đồng Nai',
    land_use_purpose: 'Đất ở tại đô thị (ODT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-dn-00892.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-03',
    warehouse_id: 'wh-04',
    created_at: '2025-02-05T08:00:00Z',
  },

  // 4. Dự án VMT Heritage Village Hội An (Quảng Nam)
  {
    id: 'asset-08',
    asset_code: 'VMT_BDS_00000001',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự nghỉ dưỡng',
    certificate_no: 'GCN-QN-2023-00214',
    subdivision: 'Làng Di Sản Ven Sông',
    lot_no: 'HV-VILLA-05',
    business_project_name: 'Khu Nghỉ Dưỡng VMT Heritage Village',
    business_plot_code: 'HERITAGE-V05',
    area: 580.0,
    owner_name: 'Công ty Cổ phần VMT Heritage Miền Trung',
    map_sheet_no: '18',
    land_lot_no: '304',
    province: 'Quảng Nam',
    district: 'TP. Hội An',
    ward: 'Phường Cẩm Nam',
    address_detail: 'Đường Nguyễn Tri Phương, Phường Cẩm Nam, TP. Hội An, Quảng Nam',
    land_use_purpose: 'Đất thương mại dịch vụ du lịch (TMD)',
    land_use_term: '50 năm (Đến 2073)',
    mortgage_bank: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank) - CN Đà Nẵng',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ2',
    mortgage_valuation: 45000000000,
    credit_grant_rate: 65,
    mortgage_expected_release_date: '2027-12-31',
    scan_file_url: 'https://example.com/scan-gcn-qn-00214.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-04',
    warehouse_id: 'wh-06',
    created_at: '2025-01-20T14:00:00Z',
  },
  {
    id: 'asset-09',
    asset_code: 'VMT_BDS_00000002',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự ven hồ',
    certificate_no: 'GCN-QN-2023-00215',
    subdivision: 'Làng Di Sản Ven Sông',
    lot_no: 'HV-VILLA-06',
    business_project_name: 'Khu Nghỉ Dưỡng VMT Heritage Village',
    business_plot_code: 'HERITAGE-V06',
    area: 610.0,
    owner_name: 'Công ty Cổ phần VMT Heritage Miền Trung',
    map_sheet_no: '18',
    land_lot_no: '305',
    province: 'Quảng Nam',
    district: 'TP. Hội An',
    ward: 'Phường Cẩm Nam',
    address_detail: 'Đường Nguyễn Tri Phương, Phường Cẩm Nam, TP. Hội An, Quảng Nam',
    land_use_purpose: 'Đất thương mại dịch vụ du lịch (TMD)',
    land_use_term: '50 năm (Đến 2073)',
    scan_file_url: 'https://example.com/scan-gcn-qn-00215.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-04',
    warehouse_id: 'wh-06',
    created_at: '2025-01-20T14:30:00Z',
  },

  // 5. Dự án VMT Dragon Bay (Đà Nẵng)
  {
    id: 'asset-10',
    asset_code: 'VMT_BDS_00000003',
    collateral_type: 'BDS',
    asset_type: 'Căn hộ khách sạn Condotel',
    certificate_no: 'GCN-ĐNG-2023-00567',
    subdivision: 'Tháp Dragon Sea View',
    lot_no: 'DS-2104',
    business_project_name: 'Khu Phức Hợp VMT Dragon Bay',
    business_plot_code: 'DRAGON-DS-2104',
    area: 75.5,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '22',
    land_lot_no: '189',
    province: 'TP. Đà Nẵng',
    district: 'Quận Ngũ Hành Sơn',
    ward: 'Phường Khuê Mỹ',
    address_detail: 'Đường Võ Nguyên Giáp, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, Đà Nẵng',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2070)',
    scan_file_url: 'https://example.com/scan-gcn-dng-00567.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'sold',
    mortgage_status: 'none',
    project_id: 'proj-05',
    warehouse_id: 'wh-05',
    created_at: '2025-02-10T09:00:00Z',
  },
  {
    id: 'asset-11',
    asset_code: 'VMT_BDS_00000004',
    collateral_type: 'BDS',
    asset_type: 'Nhà phố biển',
    certificate_no: 'GCN-ĐNG-2023-00568',
    subdivision: 'Phố Đi Bộ Dragon Walk',
    lot_no: 'DW-03',
    business_project_name: 'Khu Phức Hợp VMT Dragon Bay',
    business_plot_code: 'DRAGON-DW-03',
    area: 185.0,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '22',
    land_lot_no: '190',
    province: 'TP. Đà Nẵng',
    district: 'Quận Ngũ Hành Sơn',
    ward: 'Phường Khuê Mỹ',
    address_detail: 'Đường Võ Nguyên Giáp, Phường Khuê Mỹ, Quận Ngũ Hành Sơn, Đà Nẵng',
    land_use_purpose: 'Đất ở kết hợp kinh doanh (ODT)',
    land_use_term: 'Lâu dài',
    mortgage_bank: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) - CN Đà Nẵng',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ2',
    mortgage_valuation: 36000000000,
    credit_grant_rate: 70,
    mortgage_expected_release_date: '2026-10-31',
    scan_file_url: 'https://example.com/scan-gcn-dng-00568.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-05',
    warehouse_id: 'wh-05',
    created_at: '2025-02-10T09:30:00Z',
  },

  // 6. Dự án VMT Capital Tower (Hà Nội)
  {
    id: 'asset-12',
    asset_code: 'VMB_BDS_00000001',
    collateral_type: 'BDS',
    asset_type: 'Sàn văn phòng thương mại Hạng A',
    certificate_no: 'GCN-HN-2024-00341',
    subdivision: 'Khối Văn Phòng Tháp Đông',
    lot_no: 'VP-FL-18',
    business_project_name: 'Tòa Nhà VMT Capital Tower',
    business_plot_code: 'CAPITAL-VP-18',
    area: 1450.0,
    owner_name: 'Công ty Cổ phần Đầu tư Phát triển Đô thị VMT Thăng Long',
    map_sheet_no: '09',
    land_lot_no: '601',
    province: 'TP. Hà Nội',
    district: 'Quận Cầu Giấy',
    ward: 'Phường Dịch Vọng Hậu',
    address_detail: 'Số 08 Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2072)',
    mortgage_bank: 'Ngân hàng TMCP Quân Đội (MB Bank) - CN Cầu Giấy',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ3',
    mortgage_valuation: 110000000000,
    credit_grant_rate: 70,
    mortgage_expected_release_date: '2027-03-31',
    scan_file_url: 'https://example.com/scan-gcn-hn-00341.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'not_ready',
    mortgage_status: 'mortgaged',
    project_id: 'proj-06',
    warehouse_id: 'wh-08',
    created_at: '2025-01-18T10:00:00Z',
  },
  {
    id: 'asset-13',
    asset_code: 'VMB_BDS_00000002',
    collateral_type: 'BDS',
    asset_type: 'Sàn trung tâm thương mại',
    certificate_no: 'GCN-HN-2024-00342',
    subdivision: 'Khối Đế Thương Mại',
    lot_no: 'TTTM-FL-02',
    business_project_name: 'Tòa Nhà VMT Capital Tower',
    business_plot_code: 'CAPITAL-TTTM-02',
    area: 3200.0,
    owner_name: 'Công ty Cổ phần Đầu tư Phát triển Đô thị VMT Thăng Long',
    map_sheet_no: '09',
    land_lot_no: '602',
    province: 'TP. Hà Nội',
    district: 'Quận Cầu Giấy',
    ward: 'Phường Dịch Vọng Hậu',
    address_detail: 'Số 08 Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2072)',
    scan_file_url: 'https://example.com/scan-gcn-hn-00342.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'not_ready',
    mortgage_status: 'none',
    project_id: 'proj-06',
    warehouse_id: 'wh-07',
    created_at: '2025-01-18T10:30:00Z',
  },

  // 7. Dự án VMT Green Park (Hưng Yên)
  {
    id: 'asset-14',
    asset_code: 'VMB_BDS_00000003',
    collateral_type: 'BDS',
    asset_type: 'Nhà phố vườn',
    certificate_no: 'GCN-HY-2024-00788',
    subdivision: 'Phân khu Eco Valley',
    lot_no: 'EV-LK-22',
    business_project_name: 'Khu Đô Thị Sinh Thái VMT Green Park',
    business_plot_code: 'GREEN-EV-LK22',
    area: 110.0,
    owner_name: 'Công ty Cổ phần Tập đoàn VMT',
    map_sheet_no: '15',
    land_lot_no: '412',
    province: 'Hưng Yên',
    district: 'Huyện Văn Giang',
    ward: 'Xã Phụng Công',
    address_detail: 'Khu Đô Thị Green Park, Xã Phụng Công, Huyện Văn Giang, Hưng Yên',
    land_use_purpose: 'Đất ở tại nông thôn (ONT)',
    land_use_term: 'Lâu dài',
    scan_file_url: 'https://example.com/scan-gcn-hy-00788.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'none',
    project_id: 'proj-07',
    warehouse_id: 'wh-07',
    created_at: '2025-02-15T08:30:00Z',
  },

  // 8. Dự án Sunset Horizon Phú Quốc (Kiên Giang)
  {
    id: 'asset-15',
    asset_code: 'VMN_BDS_00000008',
    collateral_type: 'BDS',
    asset_type: 'Biệt thự đồi hướng biển',
    certificate_no: 'GCN-PQ-2024-00112',
    subdivision: 'Phân khu Cliff Villa',
    lot_no: 'CV-VILLA-08',
    business_project_name: 'Khu Nghỉ Dưỡng Sunset Horizon',
    business_plot_code: 'SUNSET-CV-08',
    area: 720.0,
    owner_name: 'Công ty Cổ phần Đầu tư Du lịch VMT Phú Quốc',
    map_sheet_no: '06',
    land_lot_no: '78',
    province: 'Kiên Giang (Phú Quốc)',
    district: 'TP. Phú Quốc',
    ward: 'Phường An Thới',
    address_detail: 'Mũi Ông Đội, Phường An Thới, TP. Phú Quốc, Kiên Giang',
    land_use_purpose: 'Đất thương mại dịch vụ (TMD)',
    land_use_term: '50 năm (Đến 2074)',
    mortgage_bank: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Phú Quốc',
    mortgage_unit: 'Ban Nguồn Vốn - TĐ1',
    mortgage_valuation: 85000000000,
    credit_grant_rate: 65,
    mortgage_expected_release_date: '2027-09-30',
    scan_file_url: 'https://example.com/scan-gcn-pq-00112.pdf',
    custody_status: 'in_stock',
    lifecycle_status: 'active',
    sale_status: 'ready_for_sale',
    mortgage_status: 'mortgaged',
    project_id: 'proj-08',
    warehouse_id: 'wh-01',
    created_at: '2025-02-18T14:00:00Z',
  },
];

export const MOCK_PROFILES: Profile[] = DEMO_PROFILES;

export const MOCK_TRANSACTIONS: any[] = [
  {
    id: 'tx-01',
    type: 'checkout',
    created_at: '2026-02-14T09:00:00Z',
    notes: 'Mượn 01 GCN QSDĐ phân khu Palm Oasis nộp hồ sơ thẩm định mở rộng hạn mức tín dụng dự án VMT Central Palm tại Vietcombank - CN Tân Định',
    created_by: { full_name: 'Phạm Minh Đức (Ban Nguồn Vốn)', email: 'capital@btcvmt.vn' },
    items: [
      {
        id: 'txi-01',
        transaction_id: 'tx-01',
        asset_id: 'asset-01',
        type: 'checkout',
        status: 'approved',
        voucher_code: 'PX-2026/001',
        details: {
          department: 'Ban Nguồn Vốn',
          reason: 'Mượn sổ nộp hồ sơ thẩm định mở rộng hạn mức tín dụng Vietcombank Tân Định',
          expected_return_date: '2026-09-15',
        },
        requested_details: {
          department: 'Ban Nguồn Vốn',
          reason: 'Mượn sổ nộp hồ sơ thẩm định mở rộng hạn mức tín dụng Vietcombank Tân Định',
          expected_return_date: '2026-09-15',
        },
        decided_at: '2026-02-14T14:30:00Z',
        decided_by: { full_name: 'Lê Hoàng Nam (Thủ Kho Trung Tâm)', email: 'warehouse@btcvmt.vn' },
        decision_notes: 'Đã hoàn tất thủ tục bàn giao và xuất kho theo quy chế quản lý tài sản bảo đảm.',
      },
    ],
  },
  {
    id: 'tx-02',
    type: 'checkout',
    created_at: '2026-02-22T08:30:00Z',
    notes: 'Đề xuất mượn GCN Shophouse RP-SH-08 Spana Riverside để hoàn tất thủ tục công chứng chuyển nhượng cho khách hàng đợt 1',
    created_by: { full_name: 'Trần Thị Bích (Ban Kinh Doanh BĐS)', email: 're_dept@btcvmt.vn' },
    items: [
      {
        id: 'txi-02',
        transaction_id: 'tx-02',
        asset_id: 'asset-04',
        type: 'checkout',
        status: 'pending',
        details: {
          department: 'Ban Kinh Doanh BĐS',
          reason: 'Mượn sổ ký công chứng chuyển nhượng quyền sử dụng đất và tài sản gắn liền với đất',
          expected_return_date: '2026-09-05',
        },
        requested_details: {
          department: 'Ban Kinh Doanh BĐS',
          reason: 'Mượn sổ ký công chứng chuyển nhượng quyền sử dụng đất và tài sản gắn liền với đất',
          expected_return_date: '2026-09-05',
        },
      },
    ],
  },
  {
    id: 'tx-03',
    type: 'checkin',
    created_at: '2026-02-05T10:00:00Z',
    notes: 'Nhập kho 01 GCN QSDĐ mới cấp sau khi hoàn thành nghĩa vụ tài chính dự án Tổ Hợp Thương Mại & Căn Hộ VMT Grand Marina',
    created_by: { full_name: 'Vũ Quốc Hùng (Ban Quản Lý Dự Án)', email: 'project@btcvmt.vn' },
    items: [
      {
        id: 'txi-03',
        transaction_id: 'tx-03',
        asset_id: 'asset-07',
        type: 'checkin',
        status: 'approved',
        voucher_code: 'PN-2026/001',
        details: {
          department: 'Ban Quản Lý Dự Án',
          reason: 'Nhập kho lưu trữ GCN mới nhận bàn giao từ Sở Tài Nguyên & Môi Trường tỉnh Đồng Nai',
        },
        decided_at: '2026-02-05T15:00:00Z',
        decided_by: { full_name: 'Lê Hoàng Nam (Thủ Kho Trung Tâm)', email: 'warehouse@btcvmt.vn' },
        decision_notes: 'Đã kiểm tra phôi sổ gốc, tem bảo an, lưu trữ tại Ngăn A4 - Kệ 02 Kho Grand Marina Đồng Nai.',
      },
    ],
  },
  {
    id: 'tx-04',
    type: 'sale_update',
    created_at: '2026-02-18T15:00:00Z',
    notes: 'Đề xuất cập nhật trạng thái Bảng hàng sang Sẵn sàng bán cho Biệt thự đồi Sunset Horizon Phú Quốc',
    created_by: { full_name: 'Trần Thị Bích (Ban Kinh Doanh BĐS)', email: 're_dept@btcvmt.vn' },
    items: [
      {
        id: 'txi-04',
        transaction_id: 'tx-04',
        asset_id: 'asset-15',
        type: 'sale_update',
        status: 'approved',
        details: { saleStatus: 'ready_for_sale' },
        requested_details: { saleStatus: 'ready_for_sale' },
        decided_at: '2026-02-19T09:00:00Z',
        decided_by: { full_name: 'Nguyễn Văn Quản Trị', email: 'quantri@btcvmt.vn' },
        decision_notes: 'Đã hoàn tất hạ tầng kỹ thuật và đủ điều kiện pháp lý mở bán theo Thông báo số 128/SXD-QLN.',
      },
    ],
  },
  {
    id: 'tx-05',
    type: 'mortgage_update',
    created_at: '2026-02-12T11:00:00Z',
    notes: 'Đề xuất cập nhật giải chấp thông tin thế chấp tại BIDV Đà Nẵng sau khi hoàn tất thanh toán hợp đồng tín dụng số 045/2023',
    created_by: { full_name: 'Phạm Minh Đức (Ban Nguồn Vốn)', email: 'capital@btcvmt.vn' },
    items: [
      {
        id: 'txi-05',
        transaction_id: 'tx-05',
        asset_id: 'asset-10',
        type: 'mortgage_update',
        status: 'approved',
        details: {
          mortgage_status: 'none',
          mortgage_bank: null,
          mortgage_unit: null,
          mortgage_valuation: null,
        },
        decided_at: '2026-02-12T16:00:00Z',
        decided_by: { full_name: 'Nguyễn Văn Quản Trị', email: 'quantri@btcvmt.vn' },
        decision_notes: 'Đã đối soát biên bản thanh lý hợp đồng thế chấp và xóa đăng ký giao dịch bảo đảm tại VPĐKĐĐ.',
      },
    ],
  },
  {
    id: 'tx-06',
    type: 'split',
    created_at: '2026-02-20T10:00:00Z',
    notes: 'Đề xuất xuất mượn GCN tổng nộp Sở TN&MT Hưng Yên để thực hiện thủ tục tách thành 25 GCN riêng lẻ phân khu Eco Valley',
    created_by: { full_name: 'Vũ Quốc Hùng (Ban Quản Lý Dự Án)', email: 'project@btcvmt.vn' },
    items: [
      {
        id: 'txi-06',
        transaction_id: 'tx-06',
        asset_id: 'asset-14',
        type: 'split',
        status: 'pending',
        details: {
          department: 'Ban Quản Lý Dự Án',
          reason: 'Nộp hồ sơ tách thửa và cấp đổi GCN theo quy hoạch chi tiết 1/500 đã được phê duyệt',
        },
      },
    ],
  },
];

export const MOCK_ACTIVITY_LOGS: any[] = [
  {
    id: 'log-01',
    asset_id: 'asset-01',
    log_date: '2026-02-14T14:30:00Z',
    action_type: 'Mượn/Xuất sổ',
    document_no: 'PX-2026/001',
    description: 'Xuất kho bàn giao GCN-HCM-2024-00189 cho Ban Nguồn Vốn nộp hồ sơ tín dụng Vietcombank',
    used_by: 'Ban Nguồn Vốn',
    performer: { full_name: 'Lê Hoàng Nam (Thủ Kho Trung Tâm)', email: 'warehouse@btcvmt.vn' },
    warehouse_id: 'wh-01',
    warehouse: { name: 'Kho Tổng Trung Tâm Tập Đoàn VMT' },
    notes: 'Biên bản bàn giao số PX-2026/001, hẹn hoàn trả trước ngày 15/09/2026.',
  },
  {
    id: 'log-02',
    asset_id: 'asset-07',
    log_date: '2026-02-05T15:00:00Z',
    action_type: 'Nhập sổ',
    document_no: 'PN-2026/001',
    description: 'Nhập kho lưu trữ GCN-ĐN-2024-00892 dự án VMT Grand Marina Đồng Nai',
    used_by: 'Ban Quản Lý Dự Án',
    performer: { full_name: 'Lê Hoàng Nam (Thủ Kho Trung Tâm)', email: 'warehouse@btcvmt.vn' },
    warehouse_id: 'wh-04',
    warehouse: { name: 'Kho Dự Án VMT Grand Marina Đồng Nai' },
    notes: 'Đã kiểm tra hiện trạng và lưu giữ tại Ngăn A4 - Kệ 02.',
  },
  {
    id: 'log-03',
    asset_id: 'asset-10',
    log_date: '2026-02-12T16:00:00Z',
    action_type: 'Giải chấp ngân hàng',
    document_no: 'GC-2026/045',
    description: 'Ghi nhận xóa thế chấp ngân hàng BIDV cho GCN-ĐNG-2023-00567',
    used_by: 'Ban Nguồn Vốn',
    performer: { full_name: 'Nguyễn Văn Quản Trị', email: 'quantri@btcvmt.vn' },
    warehouse_id: 'wh-05',
    warehouse: { name: 'Kho Chi Nhánh Miền Trung - Đà Nẵng' },
    notes: 'Đã hoàn tất thủ tục đăng ký biến động giải chấp.',
  },
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    record_id: 'asset-01',
    action: 'UPDATE',
    old_data: {
      business_project_name: 'Dự án Palm City',
      business_plot_code: 'PLM-01',
      subdivision: 'Phân khu Palm Oasis',
      area: 420.0,
    },
    new_data: {
      business_project_name: 'Khu Đô Thị Central Palm',
      business_plot_code: 'PALM-OASIS-01',
      subdivision: 'Phân khu Palm Oasis',
      area: 450.5,
    },
    changed_by: '00000000-0000-0000-0000-000000000001',
    changed_by_name: 'Nguyễn Văn Quản Trị (Ban Quản Trị)',
    notes: 'Cập nhật chuẩn hóa mã lô kinh doanh và diện tích theo trích lục địa chính mới',
    created_at: '2026-02-10T09:15:00Z',
    profiles: {
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Nguyễn Văn Quản Trị',
      email: 'quantri@btcvmt.vn',
    },
  },
  {
    id: 'audit-002',
    record_id: 'asset-15',
    action: 'UPDATE',
    old_data: {
      sale_status: 'not_ready',
    },
    new_data: {
      sale_status: 'ready_for_sale',
    },
    changed_by: '00000000-0000-0000-0000-000000000001',
    changed_by_name: 'Nguyễn Văn Quản Trị (Ban Quản Trị)',
    notes: 'Phê duyệt chuyển trạng thái Sẵn sàng bán theo Phiếu đề xuất #tx-04',
    created_at: '2026-02-19T09:00:00Z',
    profiles: {
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Nguyễn Văn Quản Trị',
      email: 'quantri@btcvmt.vn',
    },
  },
];

export const MOCK_NOTIFICATIONS: any[] = [
  {
    id: 'notif-01',
    user_id: '00000000-0000-0000-0000-000000000003',
    type: 'request_approved',
    title: 'Phiếu yêu cầu mượn sổ #tx-01 đã được phê duyệt',
    body: 'Thủ kho Lê Hoàng Nam đã phê duyệt xuất kho GCN-HCM-2024-00189. Mã phiếu xuất: PX-2026/001.',
    transaction_item_id: 'txi-01',
    is_read: false,
    created_at: '2026-02-14T14:30:00Z',
  },
  {
    id: 'notif-02',
    user_id: '00000000-0000-0000-0000-000000000002',
    type: 'new_request',
    title: 'Có phiếu đề xuất mượn sổ mới #tx-02 cần xử lý',
    body: 'Ban Kinh Doanh BĐS vừa gửi yêu cầu mượn GCN Shophouse RP-SH-08 Spana Riverside.',
    transaction_item_id: 'txi-02',
    is_read: false,
    created_at: '2026-02-22T08:30:00Z',
  },
];

export const MOCK_ACCESS_REQUESTS: any[] = [
  {
    id: 'req-01',
    full_name: 'Đặng Thanh Tâm',
    email: 'tam.dang@vietcombank.com.vn',
    phone: '0908123456',
    organization: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank) - P. Thẩm định TSĐB',
    purpose: 'Tra cứu thông tin pháp lý & tình trạng thế chấp GCN QSDĐ dự án Spana Riverside phục vụ giải ngân gói tín dụng',
    warehouse_id: 'wh-03',
    status: 'pending',
    created_at: '2026-02-24T08:15:00Z',
    warehouses: { name: 'Kho Dự Án Spana Riverside Bình Dương', code: '003', is_central: false },
  },
  {
    id: 'req-02',
    full_name: 'Hoàng Nhật Minh',
    email: 'minh.hn@investvmt.vn',
    phone: '0912889977',
    organization: 'Công ty Cổ phần Đầu tư Đối tác VMT (Đơn vị liên kết phát triển DA)',
    purpose: 'Khảo sát hiện trạng lưu trữ và số lượng sổ đỏ tại chi nhánh Miền Trung để chuẩn bị lập hồ sơ M&A',
    warehouse_id: 'wh-05',
    status: 'pending',
    created_at: '2026-02-25T10:30:00Z',
    warehouses: { name: 'Kho Chi Nhánh Miền Trung - Đà Nẵng', code: '005', is_central: false },
  },
  {
    id: 'req-03',
    full_name: 'Trần Văn Long',
    email: 'long.tv@auditing.vn',
    phone: '0988776655',
    organization: 'Công ty Kiểm toán Ernst & Young (EY Việt Nam)',
    purpose: 'Kiểm toán độc lập định kỳ hồ sơ pháp lý tài sản đảm bảo niên độ 2025-2026',
    warehouse_id: 'wh-01',
    status: 'approved',
    reviewed_by: '00000000-0000-0000-0000-000000000001',
    reviewed_at: '2026-02-20T16:00:00Z',
    created_at: '2026-02-20T09:00:00Z',
    reviewer: { full_name: 'Nguyễn Văn Quản Trị', email: 'quantri@btcvmt.vn' },
    warehouses: { name: 'Kho Tổng Trung Tâm Tập Đoàn VMT', code: '001', is_central: true },
  },
];

export const MOCK_VIEWER_WAREHOUSE_ACCESS: any[] = [
  {
    id: 'vwa-01',
    user_id: '00000000-0000-0000-0000-000000000006',
    warehouse_id: 'wh-01',
    approved_by: '00000000-0000-0000-0000-000000000001',
    approved_at: '2026-02-01T08:00:00Z',
    expires_at: '2026-05-01T23:59:59Z',
    notes: 'Cấp quyền tra cứu 90 ngày phục vụ đối soát định kỳ',
    profiles: { full_name: 'Chuyên viên Tra Cứu Hồ Sơ', email: 'viewer@btcvmt.vn' },
    warehouses: { name: 'Kho Tổng Trung Tâm Tập Đoàn VMT', code: '001', is_central: true },
  },
  {
    id: 'vwa-02',
    user_id: '00000000-0000-0000-0000-000000000006',
    warehouse_id: 'wh-02',
    approved_by: '00000000-0000-0000-0000-000000000001',
    approved_at: '2026-02-01T08:00:00Z',
    expires_at: '2026-08-01T23:59:59Z',
    notes: 'Cấp quyền tra cứu 180 ngày kho Miền Nam',
    profiles: { full_name: 'Chuyên viên Tra Cứu Hồ Sơ', email: 'viewer@btcvmt.vn' },
    warehouses: { name: 'Kho Lưu Trữ Miền Nam - TP.HCM', code: '002', is_central: false },
  },
];

export const MOCK_ACCESS_LOGS: any[] = [
  {
    id: 'alog-01',
    user_id: '00000000-0000-0000-0000-000000000006',
    action: 'login',
    resource_table: null,
    resource_id: null,
    details: { method: 'otp', email: 'viewer@btcvmt.vn' },
    ip_address: '14.232.180.12',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
    created_at: '2026-02-26T08:30:00Z',
    profiles: { full_name: 'Chuyên viên Tra Cứu Hồ Sơ', email: 'viewer@btcvmt.vn' },
  },
  {
    id: 'alog-02',
    user_id: '00000000-0000-0000-0000-000000000006',
    action: 'view_asset',
    resource_table: 'assets',
    resource_id: 'asset-01',
    details: { certificate_no: 'GCN-HCM-2024-00189', warehouse_id: 'wh-01' },
    ip_address: '14.232.180.12',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
    created_at: '2026-02-26T08:32:15Z',
    profiles: { full_name: 'Chuyên viên Tra Cứu Hồ Sơ', email: 'viewer@btcvmt.vn' },
  },
  {
    id: 'alog-03',
    user_id: '00000000-0000-0000-0000-000000000003',
    action: 'export',
    resource_table: 'assets',
    resource_id: null,
    details: { format: 'xlsx', rowCount: 15, query: 'mortgaged' },
    ip_address: '113.161.45.89',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    created_at: '2026-02-25T14:10:00Z',
    profiles: { full_name: 'Phạm Minh Đức', email: 'capital@btcvmt.vn' },
  },
];

export const MOCK_APP_USERS = [
  {
    id: 'app-user-01',
    username: 'tracuuvien01',
    password: 'password123',
    role: 'user',
    status: 'pending',
    access_expires_at: null,
    created_at: '2026-03-01T08:30:00Z',
  },
  {
    id: 'app-user-02',
    username: 'chuyenvien_nganhang',
    password: 'password123',
    role: 'user',
    status: 'approved',
    access_expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: '2026-02-28T10:15:00Z',
  },
  {
    id: 'app-user-03',
    username: 'congtacvien_hanoi',
    password: 'password123',
    role: 'user',
    status: 'pending',
    access_expires_at: null,
    created_at: '2026-03-02T14:20:00Z',
  },
  {
    id: 'app-user-04',
    username: 'thuky_phaply',
    password: 'password123',
    role: 'user',
    status: 'expired',
    access_expires_at: '2026-03-01T12:00:00Z',
    created_at: '2026-02-20T09:00:00Z',
  },
  {
    id: 'app-user-05',
    username: 'admin',
    password: 'password123',
    role: 'admin',
    status: 'approved',
    access_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: '2026-01-01T00:00:00Z',
  },
];

export const MOCK_REPORT_SNAPSHOTS: ReportSnapshot[] = [
  {
    id: 'snap-2026-08',
    report_code: 'BC-2026-08',
    report_period: 'Tháng 08/2026',
    period_status: 'locked',
    title: 'Báo cáo Kiểm kê Quản lý GCN QSDĐ & TSĐB Tháng 08/2026',
    region: 'Toàn quốc',
    warehouse_id: 'wh-01',
    warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
    department_name: 'Ban Tài Chính VMT',
    submitted_by: 'app-user-05',
    submitted_by_name: 'Nguyễn Văn Quản Trị (Admin)',
    submitted_at: '2026-08-31T17:00:00Z',
    locked_at: '2026-08-31T17:30:00Z',
    locked_by: 'app-user-05',
    locked_by_name: 'Nguyễn Văn Quản Trị (Admin)',
    total_assets: 4,
    total_area: 1680.5,
    total_valuation: 198000000000,
    total_collateral_value: 138600000000,
    report_data: [
      {
        asset_id: 'asset-01',
        asset_code: 'VMN_BDS_00000001',
        certificate_no: 'GCN-HCM-2024-00189',
        project_name: 'Dự án Khu Đô Thị VMT Central Palm',
        business_project_name: 'Khu Đô Thị Central Palm',
        area_name: 'TP. Hồ Chí Minh',
        region_name: 'Miền Nam',
        warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        department_name: 'Ban Nguồn Vốn - TĐ1',
        current_holder_dept: 'Ban Nguồn Vốn',
        asset_type_name: 'Biệt thự đơn lập',
        land_use_type_name: 'Đất ở tại đô thị (ODT)',
        usage_purpose: 'Đất ở tại đô thị (ODT)',
        usage_term: 'Lâu dài',
        owner_name: 'Công ty Cổ phần Tập đoàn VMT',
        certificate_group_label: 'Sổ chính',
        subdivision: 'Phân khu Palm Oasis',
        lot_no: 'PO-BT-01',
        land_lot_no: '112',
        map_sheet_no: '04',
        plot_code: 'Phân khu Palm Oasis - PO-BT-01',
        business_plot_code: 'PALM-OASIS-01',
        area: 450.5,
        address_detail: 'Số 18 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
        mortgage_status_label: 'Đã thế chấp',
        mortgage_bank_name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Tân Định',
        mortgage_unit_name: 'Ban Nguồn Vốn - TĐ1',
        mortgage_valuation: 68000000000,
        collateral_ratio: 70,
        collateral_value: 47600000000,
        custody_status_label: 'Đang xuất mượn (Ban Nguồn Vốn)',
        lifecycle_status_label: 'Hiệu lực',
        notes: 'Sổ mượn nộp thẩm định hạn mức tín dụng',
      },
      {
        asset_id: 'asset-02',
        asset_code: 'VMN_BDS_00000002',
        certificate_no: 'GCN-HCM-2024-00190',
        project_name: 'Dự án Khu Đô Thị VMT Central Palm',
        business_project_name: 'Khu Đô Thị Central Palm',
        area_name: 'TP. Hồ Chí Minh',
        region_name: 'Miền Nam',
        warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        department_name: 'Ban Nguồn Vốn - TĐ1',
        current_holder_dept: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        asset_type_name: 'Biệt thự song lập',
        land_use_type_name: 'Đất ở tại đô thị (ODT)',
        usage_purpose: 'Đất ở tại đô thị (ODT)',
        usage_term: 'Lâu dài',
        owner_name: 'Công ty Cổ phần Tập đoàn VMT',
        certificate_group_label: 'Sổ chính',
        subdivision: 'Phân khu Palm Oasis',
        lot_no: 'PO-BT-02',
        land_lot_no: '113',
        map_sheet_no: '04',
        plot_code: 'Phân khu Palm Oasis - PO-BT-02',
        business_plot_code: 'PALM-OASIS-02',
        area: 320.0,
        address_detail: 'Số 20 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
        mortgage_status_label: 'Đã thế chấp',
        mortgage_bank_name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Tân Định',
        mortgage_unit_name: 'Ban Nguồn Vốn - TĐ1',
        mortgage_valuation: 45000000000,
        collateral_ratio: 70,
        collateral_value: 31500000000,
        custody_status_label: 'Lưu kho an toàn',
        lifecycle_status_label: 'Hiệu lực',
        notes: 'Lưu kho két an toàn số 02',
      },
      {
        asset_id: 'asset-05',
        asset_code: 'VMT_BDS_00000005',
        certificate_no: 'GCN-DNG-2023-09412',
        project_name: 'Dự án Khu Phức Hợp VMT Dragon Bay',
        business_project_name: 'VMT Dragon Bay',
        area_name: 'TP. Đà Nẵng',
        region_name: 'Miền Trung',
        warehouse_name: 'Kho Chi Nhánh Miền Trung - Đà Nẵng',
        department_name: 'Ban Tài Chính VMT',
        current_holder_dept: 'Kho Chi Nhánh Miền Trung - Đà Nẵng',
        asset_type_name: 'Đất thương mại dịch vụ (TMDV)',
        land_use_type_name: 'Đất thương mại dịch vụ',
        usage_purpose: 'Đất thương mại dịch vụ (TMD)',
        usage_term: 'Đến năm 2073',
        owner_name: 'Công ty Cổ phần VMT Miền Trung',
        certificate_group_label: 'Sổ lớn',
        subdivision: 'Khu A',
        lot_no: 'TMDV-01',
        land_lot_no: '88',
        map_sheet_no: '19',
        plot_code: 'Khu A - TMDV-01',
        business_plot_code: 'DB-TMDV-01',
        area: 650.0,
        address_detail: 'Đường Võ Nguyên Giáp, Phường Phước Mỹ, Quận Sơn Trà, TP. Đà Nẵng',
        mortgage_status_label: 'Đã thế chấp',
        mortgage_bank_name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) - CN Đà Nẵng',
        mortgage_unit_name: 'Ban Nguồn Vốn VMT',
        mortgage_valuation: 85000000000,
        collateral_ratio: 70,
        collateral_value: 59500000000,
        custody_status_label: 'Lưu kho an toàn',
        lifecycle_status_label: 'Hiệu lực',
        notes: 'Đã hoàn thành kiểm kê',
      },
      {
        asset_id: 'asset-06',
        asset_code: 'VMT_BDS_00000006',
        certificate_no: 'GCN-DNG-2023-09413',
        project_name: 'Dự án Khu Phức Hợp VMT Dragon Bay',
        business_project_name: 'VMT Dragon Bay',
        area_name: 'TP. Đà Nẵng',
        region_name: 'Miền Trung',
        warehouse_name: 'Kho Chi Nhánh Miền Trung - Đà Nẵng',
        department_name: 'Ban Tài Chính VMT',
        current_holder_dept: 'Kho Chi Nhánh Miền Trung - Đà Nẵng',
        asset_type_name: 'Nhà phố thương mại (Shophouse)',
        land_use_type_name: 'Đất ở tại đô thị (ODT)',
        usage_purpose: 'Đất ở tại đô thị (ODT)',
        usage_term: 'Lâu dài',
        owner_name: 'Công ty Cổ phần VMT Miền Trung',
        certificate_group_label: 'Sổ chính',
        subdivision: 'Khu B - Phố đi bộ',
        lot_no: 'SH-01',
        land_lot_no: '102',
        map_sheet_no: '19',
        plot_code: 'Khu B - Phố đi bộ - SH-01',
        business_plot_code: 'DB-SH-01',
        area: 260.0,
        address_detail: 'Đường Bạch Đằng Nối Dài, Phường Phước Mỹ, Quận Sơn Trà, TP. Đà Nẵng',
        mortgage_status_label: 'Chưa thế chấp',
        mortgage_bank_name: 'Không',
        mortgage_unit_name: 'Không',
        mortgage_valuation: 0,
        collateral_ratio: 0,
        collateral_value: 0,
        custody_status_label: 'Lưu kho an toàn',
        lifecycle_status_label: 'Hiệu lực',
        notes: 'Tài sản sẵn sàng khai thác kinh doanh',
      },
    ],
    summary_stats: {
      mortgaged_count: 3,
      unmortgaged_count: 1,
      borrowed_count: 1,
    },
    notes: 'Đã hoàn tất đối chiếu số liệu kho và tín dụng kỳ Tháng 08/2026. Chốt khóa dữ liệu tĩnh.',
    created_at: '2026-08-31T17:00:00Z',
    updated_at: '2026-08-31T17:30:00Z',
  },
  {
    id: 'snap-2026-09',
    report_code: 'BC-2026-09',
    report_period: 'Tháng 09/2026',
    period_status: 'open',
    title: 'Báo cáo Sơ bộ Tài Sản Thế Chấp & Tình Hình Lưu Kho Kỳ Tháng 09/2026',
    region: 'Toàn quốc',
    warehouse_id: 'wh-01',
    warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
    department_name: 'Ban Tài Chính VMT',
    submitted_by: 'app-user-05',
    submitted_by_name: 'Nguyễn Văn Quản Trị (Admin)',
    submitted_at: '2026-09-02T09:00:00Z',
    total_assets: 2,
    total_area: 770.5,
    total_valuation: 113000000000,
    total_collateral_value: 79100000000,
    report_data: [
      {
        asset_id: 'asset-01',
        asset_code: 'VMN_BDS_00000001',
        certificate_no: 'GCN-HCM-2024-00189',
        project_name: 'Dự án Khu Đô Thị VMT Central Palm',
        business_project_name: 'Khu Đô Thị Central Palm',
        area_name: 'TP. Hồ Chí Minh',
        region_name: 'Miền Nam',
        warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        department_name: 'Ban Nguồn Vốn - TĐ1',
        current_holder_dept: 'Ban Nguồn Vốn',
        asset_type_name: 'Biệt thự đơn lập',
        land_use_type_name: 'Đất ở tại đô thị (ODT)',
        usage_purpose: 'Đất ở tại đô thị (ODT)',
        usage_term: 'Lâu dài',
        owner_name: 'Công ty Cổ phần Tập đoàn VMT',
        certificate_group_label: 'Sổ chính',
        subdivision: 'Phân khu Palm Oasis',
        lot_no: 'PO-BT-01',
        land_lot_no: '112',
        map_sheet_no: '04',
        plot_code: 'Phân khu Palm Oasis - PO-BT-01',
        business_plot_code: 'PALM-OASIS-01',
        area: 450.5,
        address_detail: 'Số 18 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
        mortgage_status_label: 'Đã thế chấp',
        mortgage_bank_name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Tân Định',
        mortgage_unit_name: 'Ban Nguồn Vốn - TĐ1',
        mortgage_valuation: 68000000000,
        collateral_ratio: 70,
        collateral_value: 47600000000,
        custody_status_label: 'Đang xuất mượn (Ban Nguồn Vốn)',
        lifecycle_status_label: 'Hiệu lực',
        notes: '',
      },
      {
        asset_id: 'asset-02',
        asset_code: 'VMN_BDS_00000002',
        certificate_no: 'GCN-HCM-2024-00190',
        project_name: 'Dự án Khu Đô Thị VMT Central Palm',
        business_project_name: 'Khu Đô Thị Central Palm',
        area_name: 'TP. Hồ Chí Minh',
        region_name: 'Miền Nam',
        warehouse_name: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        department_name: 'Ban Nguồn Vốn - TĐ1',
        current_holder_dept: 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        asset_type_name: 'Biệt thự song lập',
        land_use_type_name: 'Đất ở tại đô thị (ODT)',
        usage_purpose: 'Đất ở tại đô thị (ODT)',
        usage_term: 'Lâu dài',
        owner_name: 'Công ty Cổ phần Tập đoàn VMT',
        certificate_group_label: 'Sổ chính',
        subdivision: 'Phân khu Palm Oasis',
        lot_no: 'PO-BT-02',
        land_lot_no: '113',
        map_sheet_no: '04',
        plot_code: 'Phân khu Palm Oasis - PO-BT-02',
        business_plot_code: 'PALM-OASIS-02',
        area: 320.0,
        address_detail: 'Số 20 Đường Song Hành, Phường An Phú, TP. Thủ Đức, TP.HCM',
        mortgage_status_label: 'Đã thế chấp',
        mortgage_bank_name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN Tân Định',
        mortgage_unit_name: 'Ban Nguồn Vốn - TĐ1',
        mortgage_valuation: 45000000000,
        collateral_ratio: 70,
        collateral_value: 31500000000,
        custody_status_label: 'Lưu kho an toàn',
        lifecycle_status_label: 'Hiệu lực',
        notes: '',
      },
    ],
    summary_stats: {
      mortgaged_count: 2,
      unmortgaged_count: 0,
      borrowed_count: 1,
    },
    notes: 'Kỳ báo cáo dự thảo đang mở để tiếp tục cập nhật và kiểm đếm.',
    created_at: '2026-09-02T09:00:00Z',
    updated_at: '2026-09-02T09:00:00Z',
  },
];

export const MOCK_INVENTORY_AUDITS: InventoryAudit[] = [
  {
    id: 'aud-01',
    warehouse_id: 'wh-01',
    performed_by: 'p-04',
    started_at: '2026-08-25T08:00:00Z',
    completed_at: '2026-08-25T16:30:00Z',
    status: 'completed',
    notes: 'Kiểm kê định kỳ tháng 08/2026 tại Kho Tổng Trung Tâm. Tất cả tài sản đã được đối chiếu thực tế.',
    total_expected: 4,
    total_found: 4,
    total_missing: 0,
    total_misplaced: 1,
    created_at: '2026-08-25T08:00:00Z',
    updated_at: '2026-08-25T16:30:00Z',
  },
  {
    id: 'aud-02',
    warehouse_id: 'wh-03',
    performed_by: 'p-04',
    started_at: '2026-09-04T08:30:00Z',
    completed_at: null,
    status: 'in_progress',
    notes: 'Kiểm kê định kỳ tháng 09/2026 tại Kho Dự Án Spana Riverside.',
    total_expected: 3,
    total_found: 2,
    total_missing: 1,
    total_misplaced: 1,
    created_at: '2026-09-04T08:30:00Z',
    updated_at: '2026-09-04T08:30:00Z',
  }
];

export const MOCK_INVENTORY_AUDIT_ITEMS: InventoryAuditItem[] = [
  // Items for aud-01
  {
    id: 'audi-01',
    audit_id: 'aud-01',
    asset_id: 'asset-01',
    expected_status: 'in_stock',
    expected_location: 'Kệ A1 - Hộp 01',
    actual_found: true,
    actual_location: 'Kệ A1 - Hộp 01',
    finding_status: 'matched',
    note: 'Sổ còn nguyên vẹn, tem niêm phong đầy đủ.',
    audited_at: '2026-08-25T09:15:00Z',
    created_at: '2026-08-25T08:00:00Z',
  },
  {
    id: 'audi-02',
    audit_id: 'aud-01',
    asset_id: 'asset-02',
    expected_status: 'in_stock',
    expected_location: 'Kệ A1 - Hộp 02',
    actual_found: true,
    actual_location: 'Kệ A2 - Hộp 01 (Sai vị trí)',
    finding_status: 'misplaced',
    note: 'Đặt nhầm sang Kệ A2 - Hộp 01. Đã chuyển lại đúng vị trí.',
    audited_at: '2026-08-25T10:00:00Z',
    created_at: '2026-08-25T08:00:00Z',
  },
  {
    id: 'audi-03',
    audit_id: 'aud-01',
    asset_id: 'asset-04',
    expected_status: 'in_stock',
    expected_location: 'Kệ A2 - Hộp 04',
    actual_found: true,
    actual_location: 'Kệ A2 - Hộp 04',
    finding_status: 'matched',
    note: 'Đúng vị trí',
    audited_at: '2026-08-25T10:30:00Z',
    created_at: '2026-08-25T08:00:00Z',
  },
  {
    id: 'audi-04',
    audit_id: 'aud-01',
    asset_id: 'asset-06',
    expected_status: 'in_stock',
    expected_location: 'Kệ B1 - Hộp 02',
    actual_found: true,
    actual_location: 'Kệ B1 - Hộp 02',
    finding_status: 'matched',
    note: 'Đúng vị trí',
    audited_at: '2026-08-25T11:00:00Z',
    created_at: '2026-08-25T08:00:00Z',
  },

  // Items for aud-02
  {
    id: 'audi-05',
    audit_id: 'aud-02',
    asset_id: 'asset-04',
    expected_status: 'in_stock',
    expected_location: 'Kệ BD-01 - Ngăn 1',
    actual_found: true,
    actual_location: 'Kệ BD-01 - Ngăn 1',
    finding_status: 'matched',
    note: 'Khớp vị trí lưu kho',
    audited_at: '2026-09-04T08:45:00Z',
    created_at: '2026-09-04T08:30:00Z',
  },
  {
    id: 'audi-06',
    audit_id: 'aud-02',
    asset_id: 'asset-05',
    expected_status: 'in_stock',
    expected_location: 'Kệ BD-01 - Ngăn 2',
    actual_found: true,
    actual_location: 'Kệ BD-02 - Ngăn 1',
    finding_status: 'misplaced',
    note: 'Tìm thấy ở Kệ BD-02 thay vì BD-01',
    audited_at: '2026-09-04T09:10:00Z',
    created_at: '2026-09-04T08:30:00Z',
  },
  {
    id: 'audi-07',
    audit_id: 'aud-02',
    asset_id: 'asset-07',
    expected_status: 'in_stock',
    expected_location: 'Kệ BD-02 - Ngăn 3',
    actual_found: false,
    actual_location: null,
    finding_status: 'missing',
    note: 'Chưa tìm thấy trên kệ BD-02, nghi ngờ đang để tại phòng giao dịch hoặc chưa nhập kho hoàn tất.',
    audited_at: '2026-09-04T09:30:00Z',
    created_at: '2026-09-04T08:30:00Z',
  },
];

const STORAGE_KEYS = {
  REGIONS: 'btcvmt_std_regions_v3',
  AREAS: 'btcvmt_std_areas_v3',
  WAREHOUSES: 'btcvmt_std_warehouses_v3',
  PROJECTS: 'btcvmt_std_projects_v3',
  ASSETS: 'btcvmt_std_assets_v3',
  TRANSACTIONS: 'btcvmt_std_transactions_v3',
  LOGS: 'btcvmt_std_activity_logs_v3',
  PROFILES: 'btcvmt_std_profiles_v3',
  APP_USERS: 'btcvmt_std_app_users_v3',
  AUDIT_LOGS: 'btcvmt_std_audit_logs_v3',
  NOTIFICATIONS: 'btcvmt_std_notifications_v3',
  ACCESS_REQUESTS: 'btcvmt_std_access_requests_v3',
  VIEWER_WAREHOUSE_ACCESS: 'btcvmt_std_viewer_warehouse_access_v3',
  ACCESS_LOGS: 'btcvmt_std_access_logs_v3',
  REPORT_SNAPSHOTS: 'btcvmt_std_report_snapshots_v3',
  INVENTORY_AUDITS: 'btcvmt_std_inventory_audits_v3',
  INVENTORY_AUDIT_ITEMS: 'btcvmt_std_inventory_audit_items_v3',
  INVESTOR_ENTITIES: 'btcvmt_std_investor_entities_v3',
  ASSET_OWNERSHIP_TRANSFERS: 'btcvmt_std_asset_ownership_transfers_v3',
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
      regions: regions.find(r => r.id === a.region_id) || a.regions || { name: 'Chưa gán vùng' },
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

  getInvestorEntities: (): InvestorEntity[] => getStored(STORAGE_KEYS.INVESTOR_ENTITIES, MOCK_INVESTOR_ENTITIES),
  saveInvestorEntities: (data: InvestorEntity[]) => setStored(STORAGE_KEYS.INVESTOR_ENTITIES, data),

  getAssetOwnershipTransfers: (assetId?: string): AssetOwnershipTransfer[] => {
    const list = getStored<AssetOwnershipTransfer[]>(STORAGE_KEYS.ASSET_OWNERSHIP_TRANSFERS, MOCK_ASSET_OWNERSHIP_TRANSFERS);
    const entities = mockStore.getInvestorEntities();
    const profiles = mockStore.getProfiles();
    const assets = getStored<Asset[]>(STORAGE_KEYS.ASSETS, MOCK_ASSETS);

    let filtered = list;
    if (assetId) {
      filtered = filtered.filter(t => t.asset_id === assetId);
    }

    return filtered.map(t => {
      const fromEnt = t.from_entity_id ? entities.find(e => e.id === t.from_entity_id) : undefined;
      const toEnt = entities.find(e => e.id === t.to_entity_id);
      const perf = t.transferred_by ? profiles.find(p => p.id === t.transferred_by) : undefined;
      const ast = assets.find(a => a.id === t.asset_id);

      return {
        ...t,
        from_entity: fromEnt,
        to_entity: toEnt,
        performer: perf ? { id: perf.id, full_name: perf.full_name, email: perf.email } : undefined,
        asset: ast,
      };
    }).sort((a, b) => new Date(b.transferred_at || '').getTime() - new Date(a.transferred_at || '').getTime());
  },

  addAssetOwnershipTransfer: (transfer: Omit<AssetOwnershipTransfer, 'id' | 'transferred_at'> & { id?: string; transferred_at?: string }): AssetOwnershipTransfer => {
    const list = getStored<AssetOwnershipTransfer[]>(STORAGE_KEYS.ASSET_OWNERSHIP_TRANSFERS, MOCK_ASSET_OWNERSHIP_TRANSFERS);
    const newRecord: AssetOwnershipTransfer = {
      id: transfer.id || `aot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      asset_id: transfer.asset_id,
      from_entity_id: transfer.from_entity_id || null,
      from_role: transfer.from_role || null,
      to_entity_id: transfer.to_entity_id,
      to_role: transfer.to_role,
      transferred_by: transfer.transferred_by || null,
      transferred_at: transfer.transferred_at || new Date().toISOString(),
      note: transfer.note || null,
    };
    const updated = [newRecord, ...list];
    setStored(STORAGE_KEYS.ASSET_OWNERSHIP_TRANSFERS, updated);

    // Also update target asset's current_owner_entity_id and current_owner_role in storage
    const allAssets = getStored<Asset[]>(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    const assetIdx = allAssets.findIndex(a => a.id === transfer.asset_id);
    if (assetIdx !== -1) {
      allAssets[assetIdx] = {
        ...allAssets[assetIdx],
        current_owner_entity_id: transfer.to_entity_id,
        current_owner_role: transfer.to_role,
        updated_at: new Date().toISOString(),
        updated_by: transfer.transferred_by || null,
      };
      setStored(STORAGE_KEYS.ASSETS, allAssets);
    }

    return newRecord;
  },

  saveAssetOwnershipTransfers: (data: AssetOwnershipTransfer[]) => setStored(STORAGE_KEYS.ASSET_OWNERSHIP_TRANSFERS, data),

  getAssets: (filters?: any): Asset[] => {
    let assets = getStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    const projects = mockStore.getProjects();
    const warehouses = mockStore.getWarehouses();
    const investorEntities = mockStore.getInvestorEntities();

    // Track sequence per (region_collateral)
    const counters: Record<string, number> = {};

    assets = assets.map((a) => {
      const proj = projects.find(p => p.id === a.project_id);
      const wh = warehouses.find(w => w.id === a.warehouse_id);
      const ownerEnt = a.current_owner_entity_id ? investorEntities.find(e => e.id === a.current_owner_entity_id) : null;
      
      const regionCode = wh?.region_code || (proj?.areas?.region_id === 'reg-02' ? 'VMT' : (proj?.areas?.region_id === 'reg-03' ? 'VMB' : 'VMN'));
      const colType = a.collateral_type || 'BDS';
      const key = `${regionCode}_${colType}`;

      counters[key] = (counters[key] || 0) + 1;

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
        asset_type: a.asset_type || 'Bất động sản',
        updated_at: a.updated_at || a.created_at,
        updated_by: a.updated_by || null,
        updater: updaterProf ? { id: updaterProf.id, full_name: updaterProf.full_name, email: updaterProf.email } : (a.updater || null),
        projects: proj ? { name: proj.name, areas: proj.areas } : a.projects,
        warehouses: wh ? { name: wh.name, is_central: wh.is_central, code: wh.code, region_code: wh.region_code } : a.warehouses,
        current_owner_entity: ownerEnt || null,
        investor_entities: ownerEnt ? { name: ownerEnt.name, company_code: ownerEnt.company_code } : null,
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
  deleteAsset: (id: string) => {
    const assets = getStored<Asset[]>(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    setStored(STORAGE_KEYS.ASSETS, assets.filter(a => a.id !== id));
  },
  deleteAssets: (ids: string[]) => {
    const idSet = new Set(ids);
    const assets = getStored<Asset[]>(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    setStored(STORAGE_KEYS.ASSETS, assets.filter(a => !idSet.has(a.id)));
  },

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

  // app_users management
  getAppUsers: (): any[] => getStored(STORAGE_KEYS.APP_USERS, MOCK_APP_USERS),
  saveAppUsers: (data: any[]) => setStored(STORAGE_KEYS.APP_USERS, data),

  registerAppUser: (p_username: string, p_password: string): any => {
    const cleanUsername = p_username.trim().toLowerCase();
    const users = mockStore.getAppUsers();
    const existing = users.find(u => u.username.toLowerCase() === cleanUsername);
    if (existing) {
      throw new Error(`Tên đăng nhập "${cleanUsername}" đã tồn tại trên hệ thống.`);
    }
    const newUser = {
      id: `app-user-${Date.now()}`,
      username: cleanUsername,
      password: p_password,
      role: 'user',
      status: 'pending',
      access_expires_at: null,
      created_at: new Date().toISOString(),
    };
    users.unshift(newUser);
    mockStore.saveAppUsers(users);

    // Also sync to mock profiles for backwards compatibility
    const profiles = mockStore.getProfiles();
    profiles.unshift({
      id: newUser.id,
      username: cleanUsername,
      email: `${cleanUsername}@btcvmt.vn`,
      full_name: cleanUsername,
      role: 'user',
      status: 'pending',
      access_expires_at: null,
      permissions: ['asset.lookup'],
      region_id: null,
      area_id: null,
      project_ids: null,
      managed_warehouse_ids: null,
      created_at: newUser.created_at,
    });
    mockStore.saveProfiles(profiles);

    return newUser;
  },

  loginAppUser: (p_username: string, p_password: string): any => {
    const cleanUsername = p_username.trim().toLowerCase();
    const users = mockStore.getAppUsers();
    const user = users.find(u => u.username.toLowerCase() === cleanUsername);
    if (!user) {
      return null;
    }
    // Check password (in mock demo, also accept password123 or 123456 or exact match)
    if (user.password && user.password !== p_password && p_password !== '123456' && p_password !== 'password123') {
      return null;
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      status: user.status || 'pending',
      access_expires_at: user.access_expires_at || null,
      full_name: user.full_name || user.username,
    };
  },

  approveAppUser: (id: string, accessExpiresAt: string): any => {
    const users = mockStore.getAppUsers();
    const updated = users.map(u => u.id === id ? { ...u, status: 'approved', access_expires_at: accessExpiresAt } : u);
    mockStore.saveAppUsers(updated);

    // Sync to profiles
    const profiles = mockStore.getProfiles();
    const updatedProfiles = profiles.map(p => p.id === id || p.username === id ? { ...p, status: 'approved' as const, access_expires_at: accessExpiresAt } : p);
    mockStore.saveProfiles(updatedProfiles);

    return updated.find(u => u.id === id);
  },

  rejectAppUser: (id: string): any => {
    const users = mockStore.getAppUsers();
    const updated = users.map(u => u.id === id ? { ...u, status: 'rejected' } : u);
    mockStore.saveAppUsers(updated);

    // Sync to profiles
    const profiles = mockStore.getProfiles();
    const updatedProfiles = profiles.map(p => p.id === id ? { ...p, status: 'rejected' as const } : p);
    mockStore.saveProfiles(updatedProfiles);

    return updated.find(u => u.id === id);
  },

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

  getNotifications: (userId?: string): any[] => {
    const notifs = getStored(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    if (userId) {
      return notifs.filter((n: any) => n.user_id === userId);
    }
    return notifs;
  },

  addNotification: (notif: any): any => {
    const notifs = getStored<any[]>(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    const updated = [notif, ...notifs];
    setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
    return notif;
  },

  markNotificationAsRead: (id: string) => {
    const notifs = getStored<any[]>(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    const updated = notifs.map(n => n.id === id ? { ...n, is_read: true } : n);
    setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
  },

  markAllNotificationsAsRead: (userId?: string) => {
    const notifs = getStored<any[]>(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    const updated = notifs.map(n => (!userId || n.user_id === userId) ? { ...n, is_read: true } : n);
    setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
  },

  // Access Requests
  getAccessRequests: (): any[] => {
    const reqs = getStored(STORAGE_KEYS.ACCESS_REQUESTS, MOCK_ACCESS_REQUESTS);
    const warehouses = mockStore.getWarehouses();
    const profiles = mockStore.getProfiles();
    return reqs.map(r => ({
      ...r,
      warehouses: warehouses.find(w => w.id === r.warehouse_id) || r.warehouses,
      reviewer: profiles.find(p => p.id === r.reviewed_by) || r.reviewer,
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  saveAccessRequests: (data: any[]) => setStored(STORAGE_KEYS.ACCESS_REQUESTS, data),
  addAccessRequest: (req: any): any => {
    const reqs = getStored<any[]>(STORAGE_KEYS.ACCESS_REQUESTS, MOCK_ACCESS_REQUESTS);
    const newReq = {
      ...req,
      id: req.id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    reqs.unshift(newReq);
    setStored(STORAGE_KEYS.ACCESS_REQUESTS, reqs);
    return newReq;
  },
  updateAccessRequest: (id: string, updates: any) => {
    const reqs = getStored<any[]>(STORAGE_KEYS.ACCESS_REQUESTS, MOCK_ACCESS_REQUESTS);
    const updated = reqs.map(r => r.id === id ? { ...r, ...updates } : r);
    setStored(STORAGE_KEYS.ACCESS_REQUESTS, updated);
  },

  // Viewer Warehouse Access
  getViewerWarehouseAccess: (userId?: string): any[] => {
    const accessList = getStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, MOCK_VIEWER_WAREHOUSE_ACCESS);
    const warehouses = mockStore.getWarehouses();
    const profiles = mockStore.getProfiles();
    const enriched = accessList.map(a => ({
      ...a,
      warehouses: warehouses.find(w => w.id === a.warehouse_id) || a.warehouses,
      profiles: profiles.find(p => p.id === a.user_id) || a.profiles,
      approver: profiles.find(p => p.id === a.approved_by) || a.approver,
    }));
    if (userId) {
      return enriched.filter(a => a.user_id === userId);
    }
    return enriched;
  },
  saveViewerWarehouseAccess: (data: any[]) => setStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, data),
  grantViewerWarehouseAccess: (entry: any) => {
    const accessList = getStored<any[]>(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, MOCK_VIEWER_WAREHOUSE_ACCESS);
    const existingIndex = accessList.findIndex(a => a.user_id === entry.user_id && a.warehouse_id === entry.warehouse_id);
    const newEntry = {
      ...entry,
      id: entry.id || `vwa-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      approved_at: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      accessList[existingIndex] = { ...accessList[existingIndex], ...newEntry };
    } else {
      accessList.unshift(newEntry);
    }
    setStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, accessList);
    return newEntry;
  },
  deleteViewerWarehouseAccess: (id: string) => {
    const accessList = getStored<any[]>(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, MOCK_VIEWER_WAREHOUSE_ACCESS);
    setStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, accessList.filter(a => a.id !== id));
  },
  extendViewerWarehouseAccess: (id: string, newExpiresAt: string | null) => {
    const accessList = getStored<any[]>(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, MOCK_VIEWER_WAREHOUSE_ACCESS);
    const updated = accessList.map(a => a.id === id ? { ...a, expires_at: newExpiresAt } : a);
    setStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, updated);
  },

  // Access Logs
  getAccessLogs: (filters?: any): any[] => {
    let logs = getStored(STORAGE_KEYS.ACCESS_LOGS, MOCK_ACCESS_LOGS);
    const profiles = mockStore.getProfiles();
    logs = logs.map(l => ({
      ...l,
      profiles: profiles.find(p => p.id === l.user_id) || l.profiles,
    }));
    if (filters?.userId) {
      logs = logs.filter(l => l.user_id === filters.userId);
    }
    if (filters?.action) {
      logs = logs.filter(l => l.action === filters.action);
    }
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  saveAccessLogs: (data: any[]) => setStored(STORAGE_KEYS.ACCESS_LOGS, data),
  addAccessLog: (log: any) => {
    const logs = getStored<any[]>(STORAGE_KEYS.ACCESS_LOGS, MOCK_ACCESS_LOGS);
    const profiles = mockStore.getProfiles();
    const prof = profiles.find(p => p.id === log.user_id);
    const newLog = {
      ...log,
      id: log.id || `alog-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
      profiles: prof ? { full_name: prof.full_name, email: prof.email } : null,
    };
    logs.unshift(newLog);
    setStored(STORAGE_KEYS.ACCESS_LOGS, logs);
    return newLog;
  },

  // ==============================================================================
  // REPORT SNAPSHOTS & RLS LOCK METHODS
  // ==============================================================================
  getReportSnapshots: (): ReportSnapshot[] => {
    return getStored(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
  },

  saveReportSnapshots: (data: ReportSnapshot[]) => setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, data),

  addReportSnapshot: (data: Omit<ReportSnapshot, 'id' | 'created_at' | 'updated_at'>): ReportSnapshot => {
    const list = getStored<ReportSnapshot[]>(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    const now = new Date().toISOString();
    const newSnapshot: ReportSnapshot = {
      ...data,
      id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: now,
      updated_at: now,
    };
    list.unshift(newSnapshot);
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, list);
    return newSnapshot;
  },

  reopenReportingPeriod: (
    snapshotId: string,
    reason: string,
    userId?: string,
    userName?: string
  ): { success: boolean; message: string; snapshot: ReportSnapshot } => {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Vui lòng cung cấp lý do mở khóa kỳ báo cáo hợp lệ và rõ ràng (tối thiểu 5 ký tự)');
    }
    const list = getStored<ReportSnapshot[]>(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    const index = list.findIndex(s => s.id === snapshotId);
    if (index === -1) {
      throw new Error(`Không tìm thấy kỳ báo cáo với ID: ${snapshotId}`);
    }
    const snapshot = list[index];
    if (snapshot.period_status !== 'locked') {
      throw new Error(`Kỳ báo cáo "${snapshot.report_period}" hiện đang ở trạng thái "${snapshot.period_status}", không cần mở khóa`);
    }

    const now = new Date().toISOString();
    const updated: ReportSnapshot = {
      ...snapshot,
      period_status: 'open',
      reopened_at: now,
      reopened_by: userId || null,
      reopened_by_name: userName || 'Quản trị viên',
      reopen_reason: reason.trim(),
      updated_at: now,
    };
    list[index] = updated;
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, list);

    // GHI BẮT BUỘC VÀO AUDIT_LOGS
    mockStore.addAuditLog({
      record_id: snapshotId,
      action: 'REOPEN_REPORT_PERIOD',
      old_data: {
        report_code: snapshot.report_code,
        report_period: snapshot.report_period,
        period_status: 'locked',
        locked_at: snapshot.locked_at,
        locked_by_name: snapshot.locked_by_name,
      },
      new_data: {
        report_code: updated.report_code,
        report_period: updated.report_period,
        period_status: 'open',
        reopened_at: now,
        reopened_by: userId,
        reopened_by_name: userName || 'Quản trị viên',
        reopen_reason: reason.trim(),
      },
      changed_by: userId || null,
      changed_by_name: userName || 'Quản trị viên',
      notes: `Mở khóa kỳ báo cáo [${snapshot.report_code} - ${snapshot.report_period}]. Lý do: ${reason.trim()}`,
    });

    return {
      success: true,
      message: 'Đã mở khóa kỳ báo cáo thành công. Trạng thái đã chuyển sang OPEN.',
      snapshot: updated,
    };
  },

  lockReportingPeriod: (
    snapshotId: string,
    notes?: string,
    userId?: string,
    userName?: string
  ): { success: boolean; message: string } => {
    const list = getStored<ReportSnapshot[]>(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    const index = list.findIndex(s => s.id === snapshotId);
    if (index === -1) {
      throw new Error(`Không tìm thấy kỳ báo cáo với ID: ${snapshotId}`);
    }
    const snapshot = list[index];
    if (snapshot.period_status === 'locked') {
      throw new Error('Kỳ báo cáo này đã ở trạng thái khóa (locked) trước đó');
    }

    const now = new Date().toISOString();
    const updated: ReportSnapshot = {
      ...snapshot,
      period_status: 'locked',
      locked_at: now,
      locked_by: userId || null,
      locked_by_name: userName || 'Quản trị viên',
      notes: notes || snapshot.notes,
      updated_at: now,
    };
    list[index] = updated;
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, list);

    mockStore.addAuditLog({
      record_id: snapshotId,
      action: 'LOCK_REPORT_PERIOD',
      old_data: { period_status: snapshot.period_status },
      new_data: { period_status: 'locked', locked_at: now, locked_by_name: userName || 'Quản trị viên' },
      changed_by: userId || null,
      changed_by_name: userName || 'Quản trị viên',
      notes: `Chốt và khóa kỳ báo cáo [${snapshot.report_code} - ${snapshot.report_period}]. Dữ liệu đã được niêm phong tĩnh an toàn.`,
    });

    return {
      success: true,
      message: 'Đã chốt và khóa kỳ báo cáo thành công. Dữ liệu đã được niêm phong tĩnh.',
    };
  },

  updateReportSnapshot: (snapshotId: string, updates: Partial<ReportSnapshot>): ReportSnapshot => {
    const list = getStored<ReportSnapshot[]>(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    const index = list.findIndex(s => s.id === snapshotId);
    if (index === -1) throw new Error('Không tìm thấy kỳ báo cáo');
    const current = list[index];

    // RLS POLICY CHECK:
    if (current.period_status === 'locked') {
      throw new Error('LỖI BẢO MẬT (RLS POLICY): Báo cáo kỳ này đã bị KHÓA (period_status = locked). Cấm mọi thao tác UPDATE trực tiếp (kể cả quyền Admin)! Hãy thông qua hàm reopen_reporting_period() có kèm lý do.');
    }

    const updated: ReportSnapshot = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    list[index] = updated;
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, list);
    return updated;
  },

  deleteReportSnapshot: (snapshotId: string): boolean => {
    const list = getStored<ReportSnapshot[]>(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    const target = list.find(s => s.id === snapshotId);
    if (!target) return false;

    // RLS POLICY CHECK:
    if (target.period_status === 'locked') {
      throw new Error('LỖI BẢO MẬT (RLS POLICY): Báo cáo kỳ này đã bị KHÓA (period_status = locked). Cấm mọi thao tác DELETE (kể cả quyền Admin)!');
    }

    const updated = list.filter(s => s.id !== snapshotId);
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, updated);
    return true;
  },

  // ==========================================
  // INVENTORY AUDITS (KIỂM KÊ KHO)
  // ==========================================
  getInventoryAudits: (warehouseId?: string): InventoryAudit[] => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const warehouses = mockStore.getWarehouses();
    const profiles = mockStore.getProfiles();

    let filtered = audits;
    if (warehouseId && warehouseId !== 'all') {
      filtered = filtered.filter(a => a.warehouse_id === warehouseId);
    }

    return filtered.map(a => {
      const wh = warehouses.find(w => w.id === a.warehouse_id);
      const perf = profiles.find(p => p.id === a.performed_by);
      return {
        ...a,
        warehouses: wh ? { name: wh.name, code: wh.code, is_central: wh.is_central, region_code: wh.region_code } : undefined,
        warehouse: wh,
        performer: perf ? { full_name: perf.full_name, email: perf.email } : undefined,
        profiles: perf ? { full_name: perf.full_name, email: perf.email } : undefined,
      };
    }).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  },

  getInventoryAudit: (auditId: string): InventoryAudit | null => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const audit = audits.find(a => a.id === auditId);
    if (!audit) return null;

    const warehouses = mockStore.getWarehouses();
    const profiles = mockStore.getProfiles();
    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    const allAssets = mockStore.getAssets();

    const wh = warehouses.find(w => w.id === audit.warehouse_id);
    const perf = profiles.find(p => p.id === audit.performed_by);
    const items = allItems.filter(i => i.audit_id === auditId).map(i => {
      const asset = allAssets.find(a => a.id === i.asset_id);
      return {
        ...i,
        asset,
      };
    });

    return {
      ...audit,
      warehouses: wh ? { name: wh.name, code: wh.code, is_central: wh.is_central, region_code: wh.region_code } : undefined,
      warehouse: wh,
      performer: perf ? { full_name: perf.full_name, email: perf.email } : undefined,
      profiles: perf ? { full_name: perf.full_name, email: perf.email } : undefined,
      items,
    };
  },

  createInventoryAudit: (warehouseId: string, performedBy: string, notes?: string): InventoryAudit => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    const allAssets = mockStore.getAssets();

    // Lọc toàn bộ assets có custody_status = 'in_stock' tại kho này
    const warehouseAssets = allAssets.filter(
      a => a.warehouse_id === warehouseId && a.custody_status === 'in_stock'
    );

    const auditId = `aud-${Date.now()}`;
    const newItems: InventoryAuditItem[] = warehouseAssets.map((asset, idx) => {
      return {
        id: `audi-${Date.now()}-${idx}`,
        audit_id: auditId,
        asset_id: asset.id,
        expected_status: 'in_stock',
        expected_location: asset.subdivision ? `${asset.subdivision} - Lô ${asset.lot_no || ''}` : `Vị trí kho tiêu chuẩn`,
        actual_found: false,
        actual_location: null,
        finding_status: 'pending',
        note: null,
        audited_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const newAudit: InventoryAudit = {
      id: auditId,
      warehouse_id: warehouseId,
      performed_by: performedBy,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'in_progress',
      notes: notes || '',
      total_expected: newItems.length,
      total_found: 0,
      total_missing: 0,
      total_misplaced: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setStored(STORAGE_KEYS.INVENTORY_AUDITS, [newAudit, ...audits]);
    setStored(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, [...allItems, ...newItems]);

    return {
      ...newAudit,
      items: newItems.map(i => ({
        ...i,
        asset: allAssets.find(a => a.id === i.asset_id),
      })),
    };
  },

  updateInventoryAuditItem: (itemId: string, data: Partial<InventoryAuditItem>): InventoryAuditItem | null => {
    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    const idx = allItems.findIndex(i => i.id === itemId);
    if (idx === -1) return null;

    const current = allItems[idx];
    const updated: InventoryAuditItem = {
      ...current,
      ...data,
      audited_at: data.finding_status && data.finding_status !== 'pending' ? new Date().toISOString() : current.audited_at,
      updated_at: new Date().toISOString(),
    };
    allItems[idx] = updated;
    setStored(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, allItems);

    // Tự động tính toán lại số liệu của audit cha
    mockStore.recalculateAuditStats(updated.audit_id);
    return updated;
  },

  batchUpdateAuditItems: (auditId: string, items: Array<{ id: string; finding_status: any; actual_found: boolean; actual_location?: string | null; note?: string | null }>): void => {
    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    const itemMap = new Map(items.map(it => [it.id, it]));

    const updatedList = allItems.map(item => {
      if (item.audit_id === auditId && itemMap.has(item.id)) {
        const patch = itemMap.get(item.id)!;
        return {
          ...item,
          ...patch,
          audited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      return item;
    });

    setStored(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, updatedList);
    mockStore.recalculateAuditStats(auditId);
  },

  recalculateAuditStats: (auditId: string): void => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const auditIdx = audits.findIndex(a => a.id === auditId);
    if (auditIdx === -1) return;

    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    const auditItems = allItems.filter(i => i.audit_id === auditId);

    const total_expected = auditItems.length;
    const total_found = auditItems.filter(i => i.actual_found).length;
    const total_missing = auditItems.filter(i => i.finding_status === 'missing').length;
    const total_misplaced = auditItems.filter(i => i.finding_status === 'misplaced').length;

    audits[auditIdx] = {
      ...audits[auditIdx],
      total_expected,
      total_found,
      total_missing,
      total_misplaced,
      updated_at: new Date().toISOString(),
    };
    setStored(STORAGE_KEYS.INVENTORY_AUDITS, audits);
  },

  completeInventoryAudit: (auditId: string, notes?: string): InventoryAudit | null => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const auditIdx = audits.findIndex(a => a.id === auditId);
    if (auditIdx === -1) return null;

    mockStore.recalculateAuditStats(auditId);
    const updatedAudits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const target = updatedAudits[auditIdx];

    const completed: InventoryAudit = {
      ...target,
      status: 'completed',
      completed_at: new Date().toISOString(),
      notes: notes !== undefined ? notes : target.notes,
      updated_at: new Date().toISOString(),
    };

    updatedAudits[auditIdx] = completed;
    setStored(STORAGE_KEYS.INVENTORY_AUDITS, updatedAudits);
    return completed;
  },

  deleteInventoryAudit: (auditId: string): boolean => {
    const audits = getStored<InventoryAudit[]>(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    const allItems = getStored<InventoryAuditItem[]>(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);

    setStored(STORAGE_KEYS.INVENTORY_AUDITS, audits.filter(a => a.id !== auditId));
    setStored(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, allItems.filter(i => i.audit_id !== auditId));
    return true;
  },

  resetToStandardData: () => {
    if (typeof window !== 'undefined') {
      (window as any)._mockStoreCache = {};
    }
    setStored(STORAGE_KEYS.REGIONS, MOCK_REGIONS);
    setStored(STORAGE_KEYS.AREAS, MOCK_AREAS);
    setStored(STORAGE_KEYS.WAREHOUSES, MOCK_WAREHOUSES);
    setStored(STORAGE_KEYS.PROJECTS, MOCK_PROJECTS);
    setStored(STORAGE_KEYS.ASSETS, MOCK_ASSETS);
    setStored(STORAGE_KEYS.TRANSACTIONS, MOCK_TRANSACTIONS);
    setStored(STORAGE_KEYS.LOGS, MOCK_ACTIVITY_LOGS);
    setStored(STORAGE_KEYS.PROFILES, MOCK_PROFILES);
    setStored(STORAGE_KEYS.AUDIT_LOGS, MOCK_AUDIT_LOGS);
    setStored(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    setStored(STORAGE_KEYS.ACCESS_REQUESTS, MOCK_ACCESS_REQUESTS);
    setStored(STORAGE_KEYS.VIEWER_WAREHOUSE_ACCESS, MOCK_VIEWER_WAREHOUSE_ACCESS);
    setStored(STORAGE_KEYS.ACCESS_LOGS, MOCK_ACCESS_LOGS);
    setStored(STORAGE_KEYS.REPORT_SNAPSHOTS, MOCK_REPORT_SNAPSHOTS);
    setStored(STORAGE_KEYS.INVENTORY_AUDITS, MOCK_INVENTORY_AUDITS);
    setStored(STORAGE_KEYS.INVENTORY_AUDIT_ITEMS, MOCK_INVENTORY_AUDIT_ITEMS);
    setStored(STORAGE_KEYS.INVESTOR_ENTITIES, MOCK_INVESTOR_ENTITIES);
    setStored(STORAGE_KEYS.ASSET_OWNERSHIP_TRANSFERS, MOCK_ASSET_OWNERSHIP_TRANSFERS);
  },

  resetDemoData: () => {
    mockStore.resetToStandardData();
  },
};
