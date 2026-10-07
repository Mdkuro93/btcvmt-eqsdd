import React, { useEffect, useMemo } from 'react';
import {
  X,
  Building2,
  FileText,
  Calendar,
  Clock,
  User,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Layers,
} from 'lucide-react';
import {
  WarehouseTransferRow,
  STAGE_LABELS,
  STAGE_BADGE_CLASSES,
  TRANSFER_FIELDS,
} from '../../api/warehouseTransfers';
import { Warehouse } from '../../types';

export interface TransferDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: WarehouseTransferRow | null;
  warehouses: Warehouse[];
}

export const TransferDetailModal: React.FC<TransferDetailModalProps> = ({
  isOpen,
  onClose,
  transfer,
  warehouses,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !transfer) return null;

  const tDetails = transfer.details?.transfer;
  const stage = tDetails?.stage || 'awaiting_receipt';
  const snapshot = tDetails?.snapshot || {};
  const proposal = tDetails?.proposal;
  const review = tDetails?.review;

  const sourceWh = warehouses.find((w) => w.id === tDetails?.source_warehouse_id);
  const targetWh = warehouses.find((w) => w.id === tDetails?.target_warehouse_id);

  const formatDate = (val?: string) => {
    if (!val) return '-';
    const s = String(val).substring(0, 10);
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
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-800 dark:to-blue-950/30 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1E3A8A] text-white rounded-xl shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                  Chi tiết luân chuyển GCN
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    STAGE_BADGE_CLASSES[stage] || ''
                  }`}
                >
                  {STAGE_LABELS[stage] || stage}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                Số GCN: <strong className="font-mono text-gray-900 dark:text-slate-100">{transfer.asset?.certificate_no || snapshot.certificate_no || '-'}</strong> · Mã tài sản: <strong className="font-mono text-blue-700 dark:text-blue-400">{transfer.asset?.asset_code || '-'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-lg transition-colors"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Tuyến & Chứng từ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-800">
            <div>
              <span className="text-gray-500 dark:text-slate-400 block mb-0.5">Tuyến luân chuyển:</span>
              <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-slate-100">
                <span>{sourceWh?.name || 'Kho xuất'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-emerald-700 dark:text-emerald-400">
                  {targetWh?.name || 'Kho đích'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-gray-500 dark:text-slate-400 block mb-0.5">Mã phiếu xuất (PX):</span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 inline-block">
                {tDetails?.out_voucher_code || '-'}
              </span>
            </div>

            <div>
              <span className="text-gray-500 dark:text-slate-400 block mb-0.5">Mã phiếu nhập (PN):</span>
              {transfer.voucher_code || tDetails?.in_voucher_code ? (
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 inline-block">
                  {transfer.voucher_code || tDetails?.in_voucher_code}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-slate-500 italic">Chưa nhập kho đích</span>
              )}
            </div>

            <div className="sm:col-span-3 pt-2 border-t border-gray-200 dark:border-slate-700 flex flex-wrap gap-4 text-gray-600 dark:text-slate-400">
              <div>
                Người lập lệnh:{' '}
                <strong className="text-gray-900 dark:text-slate-100">
                  {transfer.transaction?.profiles?.full_name || transfer.transaction?.profiles?.email || 'Hệ thống'}
                </strong>
              </div>
              <div>
                Thời gian tạo:{' '}
                <strong className="text-gray-900 dark:text-slate-100">
                  {transfer.created_at ? new Date(transfer.created_at).toLocaleString('vi-VN') : '-'}
                </strong>
              </div>
            </div>
          </div>

          {/* Snapshot 10 trường lúc xuất */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              Thông tin hồ sơ GCN tại thời điểm lập lệnh xuất (Snapshot)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 bg-white dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700 rounded-xl">
              {TRANSFER_FIELDS.map((f) => {
                const val = (snapshot as any)[f.key];
                let display = val !== undefined && val !== null ? String(val) : '-';
                if (f.type === 'date' && val) display = formatDate(String(val));
                if (f.key === 'usage_term_type') display = val === 'fixed_date' ? 'Có thời hạn' : 'Lâu dài';

                return (
                  <div key={f.key} className="space-y-0.5">
                    <span className="text-gray-500 dark:text-slate-400 text-[11px]">{f.label}:</span>
                    {f.key === 'scan_file_url' && val ? (
                      <a
                        href={String(val)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline font-medium truncate flex items-center gap-1 block"
                      >
                        <ExternalLink className="w-3 h-3" /> Mở link scan
                      </a>
                    ) : (
                      <p className="font-medium text-gray-800 dark:text-slate-200 truncate">{display}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lịch sử đề xuất điều chỉnh nếu có */}
          {proposal && (
            <div className="space-y-2 p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Đề xuất điều chỉnh từ kho đích
              </h3>
              <p className="text-gray-800 dark:text-slate-200">
                <strong>Ghi chú chênh lệch:</strong> {proposal.discrepancy_note || '-'}
              </p>
              {proposal.notes && (
                <p className="text-gray-600 dark:text-slate-400">
                  <strong>Ghi chú nhận:</strong> {proposal.notes}
                </p>
              )}
              {proposal.changes && Object.keys(proposal.changes).length > 0 && (
                <div className="mt-2 border border-amber-200/80 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  <table className="w-full text-left">
                    <thead className="bg-amber-100/50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300">
                      <tr>
                        <th className="py-1.5 px-3">Thuộc tính</th>
                        <th className="py-1.5 px-3">Trước điều chỉnh</th>
                        <th className="py-1.5 px-3 font-bold">Đề xuất mới</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40">
                      {Object.entries(proposal.changes).map(([k, v]) => {
                        const fieldDef = TRANSFER_FIELDS.find((f) => f.key === k);
                        return (
                          <tr key={k}>
                            <td className="py-1.5 px-3 font-semibold">{fieldDef?.label || k}</td>
                            <td className="py-1.5 px-3 text-gray-500 line-through">
                              {String((snapshot as any)[k] || '-')}
                            </td>
                            <td className="py-1.5 px-3 font-bold text-amber-700 dark:text-amber-300">
                              {String(v)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Lịch sử kiểm tra của kho xuất nếu có */}
          {review && (
            <div
              className={`space-y-1.5 p-3.5 rounded-xl border ${
                review.accepted
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {review.accepted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Kho xuất đã chấp nhận điều chỉnh</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Kho xuất đã từ chối điều chỉnh</span>
                  </>
                )}
              </div>
              {review.notes && (
                <p className="pl-5 text-gray-700 dark:text-slate-300">
                  <strong>Ý kiến kho xuất:</strong> {review.notes}
                </p>
              )}
            </div>
          )}

          {/* Ghi chú quyết định / từ chối / thu hồi */}
          {transfer.decision_notes && (
            <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-200 dark:border-slate-700">
              <span className="text-gray-500 dark:text-slate-400 block mb-0.5 font-semibold">
                Lý do quyết định / Từ chối / Thu hồi:
              </span>
              <p className="text-gray-900 dark:text-slate-100 font-medium">
                {transfer.decision_notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
