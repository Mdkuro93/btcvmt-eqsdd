import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RotateCcw,
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BulkUpdateMode, BulkRowResult } from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG, exportExecutionReport } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  sourceFileName: string;
  isApplying: boolean;
  applyProgress: { current: number; total: number };
  executedResults: BulkRowResult[];
  abortedInfo?: { abortedAt: number; abortMessage: string } | null;
  hasUncertainRows?: boolean;
  onReset: () => void;
}

export const ExecutionStep: React.FC<Props> = ({
  selectedMode,
  sourceFileName,
  isApplying,
  applyProgress,
  executedResults,
  abortedInfo,
  hasUncertainRows,
  onReset,
}) => {
  const navigate = useNavigate();
  const config = BULK_MODES_CONFIG[selectedMode];
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const successRows = executedResults.filter(
    (r) => r.status === 'applied' || r.status === 'created' || r.status === 'ok'
  );
  const failedRows = executedResults.filter((r) => r.status === 'error');

  const totalPages = Math.max(1, Math.ceil(executedResults.length / pageSize));
  const currentRows = executedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    exportExecutionReport(selectedMode, executedResults, sourceFileName);
  };

  const isReissue = selectedMode === 'reissue';
  const isCreate = selectedMode === 'create';

  const hasProjectError = isCreate && executedResults.some((r) => {
    if (r.status !== 'error') return false;
    const m = (r.message || '').toLowerCase();
    return (
      m.includes('dự án') ||
      m.includes('địa bàn') ||
      m.includes('mã vùng') ||
      m.includes('mã tỉnh') ||
      m.includes('vùng')
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Tiêu đề */}
        <div className="pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Bước 6 / 6
            </span>
            <h2 className="text-base font-bold text-gray-900">
              {isApplying ? 'Đang thực thi áp dụng...' : 'Kết quả thực thi áp dụng'}
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {isApplying
              ? 'Hệ thống đang ghi dữ liệu vào CSDL theo từng lô 500 dòng...'
              : `Hoàn tất quá trình cập nhật hàng loạt cho chế độ «${config.title}».`}
          </p>
        </div>

        {/* Trạng thái đang chạy */}
        {isApplying && (
          <div className="my-8 p-6 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span className="flex items-center space-x-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span>Đang ghi nhận thay đổi vào CSDL...</span>
              </span>
              <span>
                {applyProgress.current.toLocaleString('vi-VN')} / {applyProgress.total.toLocaleString('vi-VN')} dòng (
                {applyProgress.total > 0
                  ? Math.round((applyProgress.current / applyProgress.total) * 100)
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-[#1E3A8A] h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    applyProgress.total > 0
                      ? Math.round((applyProgress.current / applyProgress.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-blue-700">
              Vui lòng không tắt hoặc tải lại trang trong khi hệ thống đang xử lý.
            </p>
          </div>
        )}

        {/* Trạng thái đã xong */}
        {!isApplying && executedResults.length > 0 && (
          <div className="my-6 space-y-6">
            {/* Banner dừng giữa chừng (C.1) */}
            {abortedInfo && (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-start space-x-3 text-rose-950">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-rose-900">
                    Đã dừng sau {Math.max(0, abortedInfo.abortedAt - 1)} / {applyProgress.total} dòng: {abortedInfo.abortMessage}
                  </p>
                  <p className="mt-0.5 text-rose-800">
                    Các dòng đã áp dụng ở trên là THẬT; các dòng còn lại chưa được xử lý.
                  </p>
                </div>
              </div>
            )}

            {/* Banner cảnh báo không xác định / timeout (C.2) */}
            {hasUncertainRows && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-3 text-amber-950">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-amber-900">
                    Cảnh báo: Có dòng kết quả không xác định (máy chủ chưa phản hồi do hết thời gian chờ hoặc mạng gián đoạn)
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Thay đổi có thể đã được áp dụng. Hãy chạy lại Xem trước với cùng file để kiểm tra (dòng đã áp dụng sẽ hiện &quot;Không có thay đổi&quot; hoặc &quot;đã có hồ sơ chờ duyệt&quot;), TUYỆT ĐỐI không áp dụng lại ngay để tránh trùng lặp.
                  </p>
                </div>
              </div>
            )}

            {/* Banner kết quả chung */}
            <div
              className={`p-5 rounded-xl border flex items-start space-x-4 ${
                failedRows.length === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : successRows.length > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              {failedRows.length === 0 ? (
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <CheckCircle className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <XCircle className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-sm font-bold">
                  {failedRows.length === 0
                    ? 'Thực thi thành công 100%!'
                    : `Thực thi hoàn tất với ${failedRows.length} dòng chưa thành công.`}
                </h3>
                <p className="text-xs mt-1 leading-relaxed opacity-90">
                  {isReissue
                    ? `Đã tạo thành công ${successRows.length.toLocaleString('vi-VN')} hồ sơ cấp đổi ở trạng thái chờ duyệt. GCN mới sẽ được tạo sau khi được duyệt tại màn hình Quản lý Yêu cầu.`
                    : `Đã áp dụng thay đổi thành công cho ${successRows.length.toLocaleString('vi-VN')} GCN và lưu vết kiểm toán đầy đủ.`}
                </p>
              </div>

              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-sm transition-colors flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Tải báo cáo kết quả (.xlsx)</span>
              </button>
            </div>

            {/* Thẻ thống kê */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="text-xs text-gray-500 font-medium">Tổng thực thi</div>
                <div className="text-xl font-bold text-gray-900 mt-0.5">
                  {executedResults.length.toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-xs text-emerald-700 font-medium">Thành công</div>
                <div className="text-xl font-bold text-emerald-700 mt-0.5">
                  {successRows.length.toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="text-xs text-rose-700 font-medium">Chưa xong / Lỗi</div>
                <div className="text-xl font-bold text-rose-700 mt-0.5">
                  {failedRows.length.toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-xs text-blue-700 font-medium">Tỷ lệ thành công</div>
                <div className="text-xl font-bold text-blue-900 mt-0.5">
                  {executedResults.length > 0
                    ? Math.round((successRows.length / executedResults.length) * 100)
                    : 0}
                  %
                </div>
              </div>
            </div>

            {/* Bảng chi tiết kết quả từng dòng */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[380px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-16">Dòng</th>
                      <th className="py-2.5 px-3 w-36">
                        {isCreate ? 'Số GCN' : isReissue ? 'Mã GCN cũ' : 'Mã tài sản'}
                      </th>
                      <th className="py-2.5 px-3 w-44">Dự án (theo file)</th>
                      <th className="py-2.5 px-3 w-28">Kết quả</th>
                      <th className="py-2.5 px-3">Thông báo</th>
                      {isCreate && <th className="py-2.5 px-3 w-44">Mã TS / Phiếu nhập</th>}
                      {isReissue && <th className="py-2.5 px-3 w-72">Mã hồ sơ (ID)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {currentRows.map((r) => {
                      const isSuccess =
                        r.status === 'applied' || r.status === 'created' || r.status === 'ok';
                      const isProjectMismatch = r.message && (
                        r.message.startsWith('Tên dự án không khớp') ||
                        r.message.startsWith('Mã dự án không khớp') ||
                        r.message.startsWith('GCN này chưa gắn dự án') ||
                        r.message.includes('Tên dự án không khớp') ||
                        r.message.includes('Mã dự án không khớp') ||
                        r.message.includes('chưa gắn dự án')
                      );

                      return (
                        <tr
                          key={r.row}
                          className={`hover:bg-gray-50/70 ${
                            !isSuccess ? 'bg-rose-50/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-gray-500">#{r.row}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                            {isCreate ? (r.certificateNo || r.assetCode) : r.assetCode}
                          </td>
                          <td className={`py-2.5 px-3 text-xs ${
                            isProjectMismatch
                              ? 'bg-amber-100 text-amber-900 font-semibold'
                              : 'text-gray-800'
                          }`}>
                            {r.projectName || <span className="text-gray-400 italic">(trống)</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            {isSuccess ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />
                                <span>Thành công</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" />
                                <span>Chưa xong</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700">{r.message}</td>
                          {isCreate && (
                            <td className="py-2.5 px-3 font-mono text-[11px] text-teal-800 font-bold">
                              {r.assetCode !== '-' ? r.assetCode : ''}
                              {r.voucherCode ? ` · ${r.voucherCode}` : ''}
                            </td>
                          )}
                          {isReissue && (
                            <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600">
                              {r.requestId || '-'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              {totalPages > 1 && (
                <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Trang {currentPage} / {totalPages} (tổng {executedResults.length} dòng)
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Khung ghi chú khi có lỗi dự án (Prompt 19 Mục 3) */}
            {hasProjectError && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3 text-amber-950 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900">
                    Lưu ý xử lý lỗi Dự án / Mã vùng / Mã tỉnh:
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Dòng lỗi KHÔNG được tạo. Sửa tên dự án trong file rồi nhập lại các dòng này, hoặc nhờ quản trị cấu hình mã tại Danh mục. Hệ thống KHÔNG tự suy dự án hay mã từ kho.
                  </p>
                </div>
              </div>
            )}

            {/* Hướng dẫn khi tạo thành công (Prompt 19 Mục 3) */}
            {isCreate && successRows.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3 text-blue-950 text-xs">
                <HelpCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-blue-900">Hướng dẫn sau khi thêm mới GCN:</p>
                  <p className="mt-1 leading-relaxed">
                    Nếu phát hiện đã nhập nhầm dự án hoặc loại tài sản sau khi tạo: mở chi tiết GCN &gt; Tái cấp mã. Nhập nhầm kho: dùng Chuyển kho hoặc Luân chuyển kho.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nút hành động sau khi hoàn tất */}
        {!isApplying && executedResults.length > 0 && (
          <div className="mt-8 pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onReset}
              className="w-full sm:w-auto px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thực hiện đợt mới</span>
            </button>

            <div className="w-full sm:w-auto flex items-center space-x-3">
              {isReissue ? (
                <button
                  type="button"
                  onClick={() => navigate('/requests')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>Chuyển tới duyệt hồ sơ</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/assets')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>Xem danh sách GCN</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
