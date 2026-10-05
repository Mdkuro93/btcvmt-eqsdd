import React from 'react';
import { InventoryAudit } from '../types';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { X, Printer, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  audit: InventoryAudit | null;
}

export const InventoryAuditPrintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  audit,
}) => {
  if (!isOpen || !audit) return null;

  const warehouseName = audit.warehouses?.name || audit.warehouse?.name || 'Kho VMT';
  const warehouseCode = audit.warehouses?.code || audit.warehouse?.code || '001';
  const performerName = (audit.performer as any)?.full_name || (audit.profiles as any)?.full_name || 'Quản lý kho';
  const startedDate = audit.started_at ? new Date(audit.started_at) : new Date();
  const completedDate = audit.completed_at ? new Date(audit.completed_at) : new Date();

  const items = audit.items || [];
  const matchedItems = items.filter(i => i.finding_status === 'matched');
  const misplacedItems = items.filter(i => i.finding_status === 'misplaced');
  const missingItems = items.filter(i => i.finding_status === 'missing');
  const surplusItems = items.filter(i => i.finding_status === 'surplus');

  const discrepancyItems = items.filter(i => i.finding_status === 'missing' || i.finding_status === 'misplaced' || i.finding_status === 'surplus');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        {/* Modal Action Bar (Hidden on Print) */}
        <div className="px-6 py-3.5 bg-gray-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">Xem Trước & In Biên Bản Kiểm Kê A4</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 mr-1.5" /> In Biên Bản (A4)
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area (Standard A4) */}
        <div className="p-8 md:p-12 overflow-y-auto print:overflow-visible print:p-8 font-serif text-gray-900 leading-relaxed text-sm bg-white">
          {/* Header Quốc hiệu Tiêu ngữ */}
          <div className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-300">
            <div>
              <p className="font-bold text-xs uppercase tracking-wider">CÔNG TY CỔ PHẦN TẬP ĐOÀN VMT</p>
              <p className="font-semibold text-xs text-gray-700">BAN TÀI CHÍNH & VẬN HÀNH KHO GCN</p>
              <p className="text-[11px] text-gray-600 italic">Số: BBKK-{warehouseCode}-{format(startedDate, 'yyyyMMdd')}</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-xs uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
              <p className="font-bold text-xs underline pb-1">Độc lập - Tự do - Hạnh phúc</p>
              <p className="text-[11px] italic text-gray-600 pt-1">
                Ngày {format(completedDate, 'dd')} tháng {format(completedDate, 'MM')} năm {format(completedDate, 'yyyy')}
              </p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center py-6">
            <h1 className="text-lg md:text-xl font-bold uppercase tracking-wide">
              BIÊN BẢN KIỂM KÊ HIỆN TRẠNG KHO GCN QUYỀN SỬ DỤNG ĐẤT
            </h1>
            <p className="text-xs text-gray-600 italic mt-1">
              (Địa điểm lưu kho: <strong className="font-semibold text-gray-800">{warehouseName}</strong>)
            </p>
          </div>

          {/* Body Section 1: Thời gian & Thành phần */}
          <div className="space-y-2 mb-5">
            <p>
              Hôm nay, vào hồi {format(startedDate, 'HH')} giờ {format(startedDate, 'mm')} phút, ngày {format(startedDate, 'dd/MM/yyyy', { locale: vi })}, Hội đồng kiểm kê tiến hành kiểm kê thực tế hiện trạng lưu trữ Giấy chứng nhận quyền sử dụng đất (GCN) và Tài sản đảm bảo tại <strong className="font-bold">{warehouseName}</strong>.
            </p>
            <p className="font-bold pt-1">I. THÀNH PHẦN HỘI ĐỒNG KIỂM KÊ:</p>
            <ol className="list-decimal pl-6 space-y-1 text-xs">
              <li>Ông/Bà: <strong className="font-semibold">{performerName}</strong> - Chức vụ: Trưởng Ban Kiểm Kê / Quản Lý Kho phụ trách.</li>
              <li>Ông/Bà: <strong className="font-semibold">Đại diện Ban Tài chính (BTC VMT)</strong> - Thành viên giám sát.</li>
              <li>Ông/Bà: <strong className="font-semibold">Thủ kho lưu trữ</strong> - Thành viên phụ trách bảo quản hồ sơ.</li>
            </ol>
          </div>

          {/* Body Section 2: Tổng hợp số liệu */}
          <div className="mb-5">
            <p className="font-bold mb-2">II. KẾT QUẢ ĐỐI SOÁT HIỆN TRẠNG LƯU KHO:</p>
            <table className="w-full border-collapse border border-gray-400 text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-800">
                  <th className="border border-gray-400 p-2 text-center w-12">STT</th>
                  <th className="border border-gray-400 p-2 text-left">Nội dung đối soát</th>
                  <th className="border border-gray-400 p-2 text-center w-28">Số lượng (GCN)</th>
                  <th className="border border-gray-400 p-2 text-left">Ghi chú đối soát</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-400 p-2 text-center">1</td>
                  <td className="border border-gray-400 p-2">Tổng số lượng GCN trên sổ sách dự kiến</td>
                  <td className="border border-gray-400 p-2 text-center font-bold">{audit.total_expected}</td>
                  <td className="border border-gray-400 p-2 text-gray-600">Dữ liệu kết xuất từ hệ thống</td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-2 text-center">2</td>
                  <td className="border border-gray-400 p-2">Số lượng GCN tìm thấy đúng vị trí lưu trữ</td>
                  <td className="border border-gray-400 p-2 text-center font-bold text-emerald-800">{matchedItems.length}</td>
                  <td className="border border-gray-400 p-2 text-emerald-800">Khớp hồ sơ và vị trí quy định</td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-2 text-center">3</td>
                  <td className="border border-gray-400 p-2">Số lượng GCN tìm thấy nhưng sai vị trí (lệch ngăn/kệ)</td>
                  <td className="border border-gray-400 p-2 text-center font-bold text-amber-800">{misplacedItems.length}</td>
                  <td className="border border-gray-400 p-2 text-amber-800">Đã đối chiếu và cập nhật vị trí mới</td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-2 text-center">4</td>
                  <td className="border border-gray-400 p-2">Số lượng GCN không tìm thấy (Khuyết thiếu / Thất lạc)</td>
                  <td className="border border-gray-400 p-2 text-center font-bold text-red-700">{missingItems.length}</td>
                  <td className="border border-gray-400 p-2 text-red-700 font-semibold">{missingItems.length > 0 ? 'Cần lập biên bản xác minh khẩn cấp' : 'Không có'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-2 text-center">5</td>
                  <td className="border border-gray-400 p-2">Số lượng GCN phát sinh thừa thực tế / Sai kho</td>
                  <td className="border border-gray-400 p-2 text-center font-bold text-purple-800">{surplusItems.length}</td>
                  <td className="border border-gray-400 p-2 text-purple-800">{surplusItems.length > 0 ? 'Phát hiện ngoài danh mục sổ sách' : 'Không có'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Body Section 3: Bảng chi tiết chênh lệch */}
          {discrepancyItems.length > 0 && (
            <div className="mb-5">
              <p className="font-bold mb-2">III. DANH MỤC CHI TIẾT HỒ SƠ PHÁT SINH CHÊNH LỆCH:</p>
              <table className="w-full border-collapse border border-gray-400 text-[11px]">
                <thead>
                  <tr className="bg-gray-100 text-gray-800">
                    <th className="border border-gray-400 p-1.5 text-center w-8">STT</th>
                    <th className="border border-gray-400 p-1.5 text-left">Số GCN / Mã TS</th>
                    <th className="border border-gray-400 p-1.5 text-left">Dự án / Lô</th>
                    <th className="border border-gray-400 p-1.5 text-center w-24">Tình trạng</th>
                    <th className="border border-gray-400 p-1.5 text-left">Vị trí dự kiến</th>
                    <th className="border border-gray-400 p-1.5 text-left">Vị trí thực tế</th>
                    <th className="border border-gray-400 p-1.5 text-left">Ghi chú hiện trạng</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancyItems.map((item, idx) => {
                    const a = item.asset;
                    let stText = 'Đúng vị trí';
                    let stColor = 'text-gray-800';
                    if (item.finding_status === 'missing') {
                      stText = 'Khuyết thiếu';
                      stColor = 'text-red-700 font-bold';
                    } else if (item.finding_status === 'misplaced') {
                      stText = 'Sai vị trí';
                      stColor = 'text-amber-800 font-semibold';
                    } else if (item.finding_status === 'surplus') {
                      stText = 'Phát sinh thừa';
                      stColor = 'text-purple-800 font-bold';
                    }

                    return (
                      <tr key={item.id}>
                        <td className="border border-gray-400 p-1 text-center">{idx + 1}</td>
                        <td className="border border-gray-400 p-1 font-bold">{a?.certificate_no || 'GCN Chưa rõ'}</td>
                        <td className="border border-gray-400 p-1">{a?.business_project_name || a?.projects?.name || '-'} ({a?.legal_lot_code || '-'})</td>
                        <td className={`border border-gray-400 p-1 text-center ${stColor}`}>{stText}</td>
                        <td className="border border-gray-400 p-1">{item.expected_location || '-'}</td>
                        <td className="border border-gray-400 p-1 font-semibold">{item.actual_location || (item.finding_status === 'missing' ? 'Không xác định' : '-')}</td>
                        <td className="border border-gray-400 p-1 text-gray-600">{item.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Body Section 4: Kết luận & Kiến nghị */}
          <div className="space-y-1 mb-8 text-xs">
            <p className="font-bold">IV. Ý KIẾN KẾT LUẬN & KIẾN NGHỊ:</p>
            <p>- Tình trạng niêm phong và bảo quản vật lý tại két/kho: Đảm bảo khô ráo, an toàn, tem niêm phong hợp lệ.</p>
            <p>- Ghi chú của đợt kiểm: {audit.notes || 'Không có phát sinh bất thường ngoài danh mục đã nêu.'}</p>
            <p>- Biên bản được lập thành 03 bản có giá trị pháp lý như nhau: 01 bản lưu tại Kho lưu trữ, 01 bản lưu Ban Tài chính, 01 bản nộp Ban Lãnh đạo Tập đoàn.</p>
          </div>

          {/* Chữ ký xác nhận */}
          <div className="grid grid-cols-3 gap-4 text-center text-xs pt-4">
            <div>
              <p className="font-bold uppercase">THỦ KHO LƯU TRỮ</p>
              <p className="text-[11px] italic text-gray-500">(Ký và ghi rõ họ tên)</p>
              <div className="h-20" />
            </div>
            <div>
              <p className="font-bold uppercase">ĐẠI DIỆN BAN TÀI CHÍNH</p>
              <p className="text-[11px] italic text-gray-500">(Ký và ghi rõ họ tên)</p>
              <div className="h-20" />
            </div>
            <div>
              <p className="font-bold uppercase">TRƯỞNG BAN KIỂM KÊ</p>
              <p className="text-[11px] italic text-gray-500">(Ký và ghi rõ họ tên)</p>
              <div className="h-20 flex items-end justify-center font-bold text-gray-800">
                {performerName}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryAuditPrintModal;
