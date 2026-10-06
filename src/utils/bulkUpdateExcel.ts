import * as XLSX from 'xlsx';
import { BulkUpdateMode, BulkRowResult, BulkProjectItem } from '../api/bulkUpdate';

interface ColumnGuide {
  key: string;
  name: string;
  required: string;
  format: string;
  example: string;
  notes: string;
}

export interface ModeMeta {
  key: BulkUpdateMode;
  title: string;
  shortDesc: string;
  requiredKeys: string[];
  optionalKeys: string[];
  numberKeys: string[];
  dateKeys: string[];
  headers: string[];
  sampleRow: (string | number)[];
  guides: ColumnGuide[];
  warningNotice?: string;
}

export const FIELD_LABELS: Record<string, string> = {
  asset_code: 'Mã tài sản',
  old_asset_code: 'Mã tài sản sổ cũ',
  project_name: 'Tên dự án',
  legal_lot_code: 'Mã pháp lý (mã lô)',
  certificate_no: 'Số GCN',
  new_certificate_no: 'Số GCN mới',
  area: 'Diện tích (m²)',
  registry_date: 'Ngày cấp',
  usage_term_date: 'Thời hạn sử dụng',
  land_lot_no: 'Số thửa',
  map_sheet_no: 'Số tờ bản đồ',
  registry_no: 'Số vào sổ cấp',
  usage_purpose: 'Mục đích sử dụng',
  usage_term_type: 'Loại thời hạn',
  asset_type: 'Loại tài sản',
  certificate_group: 'Nhóm sổ',
  business_plot_code: 'Mã lô kinh doanh',
  business_project_name: 'Tên dự án kinh doanh (khác dự án pháp lý ở cột Tên dự án)',
  managing_unit: 'Đơn vị quản lý',
  scan_file_url: 'Link bản scan',
  notes: 'Ghi chú',
  mortgage_valuation: 'Định giá thế chấp (VNĐ)',
  collateral_ratio: 'Tỷ lệ bảo đảm (%)',
  collateral_value: 'Giá trị bảo đảm (VNĐ)',
  mortgage_expected_release_date: 'Ngày dự kiến giải chấp',
  mortgage_bank: 'Ngân hàng thế chấp',
  mortgage_unit: 'Đơn vị vay',
  new_owner_code: 'Mã công ty chủ mới',
  new_owner_name: 'Tên chủ sở hữu mới',
  new_owner_role: 'Vai trò chủ mới',
  duplicate_ack_reason: 'Lý do xác nhận trùng GCN',
  chu_so_huu: 'Chủ sở hữu',
  vai_tro: 'Vai trò chủ sở hữu',
};

const PROJECT_GUIDE_NAME: ColumnGuide = {
  key: 'project_name',
  name: 'Tên dự án',
  required: 'Bắt buộc',
  format: 'Chuỗi, chép đúng tên trong sheet «Danh mục dự án»',
  example: 'Tên dự án trong danh mục',
  notes: 'Phải trùng dự án hiện tại của GCN; không phân biệt hoa/thường',
};

