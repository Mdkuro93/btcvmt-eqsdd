import React, { useRef, useState, useMemo } from 'react';
import { X, Printer, Download, FileSpreadsheet, Edit3, Eye } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { Warehouse } from '../types';
import { getVoucherTypeFromTransaction } from '../lib/voucherEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: any; // Transaction item or custom payload
  transaction?: any;
  warehouse?: Warehouse;
  warehouses?: Warehouse[];
}

export const VoucherPrintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  item,
  transaction,
  warehouse,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [printScope, setPrintScope] = useState<'all' | 'single'>('all');

  if (!isOpen || !item) return null;

  // Helper to extract legal owner of the land asset
  const getAssetOwner = (ast: any, itm: any): string => {
    if (ast?.owner_name && typeof ast.owner_name === 'string' && !ast.owner_name.toLowerCase().includes('ban nguồn vốn')) {
      return ast.owner_name;
    }
    if (itm?.details?.owner_name && typeof itm.details.owner_name === 'string' && !itm.details.owner_name.toLowerCase().includes('ban nguồn vốn')) {
      return itm.details.owner_name;
    }
    // Check project company / owner
    if (ast?.projects?.name) {
      if (ast.projects.name.includes('Heritage')) return 'Công ty CP VMT Heritage Miền Trung';
      if (ast.projects.name.includes('Grand Marina')) return 'Công ty TNHH PT Đô Thị VMT Đồng Nai';
      if (ast.projects.name.includes('Spana')) return 'Công ty CP Đầu tư BĐS VMT Sài Gòn';
      if (ast.projects.name.includes('Sunset')) return 'Công ty CP Đầu tư Du lịch Sunset Horizon';
    }
    return ast?.owner_name || 'Công ty Cổ phần Tập đoàn VMT';
  };

  // Helper to extract Lot Number / Plot Code
  const getAssetLotNo = (ast: any, itm: any): string => {
    return (
      ast?.lot_no ||
      ast?.land_lot_no ||
      ast?.business_plot_code ||
      itm?.details?.lot_no ||
      '-'
    );
  };

  // Helper to extract Subdivision
  const getAssetSubdivision = (ast: any, itm: any): string => {
    return ast?.subdivision || itm?.details?.subdivision || '-';
  };

  // Transaction items parsing
  const txItems: any[] = useMemo(() => {
    if (transaction?.items && Array.isArray(transaction.items) && transaction.items.length > 0) {
      return transaction.items;
    }
    return [item];
  }, [transaction, item]);

  const activeAssetList = useMemo(() => {
    if (printScope === 'single' || txItems.length <= 1) {
      const singleAsset = item.confirmed_asset || item.asset || {};
      return [{
        item,
        asset: singleAsset,
        subdivision: getAssetSubdivision(singleAsset, item),
        lot_no: getAssetLotNo(singleAsset, item),
        area: singleAsset.area || item.details?.area || 0,
        owner_name: getAssetOwner(singleAsset, item),
        certificate_no: singleAsset.certificate_no || item.details?.certificate_no || '-',
        notes: item.decision_notes || item.notes || item.details?.notes || '',
      }];
    }

    return txItems.map((it: any) => {
      const ast = it.confirmed_asset || it.asset || {};
      return {
        item: it,
        asset: ast,
        subdivision: getAssetSubdivision(ast, it),
        lot_no: getAssetLotNo(ast, it),
        area: ast.area || it.details?.area || 0,
        owner_name: getAssetOwner(ast, it),
        certificate_no: ast.certificate_no || it.details?.certificate_no || '-',
        notes: it.decision_notes || it.notes || it.details?.notes || '',
      };
    });
  }, [printScope, txItems, item]);

  const txType = item.type || transaction?.type || 'checkout';
  const vType = getVoucherTypeFromTransaction(txType);

  const defaultVoucherCode = item.voucher_code || item.details?.voucherCode || transaction?.items?.find((i: any) => i.voucher_code)?.voucher_code || `${vType}${format(new Date(), 'yyMM')}-${Math.floor(100 + Math.random() * 900)}`;
  const defaultDateStr = item.decided_at || transaction?.created_at || new Date().toISOString();
  const createdDate = new Date(defaultDateStr);

  const defaultReceiverName = item.details?.receiverName || item.details?.department || transaction?.created_by?.full_name || 'Trần Thị Như Anh';
  const defaultReceiverDept = item.details?.department || (transaction?.created_by?.email?.includes('ptda') ? 'Ban PTDA' : item.details?.department || 'Ban Phát triển Dự án (PTDA)');
  const defaultReceiverAddress = item.details?.targetWarehouseName || warehouse?.name || 'Novotel';

  // Build specific, clear reason for V/v
  const buildSpecificReason = (): string => {
    const rawReason = item.details?.reason || item.details?.reissueReason || item.details?.splitNotes || transaction?.notes;
    if (rawReason && rawReason.trim()) {
      return rawReason;
    }

    const count = activeAssetList.length;
    const firstSub = activeAssetList[0]?.subdivision !== '-' ? activeAssetList[0]?.subdivision : '';
    const firstLot = activeAssetList[0]?.lot_no !== '-' ? `lô ${activeAssetList[0]?.lot_no}` : '';
    const targetLoc = firstSub || firstLot ? `(${[firstSub, firstLot].filter(Boolean).join(', ')})` : '';

    if (txType === 'checkout') {
      return `Bàn giao ${count} Giấy chứng nhận QSD đất ${targetLoc} cho Ban PTDA phục vụ công tác thủ tục sang tên & cấp đổi cho khách hàng`;
    }
    if (txType === 'checkin') {
      return `Bàn giao và tiếp nhận lưu kho ${count} Giấy chứng nhận QSD đất ${targetLoc} sau khi hoàn tất thủ tục cấp mới/thu hồi`;
    }
    if (txType === 'mortgage' || txType === 'mortgage_update') {
      return `Bàn giao ${count} Giấy chứng nhận QSD đất ${targetLoc} phục vụ hồ sơ thẩm định/đăng ký giao dịch bảo đảm ngân hàng`;
    }
    if (txType === 'split') {
      return `Bàn giao hồ sơ ${count} Giấy chứng nhận QSD đất ${targetLoc} thực hiện thủ tục tách/hợp thửa đất`;
    }
    return `Bàn giao ${count} Giấy chứng nhận QSD đất ${targetLoc} đi xử lý hồ sơ pháp lý`;
  };

  const defaultReason = buildSpecificReason();

  const defaultSenderName = item.decided_by?.full_name || transaction?.created_by?.full_name || 'Nguyễn Quốc Hùng';
  const defaultSenderDept = 'Ban Tài chính (BTC VMT)';
  const defaultSenderAddress = warehouse?.name || 'Novotel';

  // Editable Form State for Print Form
  const [docHeader, setDocHeader] = useState({
    companyName: 'TẬP ĐOÀN SUNGROUP',
    templateCode: 'Mẫu HC-09-BM04',
    title: 'BIÊN BẢN BÀN GIAO GIẤY CHỨNG NHẬN QSD ĐẤT',
    voucherNo: defaultVoucherCode,
    date: format(createdDate, 'dd/MM/yyyy'),
    // Receiver Info
    receiverName: defaultReceiverName,
    receiverDept: defaultReceiverDept,
    receiverAddress: defaultReceiverAddress,
    reason: defaultReason,
    // Sender Info
    senderName: defaultSenderName,
    senderDept: defaultSenderDept,
    senderAddress: defaultSenderAddress,
    warehouseName: warehouse?.name || 'Kho Trung tâm Novotel',
  });

  const totalArea = activeAssetList.reduce((sum, a) => sum + (Number(a.area) || 0), 0);

  // Handle standard browser print
  const handlePrint = () => {
    window.print();
  };

  // Handle Export Excel file matching the template exactly
  const handleExportExcel = () => {
    const wsData: any[][] = [];

    // Row 1: Company Name & Template Code
    wsData.push([docHeader.companyName, '', '', '', '', '', docHeader.templateCode]);
    wsData.push([]); // Empty row

    // Row 3: Title
    wsData.push(['', '', docHeader.title, '', '', '', '']);
    wsData.push([]);

    // Row 5: Voucher No & Date
    wsData.push(['', '', '', '', '', 'Chứng từ:', docHeader.voucherNo]);
    wsData.push(['', '', '', '', '', 'Ngày:', docHeader.date]);

    // Receiver & Sender Info
    wsData.push([
      'Người nhận:', docHeader.receiverName, '', 'Người giao:', docHeader.senderName, '', ''
    ]);
    wsData.push([
      'Đơn vị:', docHeader.receiverDept, '', 'Đơn vị:', docHeader.senderDept, '', ''
    ]);
    wsData.push([
      'Địa chỉ / Kho:', docHeader.receiverAddress, '', 'Địa chỉ / Kho:', docHeader.senderAddress, '', ''
    ]);
    wsData.push([
      'V/v:', docHeader.reason, '', '', '', '', ''
    ]);
    wsData.push([]); // Empty row

    // Table Header Row 1
    wsData.push(['STT', 'CHỦ SỞ HỮU', 'SỐ SỔ', 'PHÂN KHU', 'LÔ', 'DIỆN TÍCH', 'GHI CHÚ']);
    // Table Header Row 2 (Column letters)
    wsData.push(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    // Data rows
    activeAssetList.forEach((a, idx) => {
      wsData.push([
        idx + 1,
        a.owner_name,
        a.certificate_no || '-',
        a.subdivision || '-',
        a.lot_no || '-',
        Number(a.area) || 0,
        a.notes || '',
      ]);
    });

    // Summary Row
    wsData.push([
      'Tổng cộng',
      `${activeAssetList.length} sổ`,
      '',
      '',
      '',
      totalArea,
      '',
    ]);

    wsData.push([]); // Empty row
    wsData.push([]); // Empty row

    // Signatures
    wsData.push(['', 'Người nhận:', '', '', '', 'Người giao:', '']);
    wsData.push([]);
    wsData.push([]);
    wsData.push([]);
    wsData.push(['', docHeader.receiverName, '', '', '', docHeader.senderName, '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // STT
      { wch: 22 }, // Chủ sở hữu
      { wch: 20 }, // Số sổ
      { wch: 16 }, // Phân khu
      { wch: 12 }, // Lô
      { wch: 16 }, // Diện tích
      { wch: 24 }, // Ghi chú
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BienBanBanGiao');
    const fileName = `Bien_Ban_Ban_Giao_${docHeader.voucherNo.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* Modal Top Control Bar (Hidden on Print) */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0 print:hidden gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600 border border-amber-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  Biên bản bàn giao GCN QSD Đất
                </h3>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-100 text-blue-800 rounded">
                  {docHeader.voucherNo}
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded">
                  {docHeader.templateCode}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Mẫu chuẩn Sun Group & Ban Tài chính VMT · Kho: {docHeader.warehouseName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {txItems.length > 1 && (
              <div className="flex items-center bg-white border border-gray-300 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    printScope === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Tất cả ({txItems.length} sổ)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('single')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    printScope === 'single'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  1 sổ hiện tại
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                isEditing
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {isEditing ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {isEditing ? 'Xem trước' : 'Sửa nhanh'}
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              title="Tải file Excel đúng mẫu (.xlsx)"
            >
              <Download className="w-4 h-4" /> Xuất Excel
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" /> In biên bản (A4)
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Edit Drawer if enabled */}
        {isEditing && (
          <div className="p-4 bg-amber-50/70 border-b border-amber-200 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs shrink-0 print:hidden">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Tên Tập đoàn / Đơn vị chủ quản</label>
              <input
                type="text"
                value={docHeader.companyName}
                onChange={e => setDocHeader({ ...docHeader, companyName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Mã biểu mẫu</label>
              <input
                type="text"
                value={docHeader.templateCode}
                onChange={e => setDocHeader({ ...docHeader, templateCode: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Số chứng từ</label>
              <input
                type="text"
                value={docHeader.voucherNo}
                onChange={e => setDocHeader({ ...docHeader, voucherNo: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Ngày lập</label>
              <input
                type="text"
                value={docHeader.date}
                onChange={e => setDocHeader({ ...docHeader, date: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Người nhận</label>
              <input
                type="text"
                value={docHeader.receiverName}
                onChange={e => setDocHeader({ ...docHeader, receiverName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Đơn vị nhận</label>
              <input
                type="text"
                value={docHeader.receiverDept}
                onChange={e => setDocHeader({ ...docHeader, receiverDept: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Địa chỉ / Kho nhận</label>
              <input
                type="text"
                value={docHeader.receiverAddress}
                onChange={e => setDocHeader({ ...docHeader, receiverAddress: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>
            <div className="sm:col-span-3 lg:col-span-1">
              <label className="block font-semibold text-gray-700 mb-1">Trích yếu (V/v)</label>
              <textarea
                rows={2}
                value={docHeader.reason}
                onChange={e => setDocHeader({ ...docHeader, reason: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md italic"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Người giao</label>
              <input
                type="text"
                value={docHeader.senderName}
                onChange={e => setDocHeader({ ...docHeader, senderName: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Đơn vị giao</label>
              <input
                type="text"
                value={docHeader.senderDept}
                onChange={e => setDocHeader({ ...docHeader, senderDept: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">Địa chỉ / Kho xuất</label>
              <input
                type="text"
                value={docHeader.senderAddress}
                onChange={e => setDocHeader({ ...docHeader, senderAddress: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md"
              />
            </div>
          </div>
        )}

        {/* Printable A4 Preview Container */}
        <div className="overflow-y-auto p-4 sm:p-8 bg-gray-200/70 flex justify-center">
          <div
            ref={printRef}
            id="printable-voucher"
            className="w-full max-w-[210mm] bg-white text-gray-900 p-8 sm:p-10 shadow-xl print:shadow-none print:p-0 print:m-0 border border-gray-300 print:border-none"
            style={{
              minHeight: '297mm',
              fontFamily: '"Times New Roman", Times, serif, "Arial"',
            }}
          >
            {/* Header: Company Name & Template Form Code (Logo removed per user instruction) */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="font-bold text-base sm:text-lg tracking-tight uppercase text-gray-900">
                  {docHeader.companyName}
                </h2>
                <div className="text-xs text-gray-600 font-medium">
                  Ban Tài chính · Hệ thống Quản trị Giấy chứng nhận QSD Đất
                </div>
              </div>

              {/* Template Code */}
              <div className="text-right">
                <div className="font-bold italic text-sm sm:text-base text-gray-900 tracking-wide">
                  {docHeader.templateCode}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Kho: <strong className="text-gray-800">{docHeader.warehouseName}</strong>
                </div>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center my-6">
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-gray-900">
                {docHeader.title}
              </h1>
            </div>

            {/* Document Details & Parties Grid (2 Columns Exact Match) */}
            <div className="mb-6 text-xs sm:text-sm">
              {/* Row: Voucher Code & Date aligned to right */}
              <div className="flex justify-end mb-3 text-xs sm:text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-64 text-right">
                  <div className="font-bold text-gray-900">Chứng từ:</div>
                  <div className="font-mono font-bold text-gray-900">{docHeader.voucherNo}</div>
                  <div className="font-bold text-gray-900">Ngày:</div>
                  <div className="text-gray-900">{docHeader.date}</div>
                </div>
              </div>

              {/* 2-Column Info Table */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-b border-gray-300 py-3">
                {/* Left: Receiver */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Người nhận:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.receiverName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Đơn vị:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.receiverDept}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Địa chỉ:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.receiverAddress}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold italic text-gray-900">V/v:</span>
                    <span className="col-span-2 italic text-gray-800 leading-snug">{docHeader.reason}</span>
                  </div>
                </div>

                {/* Right: Sender */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Người giao:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.senderName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Đơn vị:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.senderDept}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="font-bold text-gray-900">Địa chỉ:</span>
                    <span className="col-span-2 text-gray-900">{docHeader.senderAddress}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Table matching HC-09-BM04 exact columns A to G */}
            <div className="mb-6 overflow-x-auto">
              <table className="w-full border-collapse border border-gray-900 text-xs sm:text-[13px]">
                <thead>
                  {/* Table Header Row 1 */}
                  <tr className="bg-gray-100 text-gray-900 font-bold text-center border-b border-gray-900">
                    <th className="border border-gray-900 px-2 py-2 w-12">STT</th>
                    <th className="border border-gray-900 px-3 py-2">CHỦ SỞ HỮU</th>
                    <th className="border border-gray-900 px-3 py-2">SỐ SỔ</th>
                    <th className="border border-gray-900 px-3 py-2">PHÂN KHU</th>
                    <th className="border border-gray-900 px-2 py-2 w-16">LÔ</th>
                    <th className="border border-gray-900 px-3 py-2 w-28">DIỆN TÍCH</th>
                    <th className="border border-gray-900 px-3 py-2">GHI CHÚ</th>
                  </tr>
                  {/* Table Header Row 2 (Columns Letters A-G) */}
                  <tr className="bg-gray-50 text-gray-700 font-semibold text-center text-[11px] border-b border-gray-900">
                    <th className="border border-gray-900 py-1">A</th>
                    <th className="border border-gray-900 py-1">B</th>
                    <th className="border border-gray-900 py-1">C</th>
                    <th className="border border-gray-900 py-1">D</th>
                    <th className="border border-gray-900 py-1">E</th>
                    <th className="border border-gray-900 py-1">F</th>
                    <th className="border border-gray-900 py-1">G</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAssetList.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="border border-gray-900 px-2 py-1.5 text-center font-medium">
                        {index + 1}
                      </td>
                      <td className="border border-gray-900 px-3 py-1.5 font-medium text-gray-900">
                        {row.owner_name}
                      </td>
                      <td className="border border-gray-900 px-3 py-1.5 text-center font-mono font-medium text-gray-900">
                        {row.certificate_no}
                      </td>
                      <td className="border border-gray-900 px-3 py-1.5 text-center font-semibold text-red-600 print:text-red-700">
                        {row.subdivision}
                      </td>
                      <td className="border border-gray-900 px-2 py-1.5 text-center font-medium text-red-600 print:text-red-700">
                        {row.lot_no}
                      </td>
                      <td className="border border-gray-900 px-3 py-1.5 text-right font-medium text-gray-900">
                        {row.area ? Number(row.area).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="border border-gray-900 px-3 py-1.5 text-gray-700 text-[11px]">
                        {row.notes}
                      </td>
                    </tr>
                  ))}

                  {/* Summary row */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-900">
                    <td colSpan={2} className="border border-gray-900 px-3 py-2 text-center uppercase">
                      Tổng cộng: {activeAssetList.length} sổ
                    </td>
                    <td colSpan={3} className="border border-gray-900 px-3 py-2 text-right">
                      Tổng diện tích:
                    </td>
                    <td className="border border-gray-900 px-3 py-2 text-right text-gray-900 font-bold">
                      {totalArea.toLocaleString('vi-VN')} m²
                    </td>
                    <td className="border border-gray-900 px-3 py-2 text-center text-xs text-gray-600">
                      Bản chính
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures Section matching Template */}
            <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs sm:text-sm">
              <div>
                <div className="italic font-bold text-gray-900">Người nhận:</div>
                <div className="h-28 flex items-end justify-center font-bold text-gray-900">
                  {docHeader.receiverName}
                </div>
              </div>

              <div>
                <div className="italic font-bold text-gray-900">Người giao:</div>
                <div className="h-28 flex items-end justify-center font-bold text-gray-900">
                  {docHeader.senderName}
                </div>
              </div>
            </div>

            {/* System Footer Note */}
            <div className="mt-12 pt-3 border-t border-gray-200 text-[10px] text-gray-400 flex items-center justify-between">
              <span>Hệ thống Quản lý Giấy chứng nhận QSD Đất — Tập đoàn Sun Group / BTC VMT</span>
              <span>Trích xuất: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
