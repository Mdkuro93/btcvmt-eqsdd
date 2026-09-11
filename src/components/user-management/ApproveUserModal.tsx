import React, { useState, useEffect } from 'react';
import { Profile } from '../../types';
import { CheckCircle2, Clock, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { calculateExpiryDate } from './constants';

interface ApproveUserModalProps {
  user: Profile;
  onClose: () => void;
  onApprove: (expiresAt: string) => Promise<void>;
  loading: boolean;
}

export const ApproveUserModal: React.FC<ApproveUserModalProps> = ({
  user,
  onClose,
  onApprove,
  loading,
}) => {
  const [expiryPreset, setExpiryPreset] = useState<'24h' | '3d' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');

  useEffect(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setCustomExpiryDate(d.toISOString().slice(0, 16));
  }, []);

  const handleConfirm = () => {
    const expiresAt = calculateExpiryDate(expiryPreset, customExpiryDate);
    onApprove(expiresAt);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Phê duyệt &amp; Cấp hạn tra cứu</h3>
              <p className="text-xs text-gray-500">Cập nhật status = 'approved' và thiết lập thời gian tra cứu tạm thời</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Details */}
        <div className="my-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Họ và tên:</span>
            <span className="font-semibold text-gray-900">{user.full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Email:</span>
            <span className="font-medium text-gray-800">{user.email}</span>
          </div>
          {user.organization && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cơ quan:</span>
              <span className="font-medium text-gray-800 text-right max-w-xs truncate">{user.organization}</span>
            </div>
          )}
          {user.purpose && (
            <div className="flex flex-col gap-1 pt-1 border-t border-gray-200">
              <span className="text-gray-500 text-xs">Mục đích tra cứu:</span>
              <span className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200">{user.purpose}</span>
            </div>
          )}
        </div>

        {/* Expiry Presets */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-800">
            Chọn thời gian tra cứu tạm thời:
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: '24h', label: '24 Giờ (1 Ngày)' },
              { key: '3d', label: '3 Ngày' },
              { key: '7d', label: '7 Ngày (1 Tuần)' },
              { key: '30d', label: '30 Ngày (1 Tháng)' },
              { key: '90d', label: '90 Ngày (3 Tháng)' },
              { key: 'custom', label: 'Tùy chỉnh' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setExpiryPreset(item.key as any)}
                className={`py-2 px-2 text-xs font-medium rounded-lg border text-center transition cursor-pointer ${
                  expiryPreset === item.key
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {expiryPreset === 'custom' && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Ngày &amp; Giờ hết hạn chính xác:
              </label>
              <input
                type="datetime-local"
                value={customExpiryDate}
                onChange={e => setCustomExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
              />
            </div>
          )}

          {/* Calculated Expiry Preview */}
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex items-start gap-2">
            <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <span>Thời hạn truy cập sẽ kết thúc vào: </span>
              <strong className="block text-sm text-emerald-950 mt-0.5">
                {format(new Date(calculateExpiryDate(expiryPreset, customExpiryDate)), 'HH:mm:ss - dd/MM/yyyy')}
              </strong>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>Xác nhận Phê duyệt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
