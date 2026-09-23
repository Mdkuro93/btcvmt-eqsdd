import * as XLSX from 'xlsx';
import { Asset } from '../types';
import { format } from 'date-fns';

export interface ExcelAssetRow {
  'ID Hệ Thống'?: string;
  'Mã Tài Sản / TSĐB'?: string;
  'Dự Án (Pháp lý)'?: string;
  'Tên Dự Án Kinh Doanh'?: string;
  'Loại Tài Sản'?: string;
  'Nhóm Sổ'?: string;
  'Mã lô đất (Mã Lô Pháp Lý)'?: string;
  'Mã Lô Kinh Doanh'?: string;
  'Diện Tích (m²)'?: number | string;
  'Chủ Sở Hữu'?: string;
  'Số Thửa Bản Đồ'?: string;
  'Số Tờ Bản Đồ'?: string;
  'Số GCN QSDĐ': string;
  'Số vào sổ cấp'?: string;
  'Ngày vào sổ'?: string;
  'Mục Đích Sử Dụng'?: string;
  'Thời Hạn Sử Dụng'?: string;
  'Trạng Thái Thế Chấp'?: string;
  'Ngân Hàng Thế Chấp'?: string;
  'Đơn vị vay'?: string;
  'Giá trị định giá'?: number | string;
  'Tỷ lệ đảm bảo'?: number | string;
  'Giá trị TSĐB'?: number | string;
  'Trạng Thái Pháp Lý'?: string;
  'Trạng Thái Kinh Doanh'?: string;
  'Trạng Thái Lưu Kho'?: string;
  'Đơn vị quản lý sổ'?: string;
  'Ghi chú'?: string;
}

