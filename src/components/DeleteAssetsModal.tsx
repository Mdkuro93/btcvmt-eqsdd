import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X, ShieldAlert } from 'lucide-react';

export interface DeleteAssetItem {
  id: string;
  certificateNo: string;
  assetCode?: string | null;
  parentAssetId?: string | null;
  hasRelations?: boolean;
}

export interface DeleteAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Danh sách GCN sẽ bị xóa (1 GCN: xóa đơn; nhiều GCN: xóa hàng loạt) */
  assets: DeleteAssetItem[];
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
}

/**
 * Hộp thoại xóa GCN (Hỗ trợ Quyền Xóa Cưỡng Chế / Force Delete dành riêng cho Admin / Super Admin).
 * - Cho phép xóa kể cả khi GCN có liên kết phả hệ hoặc lịch sử giao dịch.
 * - Bắt buộc nhập lý do xóa tối thiểu 10 ký tự.
 * - Bắt buộc gõ đúng mã TSĐB / Số GCN / Mã xác nhận để mở khóa thao tác.
 * - Lưu vết toàn bộ dữ liệu đã xóa vào bảng deletion_audit.
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
  const singleAsset = isSingle ? assets[0] : null;

  // Xác định mã hiển thị cần gõ lại
  const expectedPrimary = isSingle 
    ? (singleAsset?.assetCode || singleAsset?.certificateNo || '') 
    : `XÓA ${assets.length} GCN`;
  
  const expectedSecondary = isSingle && singleAsset?.assetCode ? singleAsset.certificateNo : null;

  const cleanReason = reason.trim();
  const reasonOk = cleanReason.length >= 10;
  
  const cleanConfirm = confirmText.trim().toLowerCase();
  const confirmOk = isSingle
    ? (cleanConfirm === expectedPrimary.trim().toLowerCase() || (expectedSecondary && cleanConfirm === expectedSecondary.trim().toLowerCase()))
    : (cleanConfirm === expectedPrimary.trim().toLowerCase() || cleanConfirm === `xóa ${assets.length}`.toLowerCase());

  const canSubmit = reasonOk && confirmOk && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-red-100 text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>{isSingle ? 'Xóa Giấy chứng nhận' : `Xóa ${assets.length} Giấy chứng nhận`}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase">
                    Quyền Admin
                  </span>
                </h3>
                {isSingle && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    GCN: {singleAsset?.certificateNo} {singleAsset?.assetCode ? `— Mã: ${singleAsset.assetCode}` : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cảnh báo Admin: Quyền Xóa Cưỡng Chế */}
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 leading-relaxed flex gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">
                ⚠️ CẢNH BÁO ADMIN: {isSingle ? 'GCN này có thể' : 'Các GCN này có thể'} có lịch sử giao dịch hoặc liên kết phả hệ. Thao tác xóa cưỡng chế sẽ tự động gỡ liên kết và xóa toàn bộ nhật ký liên quan. Thao tác này KHÔNG THỂ KHÔI PHỤC.
              </p>
              <p className="mt-1.5 text-[11px] text-amber-800">
                Khi thực hiện xóa:
                <br />• Các sổ con liên quan sẽ được tự động gỡ bỏ liên kết phả hệ (sổ con không bị mất).
                <br />• Toàn bộ chi tiết giao dịch (phiếu nhập/xuất), đề xuất khai báo và nhật ký biến động liên quan đến GCN sẽ được dọn dẹp sạch.
                <br />• Dữ liệu trước khi xóa sẽ được chụp ảnh lưu vết đầy đủ trong sổ kiểm toán hệ thống.
              </p>
            </div>
          </div>

          {!isSingle && (
            <div className="mt-3 text-xs text-gray-600 max-h-24 overflow-y-auto bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-800">Danh sách {assets.length} GCN sẽ xóa:</span>
              <ul className="mt-1 space-y-0.5 list-disc list-inside font-mono text-[11px] text-slate-600">
                {assets.map(a => (
                  <li key={a.id}>
                    {a.certificateNo} {a.assetCode ? `[${a.assetCode}]` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Nhập lý do xóa */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700">
                Lý do xóa <span className="text-red-500">*</span>
              </label>
              <span className={`text-[11px] ${cleanReason.length >= 10 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                {cleanReason.length}/10 ký tự tối thiểu
              </span>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              disabled={loading}
              placeholder="VD: Dữ liệu nhập sai lệch khi khai báo / Nhập trùng sổ cần dọn dẹp..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
          </div>

          {/* Nhập xác nhận */}
          <div className="mt-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Để xác nhận, vui lòng gõ chính xác:{' '}
              <span className="font-mono bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold">
                {expectedPrimary}
              </span>
              {expectedSecondary && (
                <span className="text-gray-500 text-[11px] font-normal ml-1">
                  (hoặc Số GCN: <span className="font-mono font-medium text-gray-700">{expectedSecondary}</span>)
                </span>
              )}
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              disabled={loading}
              placeholder={`Gõ lại "${expectedPrimary}" để mở khóa`}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={() => onConfirm(cleanReason)}
              disabled={!canSubmit}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSingle ? 'Xác nhận xóa cưỡng chế' : `Xóa cưỡng chế ${assets.length} GCN`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export alias DeleteAssetModal để hỗ trợ cả 2 cách đặt tên
export const DeleteAssetModal = DeleteAssetsModal;
