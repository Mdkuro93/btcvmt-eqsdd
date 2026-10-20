import React from 'react';
import { InventoryAuditItem } from '../../types';
import { format } from 'date-fns';
import { SlidersHorizontal } from 'lucide-react';

interface Props {
  warehouseName: string;
  warehouseCode: string;
  startedDate: Date;
  items: InventoryAuditItem[];
  displayedItems: InventoryAuditItem[];
  discrepancyCount: number;
  matchedCount: number;
  filterMode: 'all' | 'discrepancy' | 'matched';
  onFilterChange: (mode: 'all' | 'discrepancy' | 'matched') => void;
  performerName: string;
}

export const AuditPrintAppendix: React.FC<Props> = ({
  warehouseName,
  warehouseCode,
  startedDate,
  items,
  displayedItems,
  discrepancyCount,
  matchedCount,
  filterMode,
  onFilterChange,
  performerName,
}) => {
  return (
    <div
      className="page-break-before pt-6 print:pt-4"
      style={{
        pageBreakBefore: 'always',
        breakBefore: 'page',
      }}
    >
      {/* Tiêu đề Bảng Phụ Lục (Đồng bộ chuẩn TẬP ĐOÀN SUNGROUP) */}
      <div className="text-center pb-4 mb-4 border-b border-gray-400">
        <p className="text-[12px] font-bold uppercase tracking-wider text-gray-700">
          TẬP ĐOÀN SUNGROUP - KHO: {warehouseName.toUpperCase()}
        </p>
        <h2 className="text-[16px] md:text-[18px] font-bold uppercase tracking-wide text-gray-950 mt-1">
          PHỤ LỤC: BẢNG KÊ CHI TIẾT HIỆN TRẠNG TỪNG GIẤY CHỨNG NHẬN
        </h2>
        <p className="text-[11px] text-gray-700 italic mt-0.5">
          (Kèm theo Biên bản kiểm kê số: <strong>BBKK-{warehouseCode}-{format(startedDate, 'yyyyMMdd')}</strong>)
        </p>
      </div>

      {/* Bộ lọc xem trước (chỉ hiện trên màn hình, ẩn khi in) */}
      <div className="flex items-center justify-between gap-3 mb-3 print:hidden text-xs bg-slate-100 p-2.5 rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Bộ lọc xem danh sách:</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            Tất cả ({items.length})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('discrepancy')}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'discrepancy'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-amber-800 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            Chênh lệch ({discrepancyCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('matched')}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'matched'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-white text-emerald-800 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            Khớp đúng ({matchedCount})
          </button>
        </div>
      </div>

      {/* Bảng Chi Tiết Từng GCN */}
      <table className="w-full border-collapse border border-gray-700 text-[11px] leading-tight">
        <thead>
          <tr className="bg-gray-100 text-gray-900">
            <th className="border border-gray-600 p-1.5 text-center w-8 font-bold">STT</th>
            <th className="border border-gray-600 p-1.5 text-left font-bold w-36">Số GCN / Mã TS</th>
            <th className="border border-gray-600 p-1.5 text-left font-bold">Dự án / Khu vực / Lô</th>
            <th className="border border-gray-600 p-1.5 text-left font-bold w-28">Vị trí hệ thống</th>
            <th className="border border-gray-600 p-1.5 text-left font-bold w-28">Vị trí thực tế</th>
            <th className="border border-gray-600 p-1.5 text-center font-bold w-24">Trạng thái</th>
            <th className="border border-gray-600 p-1.5 text-left font-bold w-36">Ghi chú đối soát</th>
          </tr>
        </thead>
        <tbody>
          {displayedItems.length === 0 ? (
            <tr>
              <td colSpan={7} className="border border-gray-500 p-4 text-center text-gray-500 italic">
                Không có dữ liệu phù hợp với bộ lọc hiển thị.
              </td>
            </tr>
          ) : (
            displayedItems.map((item, idx) => {
              const a = item.asset;
              let statusText = 'Khớp vị trí';
              let statusStyle = 'text-emerald-800 font-semibold';

              if (item.finding_status === 'missing') {
                statusText = 'Thất lạc / Thiếu';
                statusStyle = 'text-red-700 font-bold';
              } else if (item.finding_status === 'misplaced') {
                statusText = 'Lệch vị trí';
                statusStyle = 'text-amber-800 font-bold';
              } else if (item.finding_status === 'surplus') {
                statusText = 'Phát sinh thừa';
                statusStyle = 'text-purple-800 font-bold';
              } else if (item.finding_status === 'pending') {
                statusText = 'Chưa kiểm kê';
                statusStyle = 'text-gray-600 italic';
              }

              // Tên dự án / phân khu / lô
              const projectName = a?.business_project_name || a?.projects?.name || '-';
              const lotInfo = [
                a?.legal_lot_code ? `Lô: ${a.legal_lot_code}` : null,
                a?.land_lot_no ? `Thửa: ${a.land_lot_no}` : null,
                a?.map_sheet_no ? `Tờ: ${a.map_sheet_no}` : null,
              ].filter(Boolean).join(' · ');

              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="border border-gray-500 p-1 text-center font-semibold">{idx + 1}</td>
                  <td className="border border-gray-500 p-1">
                    <span className="font-bold text-gray-950 block">
                      {a?.certificate_no || 'Chưa rõ số GCN'}
                    </span>
                    {a?.asset_code && (
                      <span className="text-[10px] text-gray-500 font-mono block">
                        [{a.asset_code}]
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-500 p-1">
                    <span className="font-medium text-gray-900 block">{projectName}</span>
                    {lotInfo && <span className="text-[10px] text-gray-600 block">{lotInfo}</span>}
                  </td>
                  <td className="border border-gray-500 p-1 text-gray-800">
                    {item.expected_location || 'Kho tiêu chuẩn'}
                  </td>
                  <td className="border border-gray-500 p-1 font-semibold text-gray-900">
                    {item.finding_status === 'missing'
                      ? 'Không xác định'
                      : item.actual_location || item.expected_location || '-'}
                  </td>
                  <td className={`border border-gray-500 p-1 text-center ${statusStyle}`}>
                    {statusText}
                  </td>
                  <td className="border border-gray-500 p-1 text-gray-700 text-[10.5px]">
                    {item.note || '-'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Chân trang Phụ Lục Kèm Chữ Ký */}
      <div className="avoid-break-inside pt-6 mt-4 flex items-start justify-between text-center text-[12px]">
        <div className="w-1/3">
          <p className="font-bold uppercase text-[11px] text-gray-950">THỦ KHO LƯU TRỮ</p>
          <p className="text-[10px] italic text-gray-500">(Ký và xác nhận danh mục)</p>
          <div className="h-16" />
        </div>
        <div className="w-1/3">
          <p className="font-bold uppercase text-[11px] text-gray-950">ĐẠI DIỆN BAN QUẢN LÝ TÀI CHÍNH</p>
          <p className="text-[10px] italic text-gray-500">(Ký và giám sát đối chiếu)</p>
          <div className="h-16" />
        </div>
        <div className="w-1/3">
          <p className="font-bold uppercase text-[11px] text-gray-950">TRƯỞNG BAN KIỂM KÊ</p>
          <p className="text-[10px] italic text-gray-500">(Ký duyệt bảng kê phụ lục)</p>
          <div className="h-16" />
          <p className="font-bold text-[12px] text-gray-900">{performerName}</p>
        </div>
      </div>
    </div>
  );
};