export function exportAssetsToExcel(assets: Asset[], fileName = 'Danh_sach_GCN_QSDD_VMT') {
  // Row 1: 4 Groups header
  const groupRow = [
    'THÔNG TIN CHUNG', '', '', '', '', '', '', '', '',
    'THÔNG TIN PHÁP LÝ', '', '', '', '', '', '', '',
    'THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG', '', '', '', '', '',
    'TRẠNG THÁI TSĐB', '', '', '', ''
  ];

  // Row 2: 28 Column headers
  const headerRow = [
    'ID Hệ Thống',
    'Mã Tài Sản / TSĐB',
    'Dự Án (Pháp lý)',
    'Tên Dự Án Kinh Doanh',
    'Loại Tài Sản',
    'Nhóm Sổ',
    'Mã lô đất (Mã Lô Pháp Lý)',
    'Mã Lô Kinh Doanh',
    'Diện Tích (m²)',
    'Chủ Sở Hữu',
    'Số Thửa Bản Đồ',
    'Số Tờ Bản Đồ',
    'Số GCN QSDĐ',
    'Số vào sổ cấp',
    'Ngày vào sổ',
    'Mục Đích Sử Dụng',
    'Thời Hạn Sử Dụng',
    'Trạng Thái Thế Chấp',
    'Ngân Hàng Thế Chấp',
    'Đơn vị vay',
    'Giá trị định giá',
    'Tỷ lệ đảm bảo',
    'Giá trị TSĐB',
    'Trạng Thái Pháp Lý',
    'Trạng Thái Kinh Doanh',
    'Trạng Thái Lưu Kho',
    'Đơn vị quản lý sổ',
    'Ghi chú'
  ];

  const dataRows = assets.map((a) => {
    let lifecycleText = 'Đang hiệu lực';
    if (a.lifecycle_status === 'split') lifecycleText = 'Đã tách thửa';
    if (a.lifecycle_status === 'invalidated') lifecycleText = 'Vô hiệu';

    let custodyText = 'Trong kho BTC';
    if (a.custody_status === 'checked_out') custodyText = 'Đang mượn / Xuất kho';

    let saleText = 'Chưa sẵn sàng';
    if (a.sale_status === 'ready_for_sale') saleText = 'Sẵn sàng bán';
    if (a.sale_status === 'sold') saleText = 'Đã bán';

    let mortgageText = 'Không thế chấp';
    if (a.mortgage_status === 'mortgaged') mortgageText = 'Đang thế chấp';

    const maLoPhapLy = a.legal_lot_code || '';

    const bankStr = a.mortgage_bank || '';
    const unitStr = a.mortgage_unit || '';

    const dateRegistry = a.registry_date ? format(new Date(a.registry_date), 'dd/MM/yyyy') : '';
    const dateUsageTerm = a.usage_term_type === 'long_term' 
      ? 'Lâu dài' 
      : (a.usage_term_date ? format(new Date(a.usage_term_date), 'dd/MM/yyyy') : '');

    return [
      a.id || '',
      a.asset_code || `VMT_${a.collateral_type || 'BDS'}_${a.id}`,
      a.projects?.name || '',
      a.business_project_name || '',
      a.asset_type || 'Đất nền',
      a.parent_asset_id ? 'Sổ con' : (a.certificate_group === 'so_lon' ? 'Sổ lớn' : 'Sổ nhỏ'),
      maLoPhapLy,
      a.business_plot_code || '',
      a.area || 0,
      a.current_owner_entity?.name || a.investor_entities?.name || '-',
      a.land_lot_no || '',
      a.map_sheet_no || '',
      a.certificate_no || '',
      a.registry_no || '',
      dateRegistry,
      a.usage_purpose || '',
      dateUsageTerm,
      mortgageText,
      bankStr,
      unitStr,
      a.mortgage_valuation || '',
      a.collateral_ratio ? `${a.collateral_ratio}%` : '',
      a.collateral_value || '',
      lifecycleText,
      saleText,
      custodyText,
      a.managing_unit || a.warehouses?.name || '',
      a.notes || ''
    ];
  });

  const wsData = [groupRow, headerRow, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Merge headers on row 0 (0-indexed)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },   // THÔNG TIN CHUNG: cols 0-8 (9 cols)
    { s: { r: 0, c: 9 }, e: { r: 0, c: 16 } },  // THÔNG TIN PHÁP LÝ: cols 9-16 (8 cols)
    { s: { r: 0, c: 17 }, e: { r: 0, c: 22 } }, // THÔNG TIN TÀI SẢN CẦM CỐ...: cols 17-22 (6 cols)
    { s: { r: 0, c: 23 }, e: { r: 0, c: 27 } }, // TRẠNG THÁI TSĐB: cols 23-27 (5 cols)
  ];

  // Set column widths for 28 columns
  worksheet['!cols'] = [
    { wch: 18 }, // ID Hệ Thống
    { wch: 22 }, // Mã TSĐB
    { wch: 26 }, // Dự Án Pháp Lý
    { wch: 24 }, // Tên DA KD
    { wch: 16 }, // Loại TS
    { wch: 12 }, // Nhóm Sổ
    { wch: 24 }, // Mã lô đất (Mã Lô Pháp Lý)
    { wch: 18 }, // Mã Lô KD
    { wch: 14 }, // Diện Tích
    { wch: 28 }, // Chủ Sở Hữu
    { wch: 14 }, // Số Thửa
    { wch: 12 }, // Số Tờ
    { wch: 18 }, // Số GCN
    { wch: 16 }, // Số vào sổ
    { wch: 14 }, // Ngày vào sổ
    { wch: 24 }, // Mục Đích
    { wch: 16 }, // Thời Hạn
    { wch: 18 }, // TT Thế Chấp
    { wch: 28 }, // Ngân Hàng
    { wch: 28 }, // Đơn Vị Vay
    { wch: 18 }, // Định Giá
    { wch: 14 }, // Tỷ Lệ ĐB
    { wch: 18 }, // Giá Trị TSĐB
    { wch: 18 }, // TT Pháp Lý
    { wch: 18 }, // TT Kinh Doanh
    { wch: 18 }, // TT Lưu Kho
    { wch: 22 }, // Đơn vị QL Sổ
    { wch: 24 }, // Ghi Chú
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách GCN');

  const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
  XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
}