export const BULK_MODES_CONFIG: Record<BulkUpdateMode, ModeMeta> = {
  info: {
    key: 'info',
    title: 'Cập nhật thông tin',
    shortDesc: 'Sửa diện tích, thửa, tờ bản đồ, số/ngày vào sổ, mục đích, thời hạn, loại tài sản, nhóm sổ, mã lô KD, link scan, ghi chú...',
    requiredKeys: ['asset_code', 'project_name', 'legal_lot_code', 'certificate_no'],
    optionalKeys: [
      'area', 'registry_date', 'usage_term_date', 'land_lot_no', 'map_sheet_no',
      'registry_no', 'usage_purpose', 'usage_term_type', 'asset_type',
      'certificate_group', 'business_plot_code', 'business_project_name',
      'managing_unit', 'scan_file_url', 'notes'
    ],
    numberKeys: ['area'],
    dateKeys: ['registry_date', 'usage_term_date'],
    headers: [
      'asset_code', 'project_name', 'legal_lot_code', 'certificate_no', 'area', 'registry_date',
      'usage_term_date', 'land_lot_no', 'map_sheet_no', 'registry_no', 'usage_purpose',
      'usage_term_type', 'asset_type', 'certificate_group', 'business_plot_code',
      'business_project_name', 'managing_unit', 'scan_file_url', 'notes'
    ],
    sampleRow: [
      'GCN-000123', 'Tên dự án trong danh mục', 'LK-01', 'BA 123456', 125.5, '15/05/2023',
      '15/05/2073', '102', '15', 'CS 00123', 'Đất ở tại đô thị',
      'fixed_date', 'Nhà ở', 'so_lon', 'LK1-05',
      'Khu Đô Thị Sinh Thái', 'Ban Quản Lý Dự Án', '', 'Cập nhật diện tích theo đo đạc lại'
    ],
    guides: [
      { key: 'asset_code', name: 'Mã tài sản', required: 'Bắt buộc', format: 'Chuỗi (chữ in hoa)', example: 'GCN-000123', notes: 'Khớp mã tài sản hiện có trên hệ thống' },
      PROJECT_GUIDE_NAME,
      { key: 'legal_lot_code', name: 'Mã pháp lý (mã lô)', required: 'Bắt buộc', format: 'Chuỗi', example: 'LK-01', notes: 'Phải khớp đúng mã lô pháp lý của GCN' },
      { key: 'certificate_no', name: 'Số GCN hiện tại', required: 'Bắt buộc', format: 'Chuỗi', example: 'BA 123456', notes: 'Số GCN hiện tại trên hệ thống để đối soát' },
      { key: 'area', name: 'Diện tích (m²)', required: 'Tùy chọn', format: 'Số dương', example: '125.5', notes: 'Nếu để trống sẽ giữ nguyên diện tích cũ' },
      { key: 'registry_date', name: 'Ngày vào sổ cấp', required: 'Tùy chọn', format: 'dd/mm/yyyy', example: '15/05/2023', notes: 'Để trống = giữ nguyên' },
      { key: 'usage_term_date', name: 'Thời hạn sử dụng', required: 'Tùy chọn', format: 'dd/mm/yyyy', example: '15/05/2073', notes: 'Để trống = giữ nguyên' },
      { key: 'land_lot_no', name: 'Số thửa đất', required: 'Tùy chọn', format: 'Chuỗi', example: '102', notes: 'Để trống = giữ nguyên' },
      { key: 'map_sheet_no', name: 'Số tờ bản đồ', required: 'Tùy chọn', format: 'Chuỗi', example: '15', notes: 'Để trống = giữ nguyên' },
      { key: 'registry_no', name: 'Số vào sổ cấp', required: 'Tùy chọn', format: 'Chuỗi', example: 'CS 00123', notes: 'Để trống = giữ nguyên' },
      { key: 'usage_purpose', name: 'Mục đích sử dụng', required: 'Tùy chọn', format: 'Chuỗi', example: 'Đất ở tại đô thị', notes: 'Để trống = giữ nguyên' },
      { key: 'usage_term_type', name: 'Loại thời hạn', required: 'Tùy chọn', format: 'fixed_date | long_term', example: 'fixed_date', notes: 'fixed_date (có thời hạn) hoặc long_term (lâu dài)' },
      { key: 'asset_type', name: 'Loại tài sản', required: 'Tùy chọn', format: 'Chuỗi', example: 'Nhà ở gắn liền với đất', notes: 'Để trống = giữ nguyên' },
      { key: 'certificate_group', name: 'Nhóm sổ', required: 'Tùy chọn', format: 'so_lon | so_nho', example: 'so_lon', notes: 'so_lon (Sổ lớn) hoặc so_nho (Sổ con)' },
      { key: 'business_plot_code', name: 'Mã lô kinh doanh', required: 'Tùy chọn', format: 'Chuỗi', example: 'LK1-05', notes: 'Để trống = giữ nguyên' },
      { key: 'business_project_name', name: 'Tên dự án kinh doanh (khác dự án pháp lý ở cột Tên dự án)', required: 'Tùy chọn', format: 'Chuỗi', example: 'Khu Đô Thị Sinh Thái', notes: 'Dự án kinh doanh (nếu có); khác với dự án pháp lý ở cột Tên dự án' },
      { key: 'managing_unit', name: 'Đơn vị quản lý', required: 'Tùy chọn', format: 'Chuỗi', example: 'Ban QLDA', notes: 'Để trống = giữ nguyên' },
      { key: 'scan_file_url', name: 'Link bản scan', required: 'Tùy chọn', format: 'Link SharePoint/OneDrive', example: 'https://company.sharepoint.com/...', notes: 'Phải là link SharePoint/OneDrive hợp lệ' },
      { key: 'notes', name: 'Ghi chú', required: 'Tùy chọn', format: 'Chuỗi văn bản', example: 'Đính chính theo hồ sơ đo vẽ lại', notes: 'Để trống = giữ nguyên' }
    ]
  },
  mortgage: {
    key: 'mortgage',
    title: 'Cập nhật thông tin thế chấp',
    shortDesc: 'Sửa ngân hàng, đơn vị vay, định giá, tỷ lệ, giá trị bảo đảm, ngày dự kiến giải chấp (chỉ áp dụng với GCN đang thế chấp).',
    requiredKeys: ['asset_code', 'project_name', 'legal_lot_code', 'certificate_no'],
    optionalKeys: [
      'mortgage_valuation', 'collateral_ratio', 'collateral_value',
      'mortgage_expected_release_date', 'mortgage_bank', 'mortgage_unit'
    ],
    numberKeys: ['mortgage_valuation', 'collateral_ratio', 'collateral_value'],
    dateKeys: ['mortgage_expected_release_date'],
    headers: [
      'asset_code', 'project_name', 'legal_lot_code', 'certificate_no', 'mortgage_valuation',
      'collateral_ratio', 'collateral_value', 'mortgage_expected_release_date',
      'mortgage_bank', 'mortgage_unit'
    ],
    sampleRow: [
      'GCN-000123', 'Tên dự án trong danh mục', 'LK-01', 'BA 123456', 2500000000, 70, 1750000000,
      '31/12/2026', 'BIDV - CN TP.HCM', 'Công ty Cổ phần VMT'
    ],
    guides: [
      { key: 'asset_code', name: 'Mã tài sản', required: 'Bắt buộc', format: 'Chuỗi (chữ in hoa)', example: 'GCN-000123', notes: 'Khớp mã tài sản hiện có trên hệ thống' },
      PROJECT_GUIDE_NAME,
      { key: 'legal_lot_code', name: 'Mã pháp lý (mã lô)', required: 'Bắt buộc', format: 'Chuỗi', example: 'LK-01', notes: 'Phải khớp đúng mã lô pháp lý của GCN' },
      { key: 'certificate_no', name: 'Số GCN hiện tại', required: 'Bắt buộc', format: 'Chuỗi', example: 'BA 123456', notes: 'Số GCN hiện tại trên hệ thống' },
      { key: 'mortgage_valuation', name: 'Định giá thế chấp', required: 'Tùy chọn', format: 'Số dương (VNĐ)', example: '2500000000', notes: 'Giá trị định giá của ngân hàng. Nên nhập ô kiểu Số, không gõ dấu nhóm nghìn.' },
      { key: 'collateral_ratio', name: 'Tỷ lệ bảo đảm', required: 'Tùy chọn', format: 'Số từ 0 đến 100 (%)', example: '70', notes: 'Tỷ lệ thế chấp bảo đảm' },
      { key: 'collateral_value', name: 'Giá trị bảo đảm', required: 'Tùy chọn', format: 'Số dương (VNĐ)', example: '1750000000', notes: 'Giá trị thế chấp thực tế. Nên nhập ô kiểu Số, không gõ dấu nhóm nghìn.' },
      { key: 'mortgage_expected_release_date', name: 'Ngày dự kiến giải chấp', required: 'Tùy chọn', format: 'dd/mm/yyyy', example: '31/12/2026', notes: 'Để trống = giữ nguyên' },
      { key: 'mortgage_bank', name: 'Ngân hàng thế chấp', required: 'Tùy chọn', format: 'Chuỗi (nhiều NH cách nhau bởi dấu chấm phẩy ;)', example: 'BIDV; Vietcombank', notes: 'Để trống = giữ nguyên' },
      { key: 'mortgage_unit', name: 'Đơn vị vay', required: 'Tùy chọn', format: 'Chuỗi', example: 'Công ty Cổ phần VMT', notes: 'Để trống = giữ nguyên' }
    ]
  },
  owner: {
    key: 'owner',
    title: 'Đổi chủ sở hữu',
    shortDesc: 'Đổi chủ sở hữu mới qua transfer_asset_ownership (lưu lại đầy đủ lịch sử biến động chủ sở hữu).',
    requiredKeys: ['asset_code', 'project_name', 'legal_lot_code', 'certificate_no'],
    optionalKeys: ['new_owner_code', 'new_owner_name', 'new_owner_role'],
    numberKeys: [],
    dateKeys: [],
    headers: [
      'asset_code', 'project_name', 'legal_lot_code', 'certificate_no',
      'new_owner_code', 'new_owner_name', 'new_owner_role'
    ],
    sampleRow: [
      'GCN-000123', 'Tên dự án trong danh mục', 'LK-01', 'BA 123456', 'CDT_01', 'Công ty Cổ phần Đầu tư VMT', 'cdt'
    ],
    guides: [
      { key: 'asset_code', name: 'Mã tài sản', required: 'Bắt buộc', format: 'Chuỗi (chữ in hoa)', example: 'GCN-000123', notes: 'Khớp mã tài sản hiện có trên hệ thống' },
      PROJECT_GUIDE_NAME,
      { key: 'legal_lot_code', name: 'Mã pháp lý (mã lô)', required: 'Bắt buộc', format: 'Chuỗi', example: 'LK-01', notes: 'Phải khớp đúng mã lô pháp lý của GCN' },
      { key: 'certificate_no', name: 'Số GCN hiện tại', required: 'Bắt buộc', format: 'Chuỗi', example: 'BA 123456', notes: 'Số GCN hiện tại trên hệ thống' },
      { key: 'new_owner_code', name: 'Mã công ty chủ mới', required: 'Bắt buộc (1 trong 2)', format: 'Chuỗi mã pháp nhân', example: 'CDT_01', notes: 'Ưu tiên dùng mã công ty để tránh trùng lặp tên' },
      { key: 'new_owner_name', name: 'Tên chủ sở hữu mới', required: 'Bắt buộc (1 trong 2)', format: 'Chuỗi tên pháp nhân', example: 'Công ty Cổ phần Đầu tư VMT', notes: 'Dùng nếu không nhớ mã công ty (tên phải là duy nhất)' },
      { key: 'new_owner_role', name: 'Vai trò chủ mới', required: 'Tùy chọn', format: 'cdt | ndt', example: 'cdt', notes: 'cdt (Chủ đầu tư) hoặc ndt (Nhà đầu tư). Mặc định là cdt' }
    ]
  },
  certificate: {
    key: 'certificate',
    title: 'Sửa sai số GCN',
    shortDesc: 'Đính chính sai sót số GCN trên cùng một bản ghi (KHÔNG phải cấp đổi). Bắt buộc xác nhận nếu số mới trùng GCN khác.',
    requiredKeys: ['asset_code', 'project_name', 'legal_lot_code', 'new_certificate_no'],
    optionalKeys: ['certificate_no', 'duplicate_ack_reason'],
    numberKeys: [],
    dateKeys: [],
    headers: [
      'asset_code', 'project_name', 'legal_lot_code', 'certificate_no', 'new_certificate_no', 'duplicate_ack_reason'
    ],
    sampleRow: [
      'GCN-000123', 'Tên dự án trong danh mục', 'LK-01', 'BA 123456', 'BB 987654', ''
    ],
    guides: [
      { key: 'asset_code', name: 'Mã tài sản', required: 'Bắt buộc', format: 'Chuỗi (chữ in hoa)', example: 'GCN-000123', notes: 'Khớp mã tài sản hiện có trên hệ thống' },
      PROJECT_GUIDE_NAME,
      { key: 'legal_lot_code', name: 'Mã pháp lý (mã lô)', required: 'Bắt buộc', format: 'Chuỗi', example: 'LK-01', notes: 'Phải khớp đúng mã lô pháp lý của GCN' },
      { key: 'certificate_no', name: 'Số GCN hiện tại', required: 'Tùy chọn', format: 'Chuỗi', example: 'BA 123456', notes: 'Nên điền số đang có trên hệ thống để xác nhận đúng sổ (nhất là khi có sổ con cùng dự án, cùng mã pháp lý)' },
      { key: 'new_certificate_no', name: 'Số GCN mới (đính chính)', required: 'Bắt buộc', format: 'Chuỗi', example: 'BB 987654', notes: 'Số GCN chính xác cần đính chính lại' },
      { key: 'duplicate_ack_reason', name: 'Lý do xác nhận trùng', required: 'Tùy chọn', format: 'Chuỗi tối thiểu 10 ký tự', example: 'Trùng số GCN do UBND cấp cùng đợt', notes: 'Chỉ điền khi số GCN mới trùng với GCN khác trong hệ thống' }
    ]
  },
  reissue: {
    key: 'reissue',
    title: 'Cấp đổi hàng loạt',
    shortDesc: 'Tạo hồ sơ cấp đổi chờ duyệt hàng loạt từ sổ cũ đã xuất kho. Sổ mới chỉ xuất hiện sau khi duyệt hồ sơ.',
    warningNotice: 'Sổ cũ phải đã được XUẤT KHO trước. Lập phiếu xuất kho với lý do «thu hồi» và chờ duyệt, rồi mới tạo hồ sơ cấp đổi. Sổ cũ còn lưu kho sẽ bị chặn ở bước xem trước. Hồ sơ tạo ra ở trạng thái chờ duyệt; GCN mới chỉ xuất hiện sau khi duyệt hồ sơ.',
    requiredKeys: ['old_asset_code', 'project_name', 'legal_lot_code', 'certificate_no'],
    optionalKeys: [
      'registry_no', 'registry_date', 'area', 'land_lot_no', 'map_sheet_no',
      'usage_purpose', 'usage_term_type', 'usage_term_date', 'scan_file_url',
      'notes', 'duplicate_ack_reason'
    ],
    numberKeys: ['area'],
    dateKeys: ['registry_date', 'usage_term_date'],
    headers: [
      'old_asset_code', 'project_name', 'legal_lot_code', 'certificate_no', 'registry_no',
      'registry_date', 'area', 'land_lot_no', 'map_sheet_no', 'usage_purpose',
      'usage_term_type', 'usage_term_date', 'scan_file_url', 'notes', 'duplicate_ack_reason'
    ],
    sampleRow: [
      'GCN-000123', 'Tên dự án trong danh mục', 'LK-01', 'CC 456789', 'CS 00456',
      '10/01/2024', 125.5, '102', '15', 'Đất ở tại đô thị',
      'long_term', '10/01/2074', '', 'Cấp đổi theo QĐ 123/UBND', ''
    ],
    guides: [
      { key: 'old_asset_code', name: 'Mã tài sản sổ cũ', required: 'Bắt buộc', format: 'Chuỗi (chữ in hoa)', example: 'GCN-000123', notes: 'Sổ cũ phải đang ở trạng thái đã xuất kho (thu hồi)' },
      PROJECT_GUIDE_NAME,
      { key: 'legal_lot_code', name: 'Mã pháp lý (mã lô)', required: 'Bắt buộc', format: 'Chuỗi', example: 'LK-01', notes: 'Khớp mã pháp lý của sổ cũ' },
      { key: 'certificate_no', name: 'Số GCN MỚI', required: 'Bắt buộc', format: 'Chuỗi', example: 'CC 456789', notes: 'Số GCN mới sau khi cấp đổi' },
      { key: 'registry_no', name: 'Số vào sổ cấp', required: 'Tùy chọn', format: 'Chuỗi', example: 'CS 00456', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'registry_date', name: 'Ngày vào sổ cấp', required: 'Tùy chọn', format: 'dd/mm/yyyy', example: '10/01/2024', notes: 'Để trống = không ghi ngày cấp mới' },
      { key: 'area', name: 'Diện tích (m²)', required: 'Tùy chọn', format: 'Số dương', example: '125.5', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'land_lot_no', name: 'Số thửa', required: 'Tùy chọn', format: 'Chuỗi', example: '102', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'map_sheet_no', name: 'Số tờ bản đồ', required: 'Tùy chọn', format: 'Chuỗi', example: '15', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'usage_purpose', name: 'Mục đích sử dụng', required: 'Tùy chọn', format: 'Chuỗi', example: 'Đất ở tại đô thị', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'usage_term_type', name: 'Loại thời hạn', required: 'Tùy chọn', format: 'fixed_date | long_term', example: 'long_term', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'usage_term_date', name: 'Thời hạn sử dụng', required: 'Tùy chọn', format: 'dd/mm/yyyy', example: '10/01/2074', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'scan_file_url', name: 'Link bản scan mới', required: 'Tùy chọn', format: 'Link SharePoint/OneDrive', example: 'https://company.sharepoint.com/...', notes: 'Để trống = kế thừa từ sổ cũ' },
      { key: 'notes', name: 'Ghi chú cấp đổi', required: 'Tùy chọn', format: 'Chuỗi văn bản', example: 'Cấp đổi theo QĐ 123/UBND', notes: 'Để trống = chỉ ghi lý do cấp đổi hàng loạt' },
      { key: 'duplicate_ack_reason', name: 'Lý do xác nhận trùng', required: 'Tùy chọn', format: 'Chuỗi tối thiểu 10 ký tự', example: 'Trùng số GCN do UBND cấp cùng đợt', notes: 'Bắt buộc nếu số GCN mới trùng với GCN khác trong hệ thống' }
    ]
  }
};

