import * as XLSX from 'xlsx';
import { ProjectReportRow } from '../types';

export interface ExportProjectReportExcelOptions {
  projectName?: string;
  reportPeriod?: string;
  rows: ProjectReportRow[];
  region?: string;
}

/**
 * Xuất file Excel Báo cáo Tổng quan / Theo dõi theo Dự án
 * (BẢNG KÊ CHI TIẾT THÔNG TIN BẤT ĐỘNG SẢN - Khớp 100% mẫu quy chuẩn image_5.png)
 * Cấu trúc 3 tầng header:
 * - Tầng 1: Thông tin quy hoạch | Số GCN | Thông tin tình trạng GCN QSDĐ (bao trùm 4 nhóm) | Trạng thái TSĐB
 * - Tầng 2: GCN tồn CĐT | GCN tồn NĐT | GCN chờ CQNN cấp | GCN đã bán cho khách hàng
 * - Tầng 3: Chi tiết 25 cột
 *
 * GHI CHÚ: "ID Hệ Thống" và "Mã Tài Sản / TSĐB" trước đây là 2 cột riêng nhưng luôn cùng
 * 1 giá trị (assets.asset_code), vì DB chỉ lưu 1 mã cho mỗi sổ. Đã gộp còn 1 cột theo yêu cầu.
 */
