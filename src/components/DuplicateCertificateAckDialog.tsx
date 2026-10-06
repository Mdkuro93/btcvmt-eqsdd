import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  X,
  Loader2,
  Sparkles,
  FileText
} from 'lucide-react';

export interface DuplicateAckItem {
  requestId: string;
  certificateNo: string;
  projectName?: string;
  message?: string;
}

export interface DuplicateCertificateAckDialogProps {
  isOpen: boolean;
  items: DuplicateAckItem[];
  isSubmitting?: boolean;
  onConfirm: (reasons: Record<string, string>) => void;
  onCancel: () => void;
}

export const DuplicateCertificateAckDialog: React.FC<DuplicateCertificateAckDialogProps> = ({
  isOpen,
  items,
  isSubmitting = false,
  onConfirm,
  onCancel,
}) => {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [commonReason, setCommonReason] = useState<string>('');

  // Reset reasons when dialog opens or items change
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      items.forEach((it) => {
        initial[it.requestId] = '';
      });
      setReasons(initial);
      setCommonReason('');
    }
  }, [isOpen, items]);

  // Handle ESC key to cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen || items.length === 0) return null;

  const handleReasonChange = (requestId: string, value: string) => {
    setReasons((prev) => ({
      ...prev,
      [requestId]: value,
    }));
  };

  const handleApplyCommon = () => {
    const val = commonReason.trim();
    if (!val) return;
    const updated: Record<string, string> = {};
    items.forEach((it) => {
      updated[it.requestId] = commonReason;
    });
    setReasons(updated);
  };

  const allValid =
    items.length > 0 &&
    items.every((it) => (reasons[it.requestId] || '').trim().length >= 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid || isSubmitting) return;

    const trimmedReasons: Record<string, string> = {};
    items.forEach((it) => {
      trimmedReasons[it.requestId] = (reasons[it.requestId] || '').trim();
    });

    onConfirm(trimmedReasons);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Xác nhận phê duyệt hồ sơ trùng số GCN
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {items.length === 1
                  ? 'Hồ sơ có số GCN trùng với tài sản đã có trong hệ thống.'
                  : `Có ${items.length} hồ sơ trùng số GCN cần xác nhận lý do trước khi duyệt.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white/80 rounded-lg transition-colors disabled:opacity-50"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Cảnh báo bảo mật / ghi nhận */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lưu ý quan trọng:</p>
              <p className="mt-0.5 leading-relaxed text-amber-800">
                Thao tác này ghi nhận người xác nhận và thời điểm trên GCN. Chỉ xác nhận khi cơ quan cấp có thẩm quyền cấp trùng số và đã đối chiếu thực tế.
              </p>
            </div>
          </div>

          {/* Áp dụng chung một lý do (khi có từ 2 mục trở lên) */}
          {items.length >= 2 && (
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Áp dụng chung một lý do cho tất cả ({items.length} hồ sơ):</span>
                </label>
                <button
                  type="button"
                  onClick={handleApplyCommon}
                  disabled={isSubmitting || commonReason.trim().length < 10}
                  className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-colors self-end sm:self-auto shadow-xs"
                >
                  Điền vào tất cả
                </button>
              </div>
              <input
                type="text"
                value={commonReason}
                onChange={(e) => setCommonReason(e.target.value)}
                placeholder="Ví dụ: Cơ quan nhà nước cấp trùng số, đã đối chiếu bản gốc"
                className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>Gợi ý: Điền lý do chung rồi bấm «Điền vào tất cả», sau đó có thể chỉnh riêng từng mục bên dưới.</span>
                <span className={commonReason.trim().length >= 10 ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                  {commonReason.trim().length}/10 ký tự
                </span>
              </div>
            </div>
          )}

          {/* Danh sách từng hồ sơ cần xác nhận */}
          <div className="space-y-4">
            {items.map((it, idx) => {
              const currentReason = reasons[it.requestId] || '';
              const len = currentReason.trim().length;
              const isValid = len >= 10;

              return (
                <div
                  key={it.requestId}
                  className="p-4 bg-gray-50/80 border border-gray-200 rounded-xl space-y-3 hover:border-amber-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs text-gray-500">Số GCN:</span>
                      <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200 text-xs">
                        {it.certificateNo}
                      </span>
                    </div>

                    {it.projectName && (
                      <span className="text-xs text-gray-600">
                        Dự án: <strong className="text-gray-800">{it.projectName}</strong>
                      </span>
                    )}
                  </div>

                  {it.message && (
                    <div className="text-[11px] text-amber-800 bg-amber-50/80 px-2.5 py-1.5 rounded-lg border border-amber-200/60 leading-relaxed">
                      {it.message}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-800">
                        Lý do xác nhận trùng số GCN <span className="text-rose-600">*</span>:
                      </label>
                      <span
                        className={`text-[11px] font-mono ${
                          isValid ? 'text-emerald-600 font-semibold' : 'text-rose-600'
                        }`}
                      >
                        {isValid
                          ? `✓ ${len} ký tự (hợp lệ)`
                          : `${len}/10 ký tự (cần thêm ${10 - len} ký tự)`}
                      </span>
                    </div>

                    <textarea
                      rows={2}
                      value={currentReason}
                      onChange={(e) => handleReasonChange(it.requestId, e.target.value)}
                      placeholder="Ví dụ: Cơ quan nhà nước cấp trùng số, đã đối chiếu bản gốc"
                      disabled={isSubmitting}
                      className={`w-full px-3 py-2 text-xs bg-white border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors ${
                        isValid
                          ? 'border-emerald-300 focus:ring-emerald-500 text-gray-900'
                          : 'border-gray-300 focus:ring-amber-500 text-gray-900'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={!allValid || isSubmitting}
              className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
                allValid && !isSubmitting
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận và duyệt</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