/**
 * Định dạng ngày hiển thị dd/mm/yyyy bằng thuần chuỗi để tránh lệch múi giờ
 */
export function fmtDisplayDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(trống)';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}

/**
 * Chống chèn công thức Excel: nếu chuỗi bắt đầu bằng =, +, -, @, tab hoặc xuống dòng
 * thì thêm dấu nháy đơn ' đứng đầu.
 */
export function sanitizeExcelCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r\n]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Tạo và tải file mẫu Excel cho chế độ được chọn:
 * - Sheet 1 «Dữ liệu»: Tiêu đề có dạng "<Tên VN> * (<khóa>)" nếu bắt buộc, "<Tên VN> (<khóa>)" nếu tùy chọn.
 * - Các ô từ dòng 2 đến dòng 1000 cho các cột không phải số được định dạng là text rỗng { t: 's', v: '', z: '@' }.
 * - Dòng 2 chứa dòng ví dụ mẫu.
 * - Sheet 2 «Hướng dẫn»: Giải thích chi tiết và nhắc nhở "Xóa dòng ví dụ trước khi tải lên".
 */
export function downloadExcelTemplate(
  mode: BulkUpdateMode,
  projects?: BulkProjectItem[],
  isLoadError: boolean = false
) {
  const config = BULK_MODES_CONFIG[mode];
  if (!config) return;

  const wb = XLSX.utils.book_new();

  // Dựng tiêu đề: <Tên tiếng Việt> (<khóa>) kèm * nếu bắt buộc
  const guideMap = new Map<string, ColumnGuide>();
  for (const g of config.guides) {
    guideMap.set(g.key, g);
  }

  const formattedHeaders = config.headers.map((key) => {
    const guide = guideMap.get(key);
    const vnName = guide?.name || FIELD_LABELS[key] || key;
    const isRequired = config.requiredKeys.includes(key);
    return isRequired ? `${vnName} * (${key})` : `${vnName} (${key})`;
  });

  // Dựng dòng ví dụ (sampleRow): lấy tên của dự án đầu tiên trong danh mục thật nếu có
  const sampleRow = [...config.sampleRow];
  const pNameIdx = config.headers.indexOf('project_name');
  if (projects && projects.length > 0 && !isLoadError) {
    if (pNameIdx !== -1) {
      sampleRow[pNameIdx] = projects[0].name;
    }
  }

  // Sheet 1: Dữ liệu (Row 1: Header, Row 2: Example)
  const dataSheetData = [formattedHeaders, sampleRow];
  const wsData = XLSX.utils.aoa_to_sheet(dataSheetData);

  // Thiết lập độ rộng cột
  wsData['!cols'] = config.headers.map((h, idx) => ({
    wch: Math.max(formattedHeaders[idx]?.length || 16, 20),
  }));

  // Định dạng các ô từ dòng 2 đến dòng 1000 cho các cột KHÔNG phải số thành text '@'
  // Row index 1 = dòng 2 trong Excel, row index 999 = dòng 1000 trong Excel
  for (let r = 1; r < 1000; r++) {
    for (let c = 0; c < config.headers.length; c++) {
      const key = config.headers[c];
      const isNumberCol = config.numberKeys.includes(key);
      const cellAddr = XLSX.utils.encode_cell({ r, c });

      if (!isNumberCol) {
        if (r === 1) {
          // Dòng 2: Sample row
          const existing = wsData[cellAddr];
          if (existing) {
            existing.t = 's';
            existing.v = String(existing.v ?? '');
            existing.z = '@';
          }
        } else {
          // Dòng 3 đến 1000: Ô text rỗng
          wsData[cellAddr] = { t: 's', v: '', z: '@' };
        }
      }
    }
  }

  // Cập nhật !ref bao đủ vùng 1000 dòng
  wsData['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 999, c: config.headers.length - 1 },
  });

  XLSX.utils.book_append_sheet(wb, wsData, 'Dữ liệu');

  // Sheet 2: Hướng dẫn
  const guideHeaders = ['Tên cột trong mẫu', 'Khóa JSON chuẩn', 'Tên trường tiếng Việt', 'Yêu cầu', 'Định dạng dữ liệu', 'Ví dụ', 'Quy tắc & Ghi chú'];
  const guideRows = config.guides.map((g) => {
    const isRequired = config.requiredKeys.includes(g.key);
    const headerTitle = isRequired ? `${g.name} * (${g.key})` : `${g.name} (${g.key})`;
    return [
      headerTitle,
      g.key,
      g.name,
      g.required,
      g.format,
      g.example,
      g.notes,
    ];
  });

  // Thêm dòng lưu ý xóa dòng ví dụ và lưu ý về dự án (Prompt 12 Mục 4)
  guideRows.unshift(
    [
      '-- LƯU Ý CHUNG --',
      '--',
      'Xóa dòng ví dụ (dòng 2) trước khi tải lên',
      'Bắt buộc',
      'Text',
      '--',
      'Dòng 1 là tiêu đề không đổi. Dòng 2 là ví dụ minh họa, quý khách cần xóa dòng 2 trước khi import.',
    ],
    [
      '-- LƯU Ý DỰ ÁN --',
      '--',
      'Tên dự án phải có trong sheet «Danh mục dự án»',
      'Bắt buộc',
      'Text',
      '--',
      'Tên dự án phải có trong sheet «Danh mục dự án». Máy chủ so khớp không phân biệt hoa/thường và khoảng trắng thừa. Danh mục có thể thay đổi: hãy tải mẫu mới trước mỗi đợt. Danh mục chỉ gồm dự án bạn được phép cập nhật.',
    ]
  );

  const wsGuide = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);
  wsGuide['!cols'] = [
    { wch: 32 }, // Tên cột mẫu
    { wch: 20 }, // Khóa JSON
    { wch: 24 }, // Tên trường
    { wch: 18 }, // Yêu cầu
    { wch: 25 }, // Định dạng
    { wch: 22 }, // Ví dụ
    { wch: 60 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, wsGuide, 'Hướng dẫn');

  // Sheet 3: Danh mục dự án (Prompt 13 Mục A.2: STT | Tên dự án | Khu vực | Số GCN)
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const headerNotice = `Danh mục dự án lấy từ hệ thống lúc ${timeStr} — chép ĐÚNG tên vào cột «Tên dự án» của sheet Dữ liệu`;

  // Dòng 1: Ghi chú thời điểm
  // Dòng 2: Trống []
  // Dòng 3: Tiêu đề STT | Tên dự án | Khu vực | Số GCN
  // Từ dòng 4: Dữ liệu
  const projectHeaders = ['STT', 'Tên dự án', 'Khu vực', 'Số GCN'];
  let projectRows: (string | number)[][] = [];

  if (isLoadError) {
    projectRows = [
      [1, 'Không tải được danh mục dự án lúc tạo mẫu. Hãy tải lại mẫu hoặc xem danh mục trên màn hình.', '', ''],
    ];
  } else if (projects && projects.length > 0) {
    projectRows = projects.map((p, idx) => [
      idx + 1,
      sanitizeExcelCellValue(p.name),
      sanitizeExcelCellValue(p.areaName || ''),
      p.assetCount,
    ]);
  } else {
    projectRows = [
      [1, 'Không có dự án nào trong phạm vi quản lý', '', 0],
    ];
  }

  const sheet3Data = [
    [headerNotice],
    [],
    projectHeaders,
    ...projectRows,
  ];

  const wsProjects = XLSX.utils.aoa_to_sheet(sheet3Data);
  wsProjects['!cols'] = [
    { wch: 8 },  // STT
    { wch: 38 }, // Tên dự án
    { wch: 22 }, // Khu vực
    { wch: 16 }, // Số GCN
  ];

  // Định dạng text '@' cho các ô văn bản trong Sheet 3
  for (let r = 0; r < sheet3Data.length; r++) {
    for (let c = 0; c < 4; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      const cell = wsProjects[cellAddr];
      if (cell && typeof cell.v === 'string') {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsProjects, 'Danh mục dự án');

  // Xuất file
  const fileName = `mau_excel_${mode}_cap_nhat_hang_loat.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Định dạng r_changes thành chuỗi hiển thị 'trường: cũ → mới'
 * Các trường ngày hiển thị chuẩn dd/mm/yyyy
 */
export function formatRowChanges(changes?: Record<string, [any, any]> | null): string[] {
  if (!changes || Object.keys(changes).length === 0) return [];
  const lines: string[] = [];
  const dateKeys = ['registry_date', 'usage_term_date', 'mortgage_expected_release_date'];

  for (const [key, val] of Object.entries(changes)) {
    const label = FIELD_LABELS[key] || key;
    let oldVal = val?.[0];
    let newVal = val?.[1];

    const formatVal = (v: any) => {
      if (v === null || v === undefined || v === '') return '(trống)';
      if (typeof v === 'boolean') return v ? 'Có' : 'Không';
      if (dateKeys.includes(key)) {
        return fmtDisplayDate(v);
      }
      return String(v);
    };

    lines.push(`${label}: ${formatVal(oldVal)} → ${formatVal(newVal)}`);
  }

  return lines;
}

/**
 * Xuất file báo cáo xem trước (.xlsx) có chống chèn công thức (Prompt 12 Mục 6)
 */
export function exportPreviewReport(
  mode: BulkUpdateMode,
  results: BulkRowResult[],
  sourceFileName: string = 'data'
) {
  const wb = XLSX.utils.book_new();

  const isReissue = mode === 'reissue';
  const headers = [
    'STT dòng Excel',
    isReissue ? 'Mã tài sản sổ cũ' : 'Mã tài sản',
    'Tên dự án (theo file)',
    'Trạng thái kiểm tra',
    'Mã kết quả (server)',
    'Nội dung thông báo',
    'Chi tiết thay đổi',
  ];

  const rows = results.map((r) => {
    let statusLabel = 'Lỗi';
    if (r.status === 'ok') statusLabel = 'Hợp lệ';
    if (r.status === 'unchanged') statusLabel = 'Không đổi';

    const changesText = formatRowChanges(r.changes).join('; ');

    return [
      r.row, // Số thứ tự giữ kiểu number
      sanitizeExcelCellValue(r.assetCode),
      sanitizeExcelCellValue(r.projectName || ''),
      sanitizeExcelCellValue(statusLabel),
      sanitizeExcelCellValue(r.status),
      sanitizeExcelCellValue(r.message),
      sanitizeExcelCellValue(changesText || (isReissue ? 'Tạo hồ sơ cấp đổi' : 'Không có thay đổi')),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 20 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 45 },
    { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Ket_qua_xem_truoc');

  const baseName = sanitizeExcelCellValue(sourceFileName.replace(/\.[^/.]+$/, ''));
  const outName = `Bao_cao_xem_truoc_${mode}_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, outName);
}

/**
 * Xuất file báo cáo kết quả thực thi (.xlsx) có chống chèn công thức (Prompt 12 Mục 6)
 * Cột "Ghi chú": chỉ ghi "Đã ghi nhật ký kiểm toán" cho dòng applied; dòng khác để trống.
 */
export function exportExecutionReport(
  mode: BulkUpdateMode,
  results: BulkRowResult[],
  sourceFileName: string = 'data'
) {
  const wb = XLSX.utils.book_new();

  const isReissue = mode === 'reissue';
  const headers = [
    'STT dòng Excel',
    isReissue ? 'Mã tài sản sổ cũ' : 'Mã tài sản',
    'Tên dự án (theo file)',
    'Kết quả thực thi',
    'Mã kết quả (server)',
    isReissue ? 'Mã hồ sơ cấp đổi (request_id)' : 'Ghi chú',
    'Thông báo chi tiết',
  ];

  const rows = results.map((r) => {
    let resultLabel = 'Thất bại';
    if (r.status === 'applied' || r.status === 'created' || r.status === 'ok') {
      resultLabel = 'Thành công';
    } else if (r.status === 'unchanged') {
      resultLabel = 'Bỏ qua (không đổi)';
    }

    let noteOrReqId = '';
    if (isReissue) {
      noteOrReqId = r.requestId || '-';
    } else {
      if (r.status === 'applied') {
        noteOrReqId = 'Đã ghi nhật ký kiểm toán';
      }
    }

    return [
      r.row, // Số thứ tự giữ kiểu number
      sanitizeExcelCellValue(r.assetCode),
      sanitizeExcelCellValue(r.projectName || ''),
      sanitizeExcelCellValue(resultLabel),
      sanitizeExcelCellValue(r.status),
      sanitizeExcelCellValue(noteOrReqId),
      sanitizeExcelCellValue(r.message),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 20 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 36 },
    { wch: 45 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Ket_qua_thuc_thi');

  const baseName = sanitizeExcelCellValue(sourceFileName.replace(/\.[^/.]+$/, ''));
  const outName = `Bao_cao_ket_qua_${mode}_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, outName);
}
