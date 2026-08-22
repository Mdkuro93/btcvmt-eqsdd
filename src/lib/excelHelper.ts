import * as XLSX from 'xlsx';
import { Asset } from '../types';
import { format } from 'date-fns';

export interface ExcelAssetRow {
  'ID Hệ Thống'?: string;
  'Mã Tài Sản / TSĐB'?: string;
  'Số GCN QSDĐ': string;
  'Nhóm Sổ'?: string;
  'Dự Án (Pháp lý)'?: string;
  'Tên Dự Án Kinh Doanh'?: string;
  'Phân Khu'?: string;
  'Số Lô / Thửa (Mã Lô Pháp Lý)'?: string;
  'Số Thửa Bản Đồ'?: string;
  'Số Tờ Bản Đồ'?: string;
  'Mã Lô Kinh Doanh'?: string;
  'Diện Tích (m²)'?: number | string;
  'Chủ Sở Hữu'?: string;
  'Loại Tài Sản'?: string;
  'Mục Đích Sử Dụng'?: string;
  'Thời Hạn Sử Dụng'?: string;
  'Trạng Thái Pháp Lý'?: string;
  'Trạng Thái Lưu Kho'?: string;
  'Trạng Thái Kinh Doanh'?: string;
  'Trạng Thái Thế Chấp'?: string;
  'Ngân Hàng Thế Chấp'?: string;
  'Kho Lưu Giữ'?: string;
  'Người Cập Nhật Cuối'?: string;
  'Thời Gian Cập Nhật Cuối'?: string;
}

