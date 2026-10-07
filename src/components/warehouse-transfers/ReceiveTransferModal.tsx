import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  FileText,
  Send,
  HelpCircle,
  AlertCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  WarehouseTransferRow,
  confirmWarehouseTransferReceipt,
  TRANSFER_FIELDS,
  TransferSnapshot,
} from '../../api/warehouseTransfers';
import { normalizeNumberInput, normalizeDateInput } from '../../lib/inputNormalize';
import { validateScanLink } from '../../lib/scanLink';
import { Warehouse } from '../../types';
import toast from 'react-hot-toast';

export interface ReceiveTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transfer: WarehouseTransferRow | null;
  warehouses: Warehouse[];
}

export const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  transfer,
  warehouses,
}) => {
  const [mode, setMode] = useState<'match' | 'discrepancy'>('match');
  const [receiveNotes, setReceiveNotes] = useState<string>('');
  const [discrepancyNote, setDiscrepancyNote] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const snapshot: TransferSnapshot = useMemo(() => {
    return transfer?.details?.transfer?.snapshot || {};
  }, [transfer]);

  const sourceWh = useMemo(() => {
    return warehouses.find((w) => w.id === transfer?.details?.transfer?.source_warehouse_id);
  }, [warehouses, transfer]);

  const targetWh = useMemo(() => {
    return warehouses.find((w) => w.id === transfer?.details?.transfer?.target_warehouse_id);
  }, [warehouses, transfer]);

  const stage = transfer?.details?.transfer?.stage;
  const isRejectedBefore = stage === 'adjustment_rejected';
  const previousReview = transfer?.details?.transfer?.review;
  const previousProposal = transfer?.details?.transfer?.proposal;

  // Initialize form data from snapshot
  useEffect(() => {
    if (isOpen && transfer) {
      setMode('match');
      setReceiveNotes('');
      setDiscrepancyNote('');

      const init: Record<string, string> = {};
      TRANSFER_FIELDS.forEach((f) => {
        const val = (snapshot as any)[f.key];
        if (val !== undefined && val !== null) {
          if (f.type === 'date') {
            init[f.key] = String(val).substring(0, 10);
          } else {
            init[f.key] = String(val);
          }
        } else {
          init[f.key] = f.key === 'usage_term_type' ? 'long_term' : '';
        }
      });
      setFormData(init);
    }
  }, [isOpen, transfer, snapshot]);

  // ESC to close
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

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Compute actual normalized differences compared to snapshot
  const computeChanges = (): { changes: Record<string, any>; errors: string[] } => {
    const changes: Record<string, any> = {};
    const errors: string[] = [];

    TRANSFER_FIELDS.forEach((f) => {
      const snapVal = (snapshot as any)[f.key];
      const rawVal = formData[f.key] !== undefined ? formData[f.key] : '';
      const trimmed = String(rawVal).trim();

      if (f.key === 'area') {
        const norm = normalizeNumberInput(trimmed);
        const num = parseFloat(norm);
        if (trimmed && (isNaN(num) || num <= 0)) {
          errors.push('Diện tích phải là số lớn hơn 0.');
        } else {
          const snapNum = snapVal !== undefined && snapVal !== null ? parseFloat(String(snapVal)) : null;
          if (snapNum !== num && norm) {
            changes.area = num;
          }
        }
      } else if (f.type === 'date') {
        const norm = normalizeDateInput(trimmed);
        const snapDate = snapVal ? String(snapVal).substring(0, 10) : '';
        if (norm && norm !== snapDate) {
          changes[f.key] = norm;
        }
      } else if (f.key === 'scan_file_url') {
        if (trimmed) {
          const check = validateScanLink(trimmed);
          if (!check.ok) {
            errors.push(check.error || 'Link bản scan không hợp lệ');
          }
        }
        const snapStr = String(snapVal || '').trim();
        if (trimmed !== snapStr && trimmed) {
          changes.scan_file_url = trimmed;
        }
      } else {
        const snapStr = String(snapVal || '').trim();
        if (trimmed !== snapStr && trimmed) {
          changes[f.key] = trimmed;
        }
      }
    });

    return { changes, errors };
  };

  const { changes, errors: validationErrors } = computeChanges();
  const hasChanges = Object.keys(changes).length > 0;
  const isDiscrepancyValid = discrepancyNote.trim().length >= 10 && validationErrors.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (mode === 'discrepancy' && !isDiscrepancyValid) {
      if (validationErrors.length > 0) {
        toast.error(validationErrors[0]);
      } else {
        toast.error('Ghi chú chênh lệch bắt buộc tối thiểu 10 ký tự.');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'match') {
        const res = await confirmWarehouseTransferReceipt(
          transfer.id,
          receiveNotes.trim() || null,
          null,
          null
        );
        toast.success(`Đã nhận GCN vào kho thành công! Mã phiếu nhập: ${res.voucher_code || ''}`);
      } else {
        const res = await confirmWarehouseTransferReceipt(
          transfer.id,
          receiveNotes.trim() || null,
          hasChanges ? changes : null,
          discrepancyNote.trim()
        );
        toast.success('Đã gửi đề xuất điều chỉnh cho kho xuất kiểm tra.');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xác nhận nhận GCN');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSnapshotDate = (val?: string) => {
    if (!val) return '-';
    const s = val.substring(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return s;
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-b border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                Xác nhận nhận GCN luân chuyển
              </h2>
              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                Kho đích đối chiếu thông tin thực tế với lệnh xuất trước khi nhập kho.
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

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Cảnh báo từ chối trước đó nếu có */}
          {isRejectedBefore && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Kho xuất đã từ chối đề xuất điều chỉnh trước đó</span>
              </div>
              <p className="pl-6">
                <strong>Lý do từ chối:</strong> {previousReview?.notes || '(Không có ghi chú)'}
              </p>
              {previousProposal?.discrepancy_note && (
                <p className="pl-6 text-gray-600 dark:text-slate-400">
                  Ghi chú đề xuất cũ của bạn: {previousProposal.discrepancy_note}
                </p>
              )}
              <p className="pl-6 text-[11px] text-amber-700 dark:text-amber-400 italic">
                Bạn có thể nhận đúng như lệnh xuất ban đầu, đề xuất lại với ghi chú chi tiết hơn, hoặc bấm nút &quot;Từ chối nhận&quot; ở danh sách bên ngoài để trả GCN về kho xuất.
              </p>
            </div>
          )}

          {/* Phần 1: Thông tin cố định (Readonly) */}
          <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500 dark:text-slate-400 block">Số GCN:</span>
              <span className="font-mono font-bold text-gray-900 dark:text-slate-100 text-sm">
                {transfer.asset?.certificate_no || snapshot.certificate_no || '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400 block">Mã tài sản:</span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                {transfer.asset?.asset_code || '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400 block">Mã lô pháp lý:</span>
              <span className="font-medium text-gray-800 dark:text-slate-200">
                {transfer.asset?.legal_lot_code || snapshot.legal_lot_code || '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400 block">Dự án:</span>
              <span className="font-medium text-gray-800 dark:text-slate-200 truncate block">
                {transfer.asset?.projects?.name || '-'}
              </span>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-1 border-t border-gray-200 dark:border-slate-700">
              <span className="text-gray-500 dark:text-slate-400">Tuyến luân chuyển:</span>
              <span className="font-semibold text-gray-900 dark:text-slate-100">
                {sourceWh?.name || 'Kho xuất'}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {targetWh?.name || 'Kho đích'}
              </span>
            </div>
            <div className="sm:col-span-2 pt-1 border-t border-gray-200 dark:border-slate-700">
              <span className="text-gray-500 dark:text-slate-400">Mã phiếu xuất (PX): </span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                {transfer.details?.transfer?.out_voucher_code || '-'}
              </span>
            </div>
          </div>

          {/* Hướng dẫn trường không sửa */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p>
              <strong>Lưu ý:</strong> Số GCN, mã lô và dự án <em>không được chỉnh sửa</em> tại đây. Nếu số GCN hoặc mã lô trên bản gốc khác hệ thống, vui lòng ghi vào ô chênh lệch và bấm <strong>Từ chối nhận</strong>, hoặc báo kho xuất sửa bằng chức năng <strong>Cập nhật hàng loạt – Sửa sai số GCN</strong>.
            </p>
          </div>

          {/* Toggle Chế độ đối chiếu */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/60">
            <label className="text-xs font-bold text-blue-900 dark:text-blue-200">
              Kết quả đối chiếu hồ sơ:
            </label>
            <div className="inline-flex rounded-lg p-1 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode('match')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'match'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                }`}
              >
                ✓ Đã đối chiếu, đúng như lệnh xuất
              </button>
              <button
                type="button"
                onClick={() => setMode('discrepancy')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'discrepancy'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
                }`}
              >
                ⚠ Có chênh lệch / Đề xuất điều chỉnh
              </button>
            </div>
          </div>

          {/* Bảng đối chiếu 10 trường */}
          <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-1/4">Thuộc tính</th>
                  <th className="py-2.5 px-3 w-1/3">Theo lệnh xuất (Snapshot)</th>
                  <th className="py-2.5 px-3">Thực tế nhận (Kho đích)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {TRANSFER_FIELDS.map((f) => {
                  const snapVal = (snapshot as any)[f.key];
                  const currentVal = formData[f.key] || '';
                  const isModified = mode === 'discrepancy' && changes[f.key] !== undefined;

                  let snapDisplay = snapVal !== undefined && snapVal !== null ? String(snapVal) : '-';
                  if (f.type === 'date' && snapVal) {
                    snapDisplay = formatSnapshotDate(String(snapVal));
                  } else if (f.key === 'usage_term_type') {
                    snapDisplay = snapVal === 'fixed_date' ? 'Có thời hạn cụ thể' : 'Lâu dài';
                  }

                  return (
                    <tr
                      key={f.key}
                      className={`hover:bg-gray-50/50 dark:hover:bg-slate-800/50 ${
                        isModified ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <td className="py-2 px-3 font-semibold text-gray-700 dark:text-slate-300">
                        {f.label}
                      </td>
                      <td className="py-2 px-3 font-mono text-gray-600 dark:text-slate-400">
                        {snapDisplay}
                      </td>
                      <td className="py-2 px-3">
                        {mode === 'match' ? (
                          <span className="text-gray-500 dark:text-slate-400 italic">
                            (Giữ nguyên theo lệnh xuất)
                          </span>
                        ) : f.type === 'select' && f.key === 'usage_term_type' ? (
                          <select
                            value={currentVal}
                            onChange={(e) => handleFieldChange(f.key, e.target.value)}
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="long_term">Lâu dài</option>
                            <option value="fixed_date">Có thời hạn cụ thể</option>
                          </select>
                        ) : f.type === 'date' ? (
                          <input
                            type="date"
                            value={currentVal}
                            onChange={(e) => handleFieldChange(f.key, e.target.value)}
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => handleFieldChange(f.key, e.target.value)}
                            placeholder={`Nhập ${f.label.toLowerCase()}...`}
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ô nhập ghi chú chênh lệch (BẮT BUỘC khi ở chế độ discrepancy) */}
          {mode === 'discrepancy' && (
            <div className="space-y-1.5 p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Ghi chú chênh lệch / Lý do điều chỉnh <span className="text-rose-600">*</span>:
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    isDiscrepancyValid ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600'
                  }`}
                >
                  {isDiscrepancyValid
                    ? `✓ ${discrepancyNote.trim().length} ký tự`
                    : `${discrepancyNote.trim().length}/10 ký tự (cần thêm ${Math.max(
                        0,
                        10 - discrepancyNote.trim().length
                      )})`}
                </span>
              </div>
              <textarea
                rows={2}
                value={discrepancyNote}
                onChange={(e) => setDiscrepancyNote(e.target.value)}
                placeholder="Mô tả cụ thể chênh lệch thực tế khi nhận hồ sơ (ví dụ: Diện tích trên bản gốc là 123.5 m2, số thửa 45...)"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {validationErrors.length > 0 && (
                <p className="text-[11px] text-rose-600 mt-1">{validationErrors[0]}</p>
              )}
            </div>
          )}

          {/* Ô nhập ghi chú nhận chung (Tùy chọn) */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
              Ghi chú nhận kho (tùy chọn):
            </label>
            <input
              type="text"
              value={receiveNotes}
              onChange={(e) => setReceiveNotes(e.target.value)}
              placeholder="Ghi chú thêm cho phiếu nhập kho..."
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
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
              disabled={isSubmitting || (mode === 'discrepancy' && !isDiscrepancyValid)}
              className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
                mode === 'match'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : isDiscrepancyValid && !isSubmitting
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                  : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : mode === 'match' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận đã nhận (Nhập kho)</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi kho xuất kiểm tra điều chỉnh</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
