import React, { useState, useEffect } from 'react';
import { Profile } from '../../types';
import { Calendar, Clock, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { calculateExpiryDate } from './constants';

interface ExtendAccessModalProps {
  user: Profile;
  onClose: () => void;
  onExtend: (expiresAt: string) => Promise<void>;
  loading: boolean;
}

export const ExtendAccessModal: React.FC<ExtendAccessModalProps> = ({
  user,
  onClose,
  onExtend,
  loading,
}) => {
  const [extendPreset, setExtendPreset] = useState<'24h' | '3d' | '7d' | '30d' | 'custom'>('7d');
  const [extendCustomDate, setExtendCustomDate] = useState<string>('');

  useEffect(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setExtendCustomDate(d.toISOString().slice(0, 16));
  }, []);

  const handleConfirm = () => {
    const expiresAt = calculateExpiryDate(extendPreset, extendCustomDate);
    onExtend(expiresAt);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Gia hạn quyền tra cứu</h3>
              <p className="text-xs text-gray-500">Cập nhật thời gian hết hạn mới (access_expires_at)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
          <div className="font-semibold text-gray-900">{user.full_name} ({user.email})</div>
          {user.access_expires_at && (
            <div className="text-xs text-gray-500 mt-1">
              Hạn hiện tại: {format(new Date(user.access_expires_at), 'dd/MM/yyyy HH:mm')}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-800">
            Chọn thời gian gia hạn:
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: '24h', label: '+24 Giờ' },
              { key: '3d', label: '+3 Ngày' },
              { key: '7d', label: '+7 Ngày' },
              { key: '30d', label: '+30 Ngày' },
              { key: 'custom', label: 'Chọn ngày cụ thể' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setExtendPreset(item.key as any)}
                className={`py-2 px-2 text-xs font-medium rounded-lg border text-center transition cursor-pointer ${
                  extendPreset === item.key
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {extendPreset === 'custom' && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Ngày &amp; Giờ kết thúc mới:
              </label>
              <input
                type="datetime-local"
                value={extendCustomDate}
                onChange={e => setExtendCustomDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
              />
            </div>
          )}

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-2">
            <Clock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <span>Hạn mới sẽ kéo dài đến: </span>
              <strong className="block text-sm text-blue-950 mt-0.5">
                {format(new Date(calculateExpiryDate(extendPreset, extendCustomDate)), 'HH:mm:ss - dd/MM/yyyy')}
              </strong>
            </div>
          </div>
        </div>

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
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>Cập nhật Hạn Tra Cứu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
