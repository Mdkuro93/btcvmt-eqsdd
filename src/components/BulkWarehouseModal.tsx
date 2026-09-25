import React, { useState } from 'react';
import { Asset, Warehouse, Profile } from '../types';
import { bulkUpdateAssets } from '../api/assets';
import { X, Loader2, Warehouse as WarehouseIcon, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface BulkWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedAssets: Asset[];
  warehouses: Warehouse[];
  currentUser?: Profile | { id: string; email?: string; full_name?: string } | null;
}

export const BulkWarehouseModal: React.FC<BulkWarehouseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedAssets,
  warehouses,
  currentUser,
}) => {
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || selectedAssets.length === 0) return null;

  const count = selectedAssets.length;
  const targetWh = warehouses.find(w => w.id === targetWarehouseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWarehouseId) {
      setErrorMsg('Vui lòng chọn kho lưu trữ mới để chuyển');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const ids = selectedAssets.map(a => a.id);
      const noteText = notes.trim() || `Chuyển kho hàng loạt (${count} GCN) sang ${targetWh?.name || 'kho mới'}`;

      // Thực hiện gửi 1 request cập nhật duy nhất lên Supabase
      const res = await bulkUpdateAssets(
        ids,
        { warehouse_id: targetWarehouseId },
        currentUser,
        noteText
      );

      toast.success(`Đã chuyển thành công ${res.count} GCN sang kho "${targetWh?.name || 'mới'}"!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi chuyển kho hàng loạt:', err);
      const msg = err.message || 'Lỗi khi cập nhật kho lưu trữ';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl text-white">
              <WarehouseIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Chuyển Kho Hàng Loạt</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Gán kho lưu trữ mới cho <span className="font-bold underline">{count}</span> tài sản/GCN đã chọn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Chọn kho đích */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Kho lưu trữ tiếp nhận mới <span className="text-rose-500">*</span>
            </label>
            <select
              value={targetWarehouseId}
              onChange={e => {
                setTargetWarehouseId(e.target.value);
                setErrorMsg(null);
              }}
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all cursor-pointer font-medium text-slate-800"
            >
              <option value="">-- Chọn kho lưu trữ đích --</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.is_central ? '(Kho trung tâm)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Danh sách GCN được chọn preview */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold text-slate-700">Danh sách {count} GCN áp dụng:</span>
              <span>{count > 6 ? `Hiện 6 / ${count} GCN` : `${count} GCN`}</span>
            </div>
            <div className="max-h-32 overflow-y-auto bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              {selectedAssets.slice(0, 6).map(asset => (
                <div key={asset.id} className="flex items-center justify-between text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-100">
                  <span className="font-bold text-slate-900">{asset.certificate_no}</span>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <span className="truncate max-w-[120px]">{asset.warehouses?.name || 'Chưa vào kho'}</span>
                    <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="font-semibold text-blue-700 truncate max-w-[120px]">
                      {targetWh?.name || 'Kho mới'}
                    </span>
                  </div>
                </div>
              ))}
              {count > 6 && (
                <p className="text-center text-[11px] text-slate-400 italic pt-1">
                  ...và còn {count - 6} GCN khác
                </p>
              )}
            </div>
          </div>

          {/* Ghi chú lý do chuyển kho */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Ghi chú / Lý do điều chuyển (tùy chọn)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder="VD: Điều chuyển lưu trữ tập trung về kho trung tâm VMT..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading || !targetWarehouseId}
              className="px-4.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Xác nhận chuyển {count} GCN</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
