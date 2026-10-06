import React, { useState, useMemo } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Search,
  Download,
  ArrowLeft,
  ArrowRight,
  Loader2,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { BulkUpdateMode, BulkRowResult } from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG, formatRowChanges, exportPreviewReport } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  sourceFileName: string;
  results: BulkRowResult[];
  isPreviewing: boolean;
  previewProgress: { current: number; total: number };
  onPrev: () => void;
  onNext: () => void;
}

type FilterStatus = 'all' | 'ok' | 'warning' | 'unchanged' | 'error';

export const PreviewStep: React.FC<Props> = ({
  selectedMode,
  sourceFileName,
  results,
  isPreviewing,
  previewProgress,
  onPrev,
  onNext,
}) => {
  const config = BULK_MODES_CONFIG[selectedMode];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Thống kê số lượng
  const stats = useMemo(() => {
    let ok = 0;
    let warning = 0;
    let unchanged = 0;
    let error = 0;

    for (const r of results) {
      if (r.status === 'error') {
        error++;
      } else if (r.status === 'unchanged') {
        unchanged++;
      } else {
        ok++;
        if (r.message && r.message.startsWith('Cảnh báo')) {
          warning++;
        }
      }
    }

    return { total: results.length, ok, warning, unchanged, error };
  }, [results]);

  // Lọc dữ liệu
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // 1. Lọc theo trạng thái
      if (statusFilter === 'ok' && r.status !== 'ok') return false;
      if (statusFilter === 'unchanged' && r.status !== 'unchanged') return false;
      if (statusFilter === 'error' && r.status !== 'error') return false;
      if (statusFilter === 'warning') {
        const isWarn = r.message && r.message.startsWith('Cảnh báo');
        if (!isWarn) return false;
      }

      // 2. Tìm kiếm theo mã tài sản
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const code = (r.assetCode || '').toLowerCase();
        const msg = (r.message || '').toLowerCase();
        if (!code.includes(q) && !msg.includes(q)) return false;
      }

      return true;
    });
  }, [results, statusFilter, searchTerm]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, currentPage]);

  const handleExport = () => {
    exportPreviewReport(selectedMode, results, sourceFileName);
  };

  const isReissue = selectedMode === 'reissue';
  const canProceed = !isPreviewing && stats.ok > 0;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Tiêu đề & nút xuất báo cáo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Bước 4 / 6
              </span>
              <h2 className="text-base font-bold text-gray-900">
                Xem trước kết quả kiểm tra ({config.title})
              </h2>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Máy chủ đối soát toàn bộ dòng dữ liệu (chế độ xem trước không ghi vào CSDL).
            </p>
          </div>

          <button
            type="button"
            disabled={isPreviewing || results.length === 0}
            onClick={handleExport}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Tải báo cáo xem trước (.xlsx)</span>
          </button>
        </div>

        {/* Thanh tiến độ khi đang gọi RPC */}
        {isPreviewing && (
          <div className="my-6 p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Đang kiểm tra dữ liệu qua máy chủ...</span>
              </span>
              <span>
                {previewProgress.current.toLocaleString('vi-VN')} / {previewProgress.total.toLocaleString('vi-VN')} dòng (
                {previewProgress.total > 0
                  ? Math.round((previewProgress.current / previewProgress.total) * 100)
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#1E3A8A] h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    previewProgress.total > 0
                      ? Math.round((previewProgress.current / previewProgress.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-[11px] text-blue-700 italic">
              Đang chia theo các lô 500 dòng và kiểm tra độc lập để đảm bảo an toàn hiệu năng.
            </p>
          </div>
        )}

        {/* Thẻ tổng hợp số liệu */}
        {!isPreviewing && (
          <div className="my-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div
              onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                statusFilter === 'all'
                  ? 'border-gray-800 bg-gray-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="text-xs text-gray-500 font-medium">Tổng dòng</div>
              <div className="text-xl font-bold text-gray-900 mt-0.5">
                {stats.total.toLocaleString('vi-VN')}
              </div>
            </div>

            <div
              onClick={() => { setStatusFilter('ok'); setCurrentPage(1); }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                statusFilter === 'ok'
                  ? 'border-emerald-600 bg-emerald-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-medium">Hợp lệ</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-emerald-700 mt-0.5">
                {stats.ok.toLocaleString('vi-VN')}
              </div>
            </div>

            <div
              onClick={() => { setStatusFilter('warning'); setCurrentPage(1); }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                statusFilter === 'warning'
                  ? 'border-amber-600 bg-amber-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-700 font-medium">Cảnh báo</span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-700 mt-0.5">
                {stats.warning.toLocaleString('vi-VN')}
              </div>
            </div>

            <div
              onClick={() => { setStatusFilter('unchanged'); setCurrentPage(1); }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                statusFilter === 'unchanged'
                  ? 'border-gray-600 bg-gray-100 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 font-medium">Không đổi</span>
                <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <div className="text-xl font-bold text-gray-600 mt-0.5">
                {stats.unchanged.toLocaleString('vi-VN')}
              </div>
            </div>

            <div
              onClick={() => { setStatusFilter('error'); setCurrentPage(1); }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                statusFilter === 'error'
                  ? 'border-rose-600 bg-rose-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-rose-700 font-medium">Lỗi</span>
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="text-xl font-bold text-rose-700 mt-0.5">
                {stats.error.toLocaleString('vi-VN')}
              </div>
            </div>
          </div>
        )}

        {/* Tìm kiếm & Thanh công cụ */}
        {!isPreviewing && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm mã tài sản hoặc nội dung..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="text-xs text-gray-500 self-end sm:self-center">
              Hiển thị {pageRows.length} / {filteredResults.length} dòng
            </div>
          </div>
        )}

        {/* Bảng chi tiết kết quả */}
        {!isPreviewing && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-16">Dòng</th>
                    <th className="py-2.5 px-3 w-36">
                      {isReissue ? 'Mã GCN cũ' : 'Mã tài sản'}
                    </th>
                    <th className="py-2.5 px-3 w-44">Dự án (theo file)</th>
                    <th className="py-2.5 px-3 w-28">Trạng thái</th>
                    <th className="py-2.5 px-3">Thông báo</th>
                    <th className="py-2.5 px-3 w-72">
                      {isReissue ? 'Hành động' : 'Thay đổi (cũ → mới)'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 text-xs">
                        Không tìm thấy dòng nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => {
                      const isWarn = r.message && r.message.startsWith('Cảnh báo');
                      const isDupUnconfirmed = r.message && r.message.includes('DUPLICATE_UNCONFIRMED');
                      const isProjectMismatch = r.message && (
                        r.message.startsWith('Tên dự án không khớp') ||
                        r.message.startsWith('Mã dự án không khớp') ||
                        r.message.startsWith('GCN này chưa gắn dự án') ||
                        r.message.includes('Tên dự án không khớp') ||
                        r.message.includes('Mã dự án không khớp') ||
                        r.message.includes('chưa gắn dự án')
                      );
                      const changes = formatRowChanges(r.changes);

                      return (
                        <tr
                          key={r.row}
                          className={`hover:bg-gray-50/70 transition-colors ${
                            r.status === 'error'
                              ? 'bg-rose-50/20'
                              : isWarn
                              ? 'bg-amber-50/20'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-medium text-gray-500">
                            #{r.row}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                            {r.assetCode}
                          </td>
                          <td className={`py-2.5 px-3 text-xs ${
                            isProjectMismatch
                              ? 'bg-amber-100 text-amber-900 font-semibold'
                              : 'text-gray-800'
                          }`}>
                            {r.projectName || <span className="text-gray-400 italic">(trống)</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.status === 'ok' && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />
                                <span>Hợp lệ</span>
                              </span>
                            )}
                            {r.status === 'unchanged' && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                <span>Không đổi</span>
                              </span>
                            )}
                            {r.status === 'error' && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" />
                                <span>Lỗi</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="space-y-1">
                              <p
                                className={`leading-relaxed ${
                                  r.status === 'error'
                                    ? 'text-rose-700 font-medium'
                                    : isWarn
                                    ? 'text-amber-800 font-medium'
                                    : 'text-gray-700'
                                }`}
                              >
                                {r.message}
                              </p>

                              {/* Nhắc nhở nếu lỗi là DUPLICATE_UNCONFIRMED */}
                              {isDupUnconfirmed && (
                                <div className="inline-flex items-center space-x-1 text-[11px] text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                  <ShieldAlert className="w-3 h-3 text-amber-700" />
                                  <span>Cần điền duplicate_ack_reason (≥ 10 ký tự)</span>
                                </div>
                              )}

                              {/* Nhắc nhở nếu lỗi liên quan đến sai lệch dự án */}
                              {isProjectMismatch && (
                                <div className="inline-flex items-center space-x-1 text-[11px] text-rose-900 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                  <AlertTriangle className="w-3 h-3 text-rose-700" />
                                  <span>Tên dự án chưa khớp với hệ thống</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 font-mono text-[11px]">
                            {isReissue ? (
                              <span className="text-blue-700 font-sans">
                                Tạo hồ sơ cấp đổi (chờ duyệt)
                              </span>
                            ) : changes.length > 0 ? (
                              <div className="space-y-0.5">
                                {changes.map((c, i) => (
                                  <div key={i} className="text-gray-800">
                                    • {c}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Không thay đổi</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Phân trang */}
            {totalPages > 1 && (
              <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                <span>
                  Trang {currentPage} / {totalPages} (tổng {filteredResults.length} dòng)
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
        )}

        {/* Nút điều hướng */}
        <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            disabled={isPreviewing}
            onClick={onPrev}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại: Tải file khác</span>
          </button>

          <button
            type="button"
            disabled={!canProceed}
            onClick={onNext}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center space-x-2 transition-colors ${
              canProceed
                ? 'bg-[#1E3A8A] hover:bg-blue-800 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>Tiếp tục: Xác nhận & Áp dụng ({stats.ok.toLocaleString('vi-VN')} dòng hợp lệ)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