export function downloadExcelTemplate() {
  const groupRow = [
    'THÔNG TIN CHUNG', '', '', '', '', '', '', '', '',
    'THÔNG TIN PHÁP LÝ', '', '', '', '', '', '', '',
    'THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG', '', '', '', '', '',
    'TRẠNG THÁI TSĐB', '', '', '', ''
  ];

  const headerRow = [
    'ID Hệ Thống',
    'Mã Tài Sản / TSĐB',
    'Dự Án (Pháp lý)',
    'Tên Dự Án Kinh Doanh',
    'Loại Tài Sản',
    'Nhóm Sổ',
    'Mã lô đất (Mã Lô Pháp Lý)',
    'Mã Lô Kinh Doanh',
    'Diện Tích (m²)',
    'Chủ Sở Hữu',
    'Số Thửa Bản Đồ',
    'Số Tờ Bản Đồ',
    'Số GCN QSDĐ',
    'Số vào sổ cấp',
    'Ngày vào sổ',
    'Mục Đích Sử Dụng',
    'Thời Hạn Sử Dụng',
    'Trạng Thái Thế Chấp',
    'Ngân Hàng Thế Chấp',
    'Đơn vị vay',
    'Giá trị định giá',
    'Tỷ lệ đảm bảo',
    'Giá trị TSĐB',
    'Trạng Thái Pháp Lý',
    'Trạng Thái Kinh Doanh',
    'Trạng Thái Lưu Kho',
    'Đơn vị quản lý sổ',
    'Ghi chú'
  ];

  const sampleRows = [
    [
      'asset-01 (Bỏ trống nếu tạo mới)',
      'VMT_DN_BDS_00000001',
      'Dự án Khu Đô Thị VMT Central',
      'Khu Đô Thị Central Palm',
      'Biệt thự',
      'Sổ nhỏ',
      'Phân khu A',
      'PALM-A01',
      450.5,
      'Công ty Cổ phần Đầu tư VMT',
      '112',
      '04',
      'GCN-VMT-001 (Bắt buộc)',
      '',
      '',
      'Đất ở tại đô thị (ODT)',
      'Lâu dài',
      'Không thế chấp',
      '',
      '',
      '',
      '',
      '',
      'Đang hiệu lực',
      'Sẵn sàng bán',
      'Trong kho BTC',
      '',
      ''
    ],
    [
      '',
      'VMT_BD_BDS_00000002',
      'Dự án Khu Dân Cư VMT Riverside',
      'Spana Riverside',
      'Shophouse',
      'Sổ nhỏ',
      'Khu B - B-15',
      'SP-SH-02',
      120.0,
      'Công ty TNHH MTV BĐS VMT',
      '205',
      '08',
      'GCN-VMT-002 (Bắt buộc)',
      'CH-00129',
      '15/05/2023',
      'Đất ở tại đô thị (ODT)',
      'Lâu dài',
      'Đang thế chấp',
      'BIDV Chi nhánh TP.HCM; Vietcombank',
      'Công ty Cổ phần Đầu tư VMT; Công ty BĐS Nam Hải',
      45000000000,
      '70%',
      31500000000,
      'Đang hiệu lực',
      'Chưa sẵn sàng',
      'Trong kho BTC',
      'Ban QLDA Miền Trung',
      'Thế chấp đồng thời 2 ngân hàng BIDV và VCB'
    ]
  ];

  const wsData = [groupRow, headerRow, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 0, c: 9 }, e: { r: 0, c: 16 } },
    { s: { r: 0, c: 17 }, e: { r: 0, c: 22 } },
    { s: { r: 0, c: 23 }, e: { r: 0, c: 27 } },
  ];

  worksheet['!cols'] = [
    { wch: 22 }, // ID Hệ Thống
    { wch: 22 }, // Mã TSĐB
    { wch: 28 }, // Dự Án Pháp Lý
    { wch: 24 }, // Tên DA KD
    { wch: 16 }, // Loại TS
    { wch: 12 }, // Nhóm Sổ
    { wch: 24 }, // Mã lô đất (Mã Lô Pháp Lý)
    { wch: 18 }, // Mã Lô KD
    { wch: 14 }, // Diện Tích
    { wch: 28 }, // Chủ Sở Hữu
    { wch: 14 }, // Số Thửa
    { wch: 12 }, // Số Tờ
    { wch: 22 }, // Số GCN
    { wch: 16 }, // Số vào sổ
    { wch: 14 }, // Ngày vào sổ
    { wch: 24 }, // Mục Đích
    { wch: 16 }, // Thời Hạn
    { wch: 18 }, // TT Thế Chấp
    { wch: 32 }, // Ngân Hàng
    { wch: 36 }, // Đơn Vị Vay
    { wch: 18 }, // Định Giá
    { wch: 14 }, // Tỷ Lệ ĐB
    { wch: 18 }, // Giá Trị TSĐB
    { wch: 18 }, // TT Pháp Lý
    { wch: 18 }, // TT Kinh Doanh
    { wch: 18 }, // TT Lưu Kho
    { wch: 22 }, // Đơn vị QL Sổ
    { wch: 30 }, // Ghi Chú
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mẫu_Cap_Nhat_GCN');
  XLSX.writeFile(workbook, 'Mau_Nhap_Cap_Nhat_GCN_QSDD_VMT.xlsx');
}

