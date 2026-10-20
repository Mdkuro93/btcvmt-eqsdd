import React, { useState, useEffect } from 'react';
import { InventoryAudit } from '../../types';
import { AlertTriangle, Trash2, Archive, X, Check, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  audit: InventoryAudit | null;
  mode: 'soft_delete' | 'hard_delete';
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

export const AuditDeleteConfirmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  audit,
  mode,
  onConfirm,
  loading = false,
}) => {
  const [isAgreed, setIsAgreed] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  // Reset inputs whenever modal opens or target audit changes
  useEffect(() => {
    if (isOpen) {
      setIsAgreed(false);
      setConfirmInput('');
    }
  }, [isOpen, audit]);

  if (!isOpen || !audit) return null;

  const isHardDelete = mode === 'hard_delete';
  const warehouseName = audit.warehouses?.name || audit.warehouse?.name || 'Kho lưu trữ';
  const isCodeMatched = isHardDelete ? confirmInput.trim().toUpperCase() === 'XÓA' : true;
  const canSubmit = isAgreed && isCodeMatched && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isHardDelete ? 'bg-rose-50/80 border-rose-200' : 'bg-amber-50/80 border-amber-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isHardDelete ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {isHardDelete ? <ShieldAlert className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {isHardDelete ? 'Xác nhận Xóa Vĩnh Viễn Đợt Kiểm Kê' : 'Xác nhận Lưu Trữ (Xóa Mềm)'}
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {isHardDelete 
                  ? 'Thao tác chỉ dành cho Quản trị viên cấp cao'
                  : 'Chuyển đợt kiểm kê vào mục lưu trữ / ẩn khỏi màn hình chính'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Main Warning Box */}
          <div className={`p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${
            isHardDelete 
              ? 'bg-rose-50 text-rose-950 border-rose-300' 
              : 'bg-amber-50 text-amber-950 border-amber-300'
          }`}>
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isHardDelete ? 'text-rose-600' : 'text-amber-700'}`} />
            <div>
              {isHardDelete ? (
                <>
                  <p className="font-bold text-sm mb-1 text-rose-900">
                    Cảnh báo rủi ro mất dữ liệu vĩnh viễn!
                  </p>
                  <p>
                    Bạn có chắc chắn muốn xóa vĩnh viễn đợt kiểm kê này không? <strong>Dữ liệu biên bản và phụ lục sẽ bị mất hoàn toàn và không thể khôi phục.</strong>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm mb-1 text-amber-900">
                    Chuyển vào thùng rác / lưu trữ ngầm
                  </p>
                  <p>
                    Đợt kiểm kê chưa hoàn tất này sẽ được ẩn khỏi danh sách làm việc của nhân viên kho để giữ giao diện gọn gàng. Dữ liệu vẫn được bảo lưu an toàn và chỉ tài khoản Quản trị viên (Admin) mới có quyền tra cứu lại hoặc xóa vĩnh viễn.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Audit Information Summary */}
          <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Kho kiểm kê:</span>
              <strong className="text-gray-900">{warehouseName}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Thời gian bắt đầu:</span>
              <span className="text-gray-800 font-medium">
                {format(new Date(audit.started_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Trạng thái:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                audit.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {audit.status === 'completed' ? 'Đã hoàn tất' : 'Đang thực hiện'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Tổng GCN liên quan:</span>
              <span className="font-bold text-blue-900">{audit.total_expected} GCN</span>
            </div>
          </div>

          {/* Double Confirmation Steps */}
          <div className="pt-2 border-t border-gray-100 space-y-3">
            {/* Step 1: Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAgreed}
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-xs text-gray-700 font-medium leading-tight">
                {isHardDelete
                  ? 'Tôi đã đọc kỹ cảnh báo, hiểu rõ rủi ro và xác nhận muốn xóa vĩnh viễn đợt kiểm kê này khỏi hệ thống.'
                  : 'Tôi xác nhận muốn chuyển đợt kiểm kê này vào mục lưu trữ.'}
              </span>
            </label>

            {/* Step 2: Input confirmation for hard delete */}
            {isHardDelete && (
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Vui lòng nhập chữ <span className="font-mono text-rose-700 font-bold px-1.5 py-0.5 bg-rose-50 rounded border border-rose-200">XÓA</span> để mở khóa nút thực thi:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Nhập chữ XÓA..."
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-bold placeholder:font-normal uppercase"
                />
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all cursor-pointer ${
                isHardDelete
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-rose-600/20'
                  : 'bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-amber-600/20'
              }`}
            >
              {isHardDelete ? <Trash2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {loading 
                ? (isHardDelete ? 'Đang xóa...' : 'Đang lưu trữ...')
                : (isHardDelete ? 'Xác Nhận Xóa Vĩnh Viễn' : 'Xác Nhận Lưu Trữ')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
