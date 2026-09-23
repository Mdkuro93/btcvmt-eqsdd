import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

interface DeleteAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Danh sách GCN sẽ bị xóa (1 GCN: xóa đơn; nhiều GCN: xóa hàng loạt) */
  assets: Array<{ id: string; certificateNo: string }>;
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
}

/**
 * Hộp thoại xóa GCN dành cho admin: bắt buộc nhập lý do + gõ lại để xác nhận.
 * Chỉ dùng cho dữ liệu NHẬP SAI. GCN đúng nhưng hết hiệu lực không xóa mà dùng Vô hiệu.
 */
export const DeleteAssetsModal: React.FC<DeleteAssetsModalProps> = ({
  isOpen,
  onClose,
  assets,
  onConfirm,
  loading = false,
}) => {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirmText('');
    }
  }, [isOpen]);

  if (!isOpen || assets.length === 0) return null;

  const isSingle = assets.length === 1;
  const expectedText = isSingle ? assets[0].certificateNo : `XÓA ${assets.length}`;
  const reasonOk = reason.trim().length >= 10;
  const confirmOk = confirmText.trim().toLowerCase() === expectedText.trim().toLowerCase();
  const canSubmit = reasonOk && confirmOk && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-100">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-red-100 text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {isSingle ? 'Xóa Giấy chứng nhận' : `Xóa ${assets.length} Giấy chứng nhận`}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Chỉ dùng cho dữ liệu nhập sai.</p>
              <p className="mt-1">
                Thao tác xóa vĩnh viễn GCN cùng các phiếu, lịch sử chuyển sở hữu và dòng kiểm kê liên quan. Toàn bộ dữ
                liệu bị xóa được lưu vết (người xóa, thời điểm, lý do). Nếu GCN đúng nhưng hết hiệu lực thì không xóa.
              </p>
              <p className="mt-1">
                Hệ thống từ chối xóa GCN đang thế chấp, đang xuất kho, còn phiếu chờ duyệt, hoặc là sổ mẹ/sổ con (tách sổ).
              </p>
            </div>
          </div>

          {!isSingle && (
            <div className="mt-3 text-xs text-gray-600 max-h-20 overflow-y-auto">
              <span className="font-semibold">GCN sẽ xóa: </span>
              {assets.map(a => a.certificateNo).join(', ')}
            </div>
          )}

          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Lý do xóa <span className="text-red-500">*</span>{' '}
              <span className="font-normal text-gray-400">(ít nhất 10 ký tự)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              disabled={loading}
              placeholder="VD: Nhập trùng số GCN do thao tác nhầm khi khai báo"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Để xác nhận, gõ <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{expectedText}</span>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason.trim())}
              disabled={!canSubmit}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSingle ? 'Xác nhận xóa' : `Xóa ${assets.length} GCN`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};