export function exportInventoryAuditToExcel(
  audit: any,
  discrepancyOnly: boolean = false
) {
  const items = audit.items || [];
  const warehouseName = audit.warehouses?.name || audit.warehouse?.name || 'Kho VMT';
  const performerName = audit.performer?.full_name || audit.profiles?.full_name || 'Quản lý kho';
  const startedDateStr = audit.started_at ? format(new Date(audit.started_at), 'dd/MM/yyyy HH:mm') : '-';
  const completedDateStr = audit.completed_at ? format(new Date(audit.completed_at), 'dd/MM/yyyy HH:mm') : 'Chưa hoàn tất';

  // 1. Data for Discrepancy Sheet (Chênh lệch: Thiếu hoặc Sai vị trí)
  const discrepancyItems = items.filter(
    (i: any) => i.finding_status === 'missing' || i.finding_status === 'misplaced'
  );

  const discrepancyRows = discrepancyItems.map((i: any, index: number) => {
    const a = i.asset || {};
    let statusText = 'Khớp';
    if (i.finding_status === 'missing') statusText = '❌ KHÔNG TÌM THẤY (THIẾU)';
    if (i.finding_status === 'misplaced') statusText = '⚠️ SAI VỊ TRÍ';

    return {
      'STT': index + 1,
      'Số GCN QSDĐ': a.certificate_no || 'Chưa rõ',
      'Mã Tài Sản / TSĐB': a.asset_code || '-',
      'Tên Dự Án': a.business_project_name || a.projects?.name || '-',
      'Mã Lô Pháp Lý': a.legal_lot_code || '-',
      'Chủ Sở Hữu': a.current_owner_entity?.name || a.investor_entities?.name || '-',
      'Diện Tích (m²)': a.area || 0,
      'Hiện Trạng Kiểm Kê': statusText,
      'Vị Trí Dự Kiến': i.expected_location || '-',
      'Vị Trí Thực Tế': i.actual_location || (i.finding_status === 'missing' ? 'Không xác định' : '-'),
      'Ghi Chú Chi Tiết': i.note || '',
      'Thời Gian Kiểm': i.audited_at ? format(new Date(i.audited_at), 'dd/MM/yyyy HH:mm') : '-',
    };
  });

  // 2. Data for All Items Sheet (Toàn bộ danh sách)
  const allRows = items.map((i: any, index: number) => {
    const a = i.asset || {};
    let statusText = 'Chưa kiểm';
    if (i.finding_status === 'matched') statusText = '✅ Đã tìm thấy - Đúng vị trí';
    if (i.finding_status === 'misplaced') statusText = '⚠️ Tìm thấy - Sai vị trí';
    if (i.finding_status === 'missing') statusText = '❌ Không tìm thấy';

    return {
      'STT': index + 1,
      'Số GCN QSDĐ': a.certificate_no || 'Chưa rõ',
      'Mã Tài Sản / TSĐB': a.asset_code || '-',
      'Tên Dự Án': a.business_project_name || a.projects?.name || '-',
      'Mã Lô Pháp Lý': a.legal_lot_code || '-',
      'Chủ Sở Hữu': a.current_owner_entity?.name || a.investor_entities?.name || '-',
      'Diện Tích (m²)': a.area || 0,
      'Kết Quả Kiểm Kê': statusText,
      'Tìm Thấy Thực Tế': i.actual_found ? 'Có' : 'Không',
      'Vị Trí Dự Kiến': i.expected_location || '-',
      'Vị Trí Thực Tế': i.actual_location || '-',
      'Ghi Chú': i.note || '',
      'Thời Gian Kiểm': i.audited_at ? format(new Date(i.audited_at), 'dd/MM/yyyy HH:mm') : '-',
    };
  });

  const workbook = XLSX.utils.book_new();

  // Summary header table
  const summaryData = [
    { 'Chỉ tiêu': 'Đợt kiểm kê', 'Giá trị': audit.id },
    { 'Chỉ tiêu': 'Kho kiểm kê', 'Giá trị': warehouseName },
    { 'Chỉ tiêu': 'Người thực hiện', 'Giá trị': performerName },
    { 'Chỉ tiêu': 'Thời gian bắt đầu', 'Giá trị': startedDateStr },
    { 'Chỉ tiêu': 'Thời gian hoàn tất', 'Giá trị': completedDateStr },
    { 'Chỉ tiêu': 'Trạng thái đợt kiểm', 'Giá trị': audit.status === 'completed' ? 'Đã hoàn tất' : 'Đang thực hiện' },
    { 'Chỉ tiêu': 'Tổng số GCN dự kiến', 'Giá trị': audit.total_expected || items.length },
    { 'Chỉ tiêu': 'Số GCN tìm thấy', 'Giá trị': audit.total_found || 0 },
    { 'Chỉ tiêu': 'Số GCN khuyết thiếu', 'Giá trị': audit.total_missing || 0 },
    { 'Chỉ tiêu': 'Số GCN sai vị trí', 'Giá trị': audit.total_misplaced || 0 },
    { 'Chỉ tiêu': 'Tỷ lệ khớp đúng vị trí', 'Giá trị': `${audit.total_expected > 0 ? Math.round(((audit.total_found - audit.total_misplaced) / audit.total_expected) * 100) : 0}%` },
    { 'Chỉ tiêu': 'Ghi chú tổng kết', 'Giá trị': audit.notes || '-' },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tổng_Quan_Dot_Kiem_Ke');

  if (discrepancyRows.length > 0 || discrepancyOnly) {
    const discrepancySheet = XLSX.utils.json_to_sheet(discrepancyRows.length > 0 ? discrepancyRows : [{ 'Thông báo': 'Không có chênh lệch nào trong đợt kiểm kê này.' }]);
    XLSX.utils.book_append_sheet(workbook, discrepancySheet, 'Danh_Sach_Chenh_Lech');
  }

  if (!discrepancyOnly) {
    const allSheet = XLSX.utils.json_to_sheet(allRows);
    XLSX.utils.book_append_sheet(workbook, allSheet, 'Toan_Bo_Ket_Qua');
  }

  const cleanWarehouseName = warehouseName.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
  const fileName = discrepancyOnly 
    ? `Bao_Cao_Chenh_Lech_Kiem_Ke_${cleanWarehouseName}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`
    : `Bien_Ban_Kiem_Ke_Kho_${cleanWarehouseName}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}