export function exportAssetsToExcel(assets: Asset[], fileName = 'Danh_sach_GCN_QSDD_VMT') {
  const data: ExcelAssetRow[] = assets.map((a) => {
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

    return {
      'ID Hệ Thống': a.id,
      'Mã Tài Sản / TSĐB': a.asset_code || `VMT_${a.collateral_type || 'BDS'}_${a.id}`,
      'Số GCN QSDĐ': a.certificate_no,
      'Nhóm Sổ': a.certificate_group === 'so_lon' ? 'Sổ lớn' : 'Sổ nhỏ',
      'Dự Án (Pháp lý)': a.projects?.name || '',
      'Tên Dự Án Kinh Doanh': a.business_project_name || '',
      'Phân Khu': a.subdivision || '',
      'Số Lô / Thửa (Mã Lô Pháp Lý)': a.lot_no || '',
      'Số Thửa Bản Đồ': a.land_lot_no || '',
      'Số Tờ Bản Đồ': a.map_sheet_no || '',
      'Mã Lô Kinh Doanh': a.business_plot_code || '',
      'Diện Tích (m²)': a.area || 0,
      'Chủ Sở Hữu': a.owner_name || 'Công ty Cổ phần Đầu tư VMT',
      'Loại Tài Sản': a.asset_type || 'Đất nền',
      'Mục Đích Sử Dụng': a.land_use_purpose || a.usage_purpose || '',
      'Thời Hạn Sử Dụng': a.land_use_term || a.usage_term || '',
      'Trạng Thái Pháp Lý': lifecycleText,
      'Trạng Thái Lưu Kho': custodyText,
      'Trạng Thái Kinh Doanh': saleText,
      'Trạng Thái Thế Chấp': mortgageText,
      'Ngân Hàng Thế Chấp': a.mortgage_bank || '',
      'Kho Lưu Giữ': a.warehouses?.name || '',
      'Người Cập Nhật Cuối': a.updater?.full_name || a.updater?.email || (a.updated_by ? 'Người dùng hệ thống' : ''),
      'Thời Gian Cập Nhật Cuối': a.updated_at ? format(new Date(a.updated_at), 'dd/MM/yyyy HH:mm') : (a.created_at ? format(new Date(a.created_at), 'dd/MM/yyyy HH:mm') : ''),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set column widths
  const colWidths = [
    { wch: 20 }, // ID
    { wch: 22 }, // Mã TS
    { wch: 18 }, // Số GCN
    { wch: 12 }, // Nhóm sổ
    { wch: 28 }, // Dự án Pháp lý
    { wch: 26 }, // Tên DA Kinh Doanh
    { wch: 16 }, // Phân khu
    { wch: 16 }, // Số Lô Pháp lý
    { wch: 14 }, // Thửa
    { wch: 12 }, // Tờ
    { wch: 18 }, // Mã Lô KD
    { wch: 14 }, // Diện tích
    { wch: 28 }, // Chủ sở hữu
    { wch: 20 }, // Loại TS
    { wch: 22 }, // Mục đích
    { wch: 16 }, // Thời hạn
    { wch: 16 }, // TT Pháp lý
    { wch: 18 }, // TT Lưu kho
    { wch: 16 }, // TT Kinh doanh
    { wch: 16 }, // TT Thế chấp
    { wch: 22 }, // Ngân hàng
    { wch: 24 }, // Kho
    { wch: 24 }, // Người cập nhật
    { wch: 20 }, // TG cập nhật
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách GCN');

  const dateStr = format(new Date(), 'yyyyMMdd_HHmm');
  XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
}

export function downloadExcelTemplate() {
  const sampleData: ExcelAssetRow[] = [
    {
      'ID Hệ Thống': 'asset-01 (Bỏ trống nếu tạo mới)',
      'Mã Tài Sản / TSĐB': 'VMN_BDS_00000001 (Dùng để khớp)',
      'Số GCN QSDĐ': 'GCN-VMT-001 (Bắt buộc)',
      'Nhóm Sổ': 'Sổ nhỏ',
      'Dự Án (Pháp lý)': 'Dự án Khu Đô Thị VMT Central',
      'Tên Dự Án Kinh Doanh': 'Khu Đô Thị Central Palm',
      'Phân Khu': 'Phân khu A',
      'Số Lô / Thửa (Mã Lô Pháp Lý)': 'A-01',
      'Số Thửa Bản Đồ': '112',
      'Số Tờ Bản Đồ': '04',
      'Mã Lô Kinh Doanh': 'PALM-A01',
      'Diện Tích (m²)': 450.5,
      'Chủ Sở Hữu': 'Công ty Cổ phần Đầu tư VMT',
      'Loại Tài Sản': 'Biệt thự',
      'Mục Đích Sử Dụng': 'Đất ở tại đô thị (ODT)',
      'Thời Hạn Sử Dụng': 'Lâu dài',
      'Trạng Thái Pháp Lý': 'Đang hiệu lực',
      'Trạng Thái Lưu Kho': 'Trong kho BTC',
      'Trạng Thái Kinh Doanh': 'Sẵn sàng bán',
      'Trạng Thái Thế Chấp': 'Không thế chấp',
      'Ngân Hàng Thế Chấp': '',
      'Kho Lưu Giữ': 'Kho Trung Tâm BTC',
    },
    {
      'ID Hệ Thống': '',
      'Mã Tài Sản / TSĐB': '',
      'Số GCN QSDĐ': 'GCN-VMT-002',
      'Nhóm Sổ': 'Sổ nhỏ',
      'Dự Án (Pháp lý)': 'Dự án Khu Dân Cư VMT Riverside',
      'Tên Dự Án Kinh Doanh': 'Spana Riverside',
      'Phân Khu': 'Khu B',
      'Số Lô / Thửa (Mã Lô Pháp Lý)': 'B-15',
      'Số Thửa Bản Đồ': '205',
      'Số Tờ Bản Đồ': '08',
      'Mã Lô Kinh Doanh': 'SP-SH-02',
      'Diện Tích (m²)': 120.0,
      'Chủ Sở Hữu': 'Công ty Cổ phần Đầu tư VMT',
      'Loại Tài Sản': 'Shophouse',
      'Mục Đích Sử Dụng': 'Đất ở tại đô thị (ODT)',
      'Thời Hạn Sử Dụng': 'Lâu dài',
      'Trạng Thái Pháp Lý': 'Đang hiệu lực',
      'Trạng Thái Lưu Kho': 'Trong kho BTC',
      'Trạng Thái Kinh Doanh': 'Chưa sẵn sàng',
      'Trạng Thái Thế Chấp': 'Đang thế chấp',
      'Ngân Hàng Thế Chấp': 'BIDV Chi nhánh TP.HCM',
      'Kho Lưu Giữ': 'Kho Dự Án Bình Dương',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mẫu_Cap_Nhat_GCN');
  XLSX.writeFile(workbook, 'Mau_Nhap_Cap_Nhat_GCN_QSDD_VMT.xlsx');
}
