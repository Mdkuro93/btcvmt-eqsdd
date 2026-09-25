import React, { useState } from 'react';
import { Asset } from '../types';
import { deleteMultipleAssets } from '../api/assets';
import { adminDeleteAssets } from '../api/assetDeletion';
import { AlertTriangle, Loader2, Trash2, X, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

export interface BulkDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedAssets: Asset[];
  canForceDelete?: boolean;
}

export const BulkDeleteConfirmModal: React.FC<BulkDeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedAssets,
  canForceDelete = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFkError, setIsFkError] = useState(false);
  const [forceReason, setForceReason] = useState('');

  if (!isOpen || selectedAssets.length === 0) return null;

  const count = selectedAssets.length;

  const handleConfirmDelete = async () => {
    setLoading(true);
    setErrorMsg(null);

    const ids = selectedAssets.map(a => a.id);

    try {
      if (isFkError && canForceDelete) {
        // Nếu đã gặp lỗi ràng buộc và admin chọn xóa cưỡng chế kèm lý do
        if (forceReason.trim().length < 10) {
          setErrorMsg('Vui lòng nhập lý do xóa cưỡng chế (tối thiểu 10 ký tự)');
          setLoading(false);
          return;
        }
        const res = await adminDeleteAssets(ids, forceReason.trim());
        toast.success(`Đã xóa cưỡng chế thành công ${res.deleted} GCN và lưu vết kiểm toán!`);
        onSuccess();
        onClose();
        return;
      }

      // Xóa hàng loạt chuẩn: gửi 1 request duy nhất lên Supabase (Query DELETE WHERE id IN (...selectedIds))
      await deleteMultipleAssets(ids);
      toast.success(`Đã xóa thành công ${count} GCN đã chọn!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi xóa hàng loạt GCN:', err);
      const msg = err.message || 'Lỗi khi xóa hàng loạt GCN';
      setErrorMsg(msg);
      if (msg.includes('lịch sử giao dịch kho') || msg.includes('ràng buộc') || msg.includes('foreign key')) {
        setIsFkError(true);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-100">
        {/* Header */}
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-100 text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Xác nhận xóa hàng loạt
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đang thao tác trên <span className="font-semibold text-red-600">{count}</span> Giấy chứng nhận
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Thông báo xác nhận rõ ràng theo yêu cầu */}
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-950 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-red-900">
                Bạn có chắc chắn muốn xóa {count} GCN đã chọn? Thao tác này không thể hoàn tác.
              </p>
              <p className="mt-1 text-xs text-red-800 leading-relaxed">
                Tất cả {count} Giấy chứng nhận được chọn sẽ bị gỡ bỏ vĩnh viễn khỏi danh sách quản lý.
              </p>
            </div>
          </div>

          {/* Error Message if any */}
          {errorMsg && (
            <div className="mt-3 p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs text-rose-900">
              <p className="font-semibold">⚠️ Không thể xóa danh sách GCN:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          )}

          {/* Preview danh sách GCN */}
          <div className="mt-3.5">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-semibold text-slate-700">Danh sách {count} GCN sẽ xóa:</span>
              <span>{count > 5 ? `Hiện 5 / ${count} GCN` : `${count} GCN`}</span>
            </div>
            <div className="max-h-28 overflow-y-auto bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
              {selectedAssets.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-100 font-mono">
                  <span className="font-bold text-slate-900">{a.certificate_no}</span>
                  <span className="text-[11px] text-slate-500">{a.asset_code || '-'}</span>
                </div>
              ))}
              {count > 5 && (
                <p className="text-center text-[11px] text-slate-400 italic pt-0.5">
                  ...và còn {count - 5} GCN khác
                </p>
              )}
            </div>
          </div>

          {/* Admin Force Delete Option if FK error occurred */}
          {isFkError && canForceDelete && (
            <div className="mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Bạn có quyền Admin: Xóa Cưỡng Chế (Force Delete)</span>
              </div>
              <p className="text-[11px] text-amber-800 mt-1">
                Nhập lý do xóa (tối thiểu 10 ký tự) để hệ thống tự động gỡ liên kết phả hệ, lưu vết kiểm toán và xóa dọn dẹp:
              </p>
              <textarea
                value={forceReason}
                onChange={e => setForceReason(e.target.value)}
                placeholder="VD: Dữ liệu nhập sai lệch cần xóa dọn dẹp theo yêu cầu thanh tra..."
                rows={2}
                className="w-full mt-2 px-3 py-1.5 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={loading}
              className="px-4.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isFkError && canForceDelete
                  ? `Xác nhận xóa cưỡng chế (${count})`
                  : `Xác nhận xóa (${count})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
