import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Building2,
  FileText,
  Clock,
  User,
  ArrowRight,
} from 'lucide-react';
import {
  WarehouseTransferRow,
  reviewWarehouseTransferAdjustment,
  TRANSFER_FIELDS,
} from '../../api/warehouseTransfers';
import { Warehouse } from '../../types';
import toast from 'react-hot-toast';

export interface ReviewAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transfer: WarehouseTransferRow | null;
  warehouses: Warehouse[];
}

export const ReviewAdjustmentModal: React.FC<ReviewAdjustmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  transfer,
  warehouses,
}) => {
  const [action, setAction] = useState<'accept' | 'reject'>('accept');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const proposal = useMemo(() => {
    return transfer?.details?.transfer?.proposal || {};
  }, [transfer]);

  const snapshot = useMemo(() => {
    return transfer?.details?.transfer?.snapshot || {};
  }, [transfer]);

  const changes = useMemo(() => {
    return proposal?.changes || {};
  }, [proposal]);

  const sourceWh = useMemo(() => {
    return warehouses.find((w) => w.id === transfer?.details?.transfer?.source_warehouse_id);
  }, [warehouses, transfer]);

  const targetWh = useMemo(() => {
    return warehouses.find((w) => w.id === transfer?.details?.transfer?.target_warehouse_id);
  }, [warehouses, transfer]);

  useEffect(() => {
    if (isOpen) {
      setAction('accept');
      setNotes('');
    }
  }, [isOpen]);

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !transfer) return null;

  const trimmedNotes = notes.trim();
  const isRejectValid = trimmedNotes.length >= 10;
  const canSubmit = action === 'accept' || (action === 'reject' && isRejectValid);

  const formatDate = (val?: string) => {
    if (!val) return '-';
    const s = String(val).substring(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return s;
  };

  const changedFieldKeys = Object.keys(changes);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const isAccept = action === 'accept';
      const res = await reviewWarehouseTransferAdjustment(
        transfer.id,
        isAccept,
        trimmedNotes
      );

      if (isAccept) {
        toast.success(
          `Đã chấp nhận điều chỉnh và hoàn tất nhận kho! Mã phiếu nhập: ${res.voucher_code || ''}`
        );
      } else {
        toast.success('Đã từ chối đề xuất điều chỉnh, trả về kho đích xử lý lại.');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi kiểm tra đề xuất điều chỉnh');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                Kiểm tra đề xuất điều chỉnh luân chuyển
              </h2>
              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                Kho xuất kiểm tra thông tin chênh lệch do kho đích phát hiện khi nhận GCN.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Thông tin GCN & Tuyến */}
          <div className="p-3.5 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-slate-400">Số GCN:</span>
              <span className="font-mono font-bold text-gray-900 dark:text-slate-100 text-sm">
                {transfer.asset?.certificate_no || snapshot.certificate_no || '-'}
              </span>
              <span className="font-mono text-gray-500">[{transfer.asset?.asset_code || 'N/A'}]</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
              <span>{sourceWh?.name || 'Kho xuất'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {targetWh?.name || 'Kho đích'}
              </span>
            </div>
          </div>

          {/* Ghi chú chênh lệch từ kho đích */}
          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between text-amber-900 dark:text-amber-200 font-bold">
              <span>Ghi chú chênh lệch từ kho đích:</span>
              {proposal.proposed_at && (
                <span className="text-[11px] font-normal text-gray-500 dark:text-slate-400">
                  {new Date(proposal.proposed_at).toLocaleString('vi-VN')}
                </span>
              )}
            </div>
            <p className="text-gray-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
              {proposal.discrepancy_note || '(Không có ghi chú chi tiết)'}
            </p>
            {proposal.notes && (
              <p className="text-[11px] text-gray-600 dark:text-slate-400">
                Ghi chú thêm khi nhận: {proposal.notes}
              </p>
            )}
          </div>

          {/* Bảng so sánh các trường có thay đổi */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 dark:text-slate-200 block">
              Các thuộc tính được đề xuất thay đổi ({changedFieldKeys.length} trường):
            </label>
            {changedFieldKeys.length > 0 ? (
              <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Thuộc tính</th>
                      <th className="py-2.5 px-3">Theo lệnh xuất (Cũ)</th>
                      <th className="py-2.5 px-3 text-amber-800 dark:text-amber-300">
                        Kho đích đề xuất (Mới)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {changedFieldKeys.map((k) => {
                      const fieldDef = TRANSFER_FIELDS.find((f) => f.key === k);
                      const label = fieldDef?.label || k;
                      const oldVal = (snapshot as any)[k];
                      const newVal = (changes as any)[k];

                      let oldDisplay = oldVal !== undefined && oldVal !== null ? String(oldVal) : '-';
                      let newDisplay = newVal !== undefined && newVal !== null ? String(newVal) : '-';

                      if (fieldDef?.type === 'date') {
                        oldDisplay = formatDate(oldVal);
                        newDisplay = formatDate(newVal);
                      } else if (k === 'usage_term_type') {
                        oldDisplay = oldVal === 'fixed_date' ? 'Có thời hạn cụ thể' : 'Lâu dài';
                        newDisplay = newVal === 'fixed_date' ? 'Có thời hạn cụ thể' : 'Lâu dài';
                      }

                      return (
                        <tr key={k} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-slate-300">
                            {label}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-500 line-through">
                            {oldDisplay}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-700 dark:text-amber-300">
                            {newDisplay}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic p-3 bg-gray-50 dark:bg-slate-800/40 rounded-lg">
                Kho đích chỉ gửi ghi chú chênh lệch, không sửa trường dữ liệu nào.
              </p>
            )}
          </div>

          {/* Lựa chọn quyết định */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-slate-800">
            <label className="text-xs font-bold text-gray-800 dark:text-slate-200 block">
              Quyết định của kho xuất:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAction('accept')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                  action === 'accept'
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    action === 'accept' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold">Chấp nhận điều chỉnh</div>
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Áp dụng thông tin mới và hoàn tất nhập kho đích.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAction('reject')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                  action === 'reject'
                    ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                    : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <XCircle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    action === 'reject' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold">Từ chối đề xuất</div>
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Trả về kho đích để xử lý lại (nhận lại hoặc từ chối).
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Ô nhập ghi chú / lý do */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-800 dark:text-slate-200">
                {action === 'accept' ? 'Ghi chú phê duyệt (tùy chọn):' : 'Lý do từ chối đề xuất:'}{' '}
                {action === 'reject' && <span className="text-rose-600">*</span>}
              </label>
              {action === 'reject' && (
                <span
                  className={`text-[11px] font-mono ${
                    isRejectValid ? 'text-emerald-600 font-semibold' : 'text-rose-600'
                  }`}
                >
                  {isRejectValid
                    ? `✓ ${trimmedNotes.length} ký tự`
                    : `${trimmedNotes.length}/10 ký tự (cần thêm ${10 - trimmedNotes.length})`}
                </span>
              )}
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                action === 'accept'
                  ? 'Ví dụ: Đã kiểm tra lại hồ sơ gốc, đồng ý cập nhật...'
                  : 'Ví dụ: Diện tích theo bản vẽ gốc là đúng, đề nghị kho đích kiểm tra lại...'
              }
              className={`w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 ${
                action === 'reject' && !isRejectValid
                  ? 'border-amber-300 dark:border-amber-700 focus:ring-amber-500 text-gray-900 dark:text-slate-100'
                  : 'border-gray-300 dark:border-slate-700 focus:ring-blue-500 text-gray-900 dark:text-slate-100'
              }`}
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
                action === 'accept'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : isRejectValid && !isSubmitting
                  ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                  : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : action === 'accept' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Chấp nhận & Hoàn tất nhận</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>Xác nhận từ chối điều chỉnh</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
