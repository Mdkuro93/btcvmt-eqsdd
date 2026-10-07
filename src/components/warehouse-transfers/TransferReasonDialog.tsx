import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2, Undo2, XCircle } from 'lucide-react';

export interface TransferReasonDialogProps {
  isOpen: boolean;
  type: 'reject' | 'cancel'; // 'reject' = Kho đích từ chối nhận, 'cancel' = Kho xuất thu hồi lệnh
  certificateNo?: string;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const TransferReasonDialog: React.FC<TransferReasonDialogProps> = ({
  isOpen,
  type,
  certificateNo,
  isSubmitting = false,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const isReject = type === 'reject';
  const title = isReject ? 'Từ chối nhận GCN luân chuyển' : 'Thu hồi lệnh luân chuyển';
  const actionLabel = isReject ? 'Xác nhận từ chối nhận' : 'Xác nhận thu hồi lệnh';
  const trimmed = reason.trim();
  const isValid = trimmed.length >= 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isReject
            ? 'bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-950/40 dark:to-orange-950/40 border-rose-200 dark:border-rose-900/60'
            : 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 border-amber-200 dark:border-amber-900/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isReject
                ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
            }`}>
              {isReject ? <XCircle className="w-5 h-5" /> : <Undo2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">
                {title}
              </h3>
              {certificateNo && (
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                  Số GCN: <strong className="font-mono text-gray-800 dark:text-slate-200">{certificateNo}</strong>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Lưu ý:</strong> Sau khi xác nhận, GCN sẽ trở về kho xuất với trạng thái trong kho (in_stock), phiếu xuất luân chuyển sẽ bị hủy.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-800 dark:text-slate-200">
                Lý do {isReject ? 'từ chối nhận' : 'thu hồi lệnh'} <span className="text-rose-600">*</span>:
              </label>
              <span
                className={`text-[11px] font-mono ${
                  isValid ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isValid ? `✓ ${trimmed.length} ký tự` : `${trimmed.length}/10 ký tự (cần thêm ${10 - trimmed.length})`}
              </span>
            </div>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isReject
                  ? 'Ví dụ: Hồ sơ giao thiếu bản gốc / sai thông tin thực tế, trả lại kho xuất...'
                  : 'Ví dụ: Nhập nhầm GCN / hủy kế hoạch luân chuyển sang kho khác...'
              }
              disabled={isSubmitting}
              className={`w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border rounded-lg placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                isValid
                  ? 'border-emerald-300 dark:border-emerald-700 focus:ring-emerald-500 text-gray-900 dark:text-slate-100'
                  : 'border-gray-300 dark:border-slate-700 focus:ring-amber-500 text-gray-900 dark:text-slate-100'
              }`}
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-gray-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
                isValid && !isSubmitting
                  ? isReject
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                  : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <span>{actionLabel}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