export function exportProjectReportExcel({
  projectName = 'Toàn bộ dự án',
  reportPeriod = 'Năm 2026',
  rows,
  region = 'Tất cả vùng',
}: ExportProjectReportExcelOptions): void {
  const wsData: any[][] = [];

  // Row 1: Tiêu đề báo cáo
  wsData.push(['BẢNG KÊ CHI TIẾT THÔNG TIN BẤT ĐỘNG SẢN']);

  // Row 2-4: Thông tin dự án và kỳ báo cáo
  wsData.push([`Dự án: ${projectName}`]);
  wsData.push([`Kỳ báo cáo: ${reportPeriod} — Vùng: ${region} — Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`]);
  wsData.push([]); // Dòng trống ngăn cách

  // Row 5 (index 4): TẦNG 1 - HEADER LỚN BAO TRÙM
  const row5 = [
    'THÔNG TIN BẤT ĐỘNG SẢN THEO QUY HOẠCH', // 0
    '',                                      // 1
    '',                                      // 2
    '',                                      // 3
    '',                                      // 4
    '',                                      // 5
    'SỐ GCN QSDĐ',                          // 6
    '',                                      // 7
    'THÔNG TIN TÌNH TRẠNG GCN QSDĐ',        // 8 (bắt đầu khối bao trùm 12 cột)
    '',                                      // 9
    '',                                      // 10
    '',                                      // 11
    '',                                      // 12
    '',                                      // 13
    '',                                      // 14
    '',                                      // 15
    '',                                      // 16
    '',                                      // 17
    '',                                      // 18
    '',                                      // 19
    'TRẠNG THÁI TSĐB & QUẢN LÝ LƯU KHO',     // 20
    '',                                      // 21
    '',                                      // 22
    '',                                      // 23
    '',                                      // 24
  ];
  wsData.push(row5);

  // Row 6 (index 5): TẦNG 2 - HEADER NHÓM CON (TRONG KHỐI TÌNH TRẠNG GCN QSDĐ)
  const row6 = [
    '',                                      // 0
    '',                                      // 1
    '',                                      // 2
    '',                                      // 3
    '',                                      // 4
    '',                                      // 5
    '',                                      // 6
    '',                                      // 7
    'GCN tồn Chủ đầu tư',                    // 8 (chiếm 3 cột: 8, 9, 10)
    '',                                      // 9
    '',                                      // 10
    'GCN tồn Nhà đầu tư',                    // 11 (chiếm 3 cột: 11, 12, 13)
    '',                                      // 12
    '',                                      // 13
    'GCN chờ CQNN cấp',                      // 14 (chiếm 4 cột: 14, 15, 16, 17)
    '',                                      // 15
    '',                                      // 16
    '',                                      // 17
    'GCN đã bán cho khách hàng',            // 18 (chiếm 2 cột: 18, 19)
    '',                                      // 19
    '',                                      // 20
    '',                                      // 21
    '',                                      // 22
    '',                                      // 23
    '',                                      // 24
  ];
  wsData.push(row6);

  // Row 7 (index 6): TẦNG 3 - CỘT CHI TIẾT
  const row7 = [
    'Mã Tài Sản / TSĐB',                  // 0 (đã gộp "ID Hệ Thống" + "Mã Tài Sản / TSĐB")
    'Dự Án (Pháp lý)',                    // 1
    'Loại Tài Sản',                       // 2
    'Nhóm Sổ',                            // 3
    'Lô đất (Mã Lô)',                     // 4
    'Diện Tích (m²)',                     // 5
    'Số nhỏ',                             // 6
    'Số lớn',                             // 7
    'Tên Chủ đầu tư',                     // 8
    'Số lượng GCN',                       // 9
    'Diện tích',                          // 10
    'Tên Nhà Đầu tư',                     // 11
    'Số lượng GCN',                       // 12
    'Diện tích',                          // 13
    'Số lượng GCN chưa tách sổ nhỏ',      // 14
    'Diện tích sổ chưa được tách',        // 15
    'Số chưa được cấp',                   // 16
    'Diện tích sổ chưa được cấp',         // 17
    'Số lượng GCN',                       // 18
    'Diện tích',                          // 19
    'Trạng Thái Pháp Lý',                 // 20
    'Trạng Thái Kinh Doanh',              // 21
    'Trạng Thái Lưu Kho',                 // 22
    'Đơn vị quản lý sổ',                  // 23
    'Ghi chú',                            // 24
  ];
  wsData.push(row7);

  // Rows 8+: Data rows
  rows.forEach((r) => {
    wsData.push([
      r.col_a_system_id,
      r.col_c_project_name,
      r.col_d_asset_type,
      r.col_e_cert_group,
      r.col_f_lot_code,
      r.col_g_area,
      r.col_i_small_cert_no || '',
      r.col_j_master_cert_no || '',
      r.col_k_cdt_name || '',
      r.col_k_cdt_count,
      r.col_l_cdt_area,
      r.col_m_investor_name || '',
      r.col_n_investor_count,
      r.col_o_investor_area,
      r.col_p_unsplit_count,
      r.col_q_unsplit_area,
      r.col_r_unissued_count,
      r.col_s_unissued_area,
      r.col_t_sold_count,
      r.col_u_sold_area,
      r.col_z_legal_status,
      r.col_aa_business_status,
      r.col_ab_custody_status,
      r.col_ac_managing_unit,
      r.col_ad_notes,
    ]);
  });

  // Total summary row
  const totalRowIndex = wsData.length;
  const totalArea = rows.reduce((sum, r) => sum + (Number(r.col_g_area) || 0), 0);
  const totalCdtCount = rows.reduce((sum, r) => sum + r.col_k_cdt_count, 0);
  const totalCdtArea = rows.reduce((sum, r) => sum + r.col_l_cdt_area, 0);
  const totalInvestorCount = rows.reduce((sum, r) => sum + r.col_n_investor_count, 0);
  const totalInvestorArea = rows.reduce((sum, r) => sum + r.col_o_investor_area, 0);
  const totalUnsplitCount = rows.reduce((sum, r) => sum + r.col_p_unsplit_count, 0);
  const totalUnsplitArea = rows.reduce((sum, r) => sum + r.col_q_unsplit_area, 0);
  const totalUnissuedCount = rows.reduce((sum, r) => sum + r.col_r_unissued_count, 0);
  const totalUnissuedArea = rows.reduce((sum, r) => sum + r.col_s_unissued_area, 0);
  const totalSoldCount = rows.reduce((sum, r) => sum + r.col_t_sold_count, 0);
  const totalSoldArea = rows.reduce((sum, r) => sum + r.col_u_sold_area, 0);

  wsData.push([
    'TỔNG CỘNG',
    '',
    '',
    '',
    `${rows.length} lô`,
    totalArea,
    '',
    '',
    '',
    totalCdtCount,
    totalCdtArea,
    '',
    totalInvestorCount,
    totalInvestorArea,
    totalUnsplitCount,
    totalUnsplitArea,
    totalUnissuedCount,
    totalUnissuedArea,
    totalSoldCount,
    totalSoldArea,
    '',
    '',
    '',
    '',
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Merges configuration matching Image 5 (đã dịch chỉ số cột xuống 1 do gộp cột B vào cột A)
  ws['!merges'] = [
    // Top headers
    { s: { r: 0, c: 0 }, e: { r: 0, c: 24 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 24 } }, // Project
    { s: { r: 2, c: 0 }, e: { r: 2, c: 24 } }, // Period

    // Tầng 1 merges:
    { s: { r: 4, c: 0 }, e: { r: 5, c: 5 } },   // THÔNG TIN BĐS QUY HOẠCH (Cols 0-5, Rows 4-5)
    { s: { r: 4, c: 6 }, e: { r: 5, c: 7 } },   // SỐ GCN QSDĐ (Cols 6-7, Rows 4-5)
    { s: { r: 4, c: 8 }, e: { r: 4, c: 19 } },  // THÔNG TIN TÌNH TRẠNG GCN QSDĐ (Cols 8-19, Row 4)
    { s: { r: 4, c: 20 }, e: { r: 5, c: 24 } }, // TRẠNG THÁI TSĐB & LƯU KHO (Cols 20-24, Rows 4-5)

    // Tầng 2 merges (inside THÔNG TIN TÌNH TRẠNG GCN QSDĐ, Row 5):
    { s: { r: 5, c: 8 }, e: { r: 5, c: 10 } },  // GCN tồn Chủ đầu tư (Cols 8-10)
    { s: { r: 5, c: 11 }, e: { r: 5, c: 13 } }, // GCN tồn Nhà đầu tư (Cols 11-13)
    { s: { r: 5, c: 14 }, e: { r: 5, c: 17 } }, // GCN chờ CQNN cấp (Cols 14-17)
    { s: { r: 5, c: 18 }, e: { r: 5, c: 19 } }, // GCN đã bán cho khách hàng (Cols 18-19)

    // Total row merge
    { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 3 } }, // TỔNG CỘNG
  ];

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // 0: Mã Tài Sản / TSĐB
    { wch: 28 }, // 1: Dự Án (Pháp lý)
    { wch: 15 }, // 2: Loại Tài Sản
    { wch: 12 }, // 3: Nhóm Sổ
    { wch: 18 }, // 4: Lô đất
    { wch: 14 }, // 5: Diện Tích
    { wch: 18 }, // 6: Số nhỏ
    { wch: 18 }, // 7: Số lớn
    { wch: 26 }, // 8: Tên Chủ đầu tư
    { wch: 14 }, // 9: Số lượng GCN CĐT
    { wch: 14 }, // 10: Diện tích CĐT
    { wch: 24 }, // 11: Tên Nhà Đầu tư
    { wch: 14 }, // 12: Số lượng GCN NĐT
    { wch: 14 }, // 13: Diện tích NĐT
    { wch: 16 }, // 14: Chưa tách sổ nhỏ (Số lượng)
    { wch: 16 }, // 15: Chưa tách sổ nhỏ (Diện tích)
    { wch: 16 }, // 16: Chưa được cấp (Số lượng)
    { wch: 16 }, // 17: Chưa được cấp (Diện tích)
    { wch: 14 }, // 18: Đã bán (Số lượng)
    { wch: 14 }, // 19: Đã bán (Diện tích)
    { wch: 18 }, // 20: Trạng Thái Pháp Lý
    { wch: 18 }, // 21: Trạng Thái Kinh Doanh
    { wch: 20 }, // 22: Trạng Thái Lưu Kho
    { wch: 20 }, // 23: Đơn vị quản lý sổ
    { wch: 25 }, // 24: Ghi chú
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Theo Dõi Dự Án');

  const cleanProj = projectName.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
  const fileName = `Bang-Ke-Chi-Tiet-BDS-${cleanProj}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}