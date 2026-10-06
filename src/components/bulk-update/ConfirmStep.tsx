import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, ArrowLeft, ArrowRight, ShieldCheck, FileText } from 'lucide-react';
import { BulkUpdateMode, BulkRowResult } from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  sourceFileName: string;
  results: BulkRowResult[];
  reason: string;
  onChangeReason: (val: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ConfirmStep: React.FC<Props> = ({
  selectedMode,
  sourceFileName,
  results,
  reason,
  onChangeReason,
  onPrev,
  onNext,
}) => {
  const config = BULK_MODES_CONFIG[selectedMode];

  const validRows = results.filter((r) => r.status === 'ok');
  const errorRows = results.filter((r) => r.status === 'error');
  const unchangedRows = results.filter((r) => r.status === 'unchanged');

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 10;
  const canProceed = validRows.length > 0 && isReasonValid;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Bước 5 / 6
            </span>
            <h2 className="text-base font-bold text-gray-900">
              Xác nhận thông tin & Nhập lý do thực hiện
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Kiểm tra lại số lượng tài sản sẽ được cập nhật và cung cấp lý do bắt buộc để ghi vết kiểm toán.
          </p>
        </div>

        {/* Bảng tóm tắt số lượng */}
        <div className="my-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-800 font-medium">Sẽ áp dụng thực thi</p>
              <p className="text-xl font-bold text-emerald-900 mt-0.5">
                {validRows.length.toLocaleString('vi-VN')} dòng
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center space-x-3">
            <div className="p-2.5 bg-gray-200 text-gray-700 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Không đổi (bỏ qua)</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {unchangedRows.length.toLocaleString('vi-VN')} dòng
              </p>
            </div>
          </div>

          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-3">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-lg">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-rose-800 font-medium">Dòng lỗi (bỏ qua)</p>
              <p className="text-xl font-bold text-rose-900 mt-0.5">
                {errorRows.length.toLocaleString('vi-VN')} dòng
              </p>
            </div>
          </div>
        </div>

        {/* Cảnh báo nếu có dòng lỗi */}
        {errorRows.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 leading-relaxed">
              <p className="font-bold">
                Lưu ý: Có {errorRows.length.toLocaleString('vi-VN')} dòng dữ liệu không hợp lệ
              </p>
              <p className="mt-1 text-amber-900">
                Hệ thống sẽ <b>bỏ qua các dòng lỗi</b> và chỉ thực hiện cập nhật cho{' '}
                <b>{validRows.length.toLocaleString('vi-VN')} dòng hợp lệ</b>. Nếu bạn muốn cập nhật toàn bộ, hãy quay lại bước trước, tải báo cáo lỗi và sửa lại file Excel.
              </p>
            </div>
          </div>
        )}

        {/* Thông tin nghiệp vụ & file */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Chế độ thực hiện:</span>
            <span className="font-bold text-gray-900">{config.title}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Tên file nguồn:</span>
            <span className="font-mono text-gray-800">{sourceFileName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-medium">Hành động:</span>
            <span className="text-gray-800">
              {selectedMode === 'reissue'
                ? 'Tạo các hồ sơ cấp đổi ở trạng thái chờ duyệt (status = pending)'
                : 'Cập nhật trực tiếp vào bảng assets và ghi 1 dòng audit_logs cho mỗi GCN'}
            </span>
          </div>
        </div>

        {/* Ô nhập lý do bắt buộc */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="bulk-reason" className="block text-xs font-bold text-gray-900">
              Lý do thực hiện <span className="text-rose-500">*</span>
            </label>
            <span
              className={`text-xs font-mono font-medium ${
                isReasonValid ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {trimmedReason.length} / 10 ký tự tối thiểu
            </span>
          </div>

          <textarea
            id="bulk-reason"
            rows={3}
            value={reason}
            onChange={(e) => onChangeReason(e.target.value)}
            placeholder="Nhập lý do cập nhật/cấp đổi (ví dụ: Cập nhật diện tích theo biên bản đo vẽ mới số 123/UBND...)"
            className={`w-full p-3 border rounded-xl text-xs focus:ring-1 transition-all ${
              trimmedReason.length > 0 && !isReasonValid
                ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 bg-amber-50/20'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
          />

          <div className="flex items-start space-x-1.5 text-[11px] text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>
              Lý do này là bắt buộc (tối thiểu 10 ký tự) và sẽ được ghi vào nhật ký hệ thống (activity_logs) và vết kiểm toán (audit_logs).
            </span>
          </div>
        </div>

        {/* Nút điều hướng */}
        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại xem trước</span>
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
            <span>Xác nhận & Áp dụng ({validRows.length.toLocaleString('vi-VN')} dòng)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
