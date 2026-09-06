import React, { useState } from 'react';
import { X, CalendarClock } from 'lucide-react';
import { Asset } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (additionalDays: number, reason: string) => Promise<void>;
  asset: Asset;
}

export const AssetExtensionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
  asset,
}) => {
  const [days, setDays] = useState(15);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(days, reason);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-600" />
            Xin gia hạn trả GCN
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <p className="text-sm font-semibold text-amber-900">GCN: {asset.certificate_no}</p>
            <p className="text-xs text-amber-700 mt-1">Đang mượn bởi: {asset.current_holder_dept || '-'}</p>
            {asset.expected_return_date && (
              <p className="text-xs text-amber-800 mt-1 font-bold">
                Hạn trả hiện tại: {new Date(asset.expected_return_date).toLocaleDateString('vi-VN')}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Số ngày gia hạn thêm <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              max="90"
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Lý do gia hạn <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do xin gia hạn (VD: Hồ sơ chưa xong)..."
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim() || days <= 0}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận gia hạn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
