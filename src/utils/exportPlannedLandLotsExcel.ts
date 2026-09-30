import * as XLSX from 'xlsx';
import { PlannedLandLot } from '../types';

/**
 * Xuất Excel toàn bộ "Lô quy hoạch pháp lý" của 1 dự án (cả lô độc lập lẫn lô đang
 * nằm trong sổ lớn chưa tách và lô đã cấp GCN riêng).
 *
 * NGUYÊN TẮC Số thửa / Số tờ bản đồ (khớp nghiệp vụ đã chốt):
 * - Lô ĐỘC LẬP, chưa gắn sổ lớn nào (giai đoạn thuần pháp lý): thường CHƯA có số thửa/tờ
 *   thật — chỉ xuất đúng dữ liệu đã khai báo, có thể để trống.
 * - Lô đang NẰM TRONG 1 sổ lớn CHƯA TÁCH: số thửa/tờ hiển thị TẠM THEO sổ lớn cha (vì lô
 *   chưa có số thửa/tờ riêng), có ghi chú "(theo sổ lớn)" để không nhầm là số liệu chính
 *   thức của riêng lô đó.
 * - Lô ĐÃ CÓ GCN riêng (đã tách hoặc cấp thẳng): dùng đúng số thửa/tờ của sổ đã cấp.
 */
export function exportPlannedLandLotsExcel(projectName: string, lots: PlannedLandLot[]): void {
  const rows = lots.map((lot) => {
    const isUnsplitInMaster = Boolean(lot.parent_master_asset_id) && lot.status !== 'đã cấp GCN';

    let landLotNo = lot.land_lot_no || '';
    let mapSheetNo = lot.map_sheet_no || '';
    let landLotNote = '';
    if (!landLotNo && isUnsplitInMaster && lot.parent_master_asset?.land_lot_no) {
      landLotNo = lot.parent_master_asset.land_lot_no;
      landLotNote = ' (theo sổ lớn)';
    }
    if (!mapSheetNo && isUnsplitInMaster && lot.parent_master_asset?.map_sheet_no) {
      mapSheetNo = lot.parent_master_asset.map_sheet_no;
      landLotNote = ' (theo sổ lớn)';
    }

    return {
      'Mã Lô Pháp Lý': lot.legal_lot_code,
      'Trạng Thái': lot.status,
      'Số thửa': landLotNo + landLotNote,
      'Số tờ bản đồ': mapSheetNo + landLotNote,
      'Diện tích dự kiến (m²)': lot.planned_area,
      'Sổ lớn gốc (nếu có)': lot.parent_master_asset?.certificate_no || '',
      'Số GCN đã cấp (nếu có)': lot.resulting_asset?.certificate_no || '',
      'Mã Lô Kinh Doanh': lot.business_plot_code || '',
      'Tên Dự Án Kinh Doanh': lot.business_project_name || '',
      'Ghi chú': lot.notes || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
    { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lô quy hoạch');

  const cleanName = projectName.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
  XLSX.writeFile(wb, `Lo-Quy-Hoach-${cleanName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}