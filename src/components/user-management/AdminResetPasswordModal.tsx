import React, { useState } from 'react';
import { KeyRound, X, Eye, EyeOff, Check, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Profile } from '../../types';
import { adminResetUserPassword } from '../../api/users';

interface AdminResetPasswordModalProps {
  user: Profile | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AdminResetPasswordModal: React.FC<AdminResetPasswordModalProps> = ({
  user,
  onClose,
  onSuccess,
}) => {
  const [newPassword, setNewPassword] = useState('Abc@123456');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(`${res}@123`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có tối thiểu 6 ký tự');
      return;
    }

    try {
      setLoading(true);
      await adminResetUserPassword(user.id, newPassword);
      toast.success(`Đã đặt lại mật khẩu cho tài khoản ${user.email || user.username || user.full_name} thành công!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Đặt lại mật khẩu</h3>
              <p className="text-xs text-gray-500">Cấp lại mật khẩu đăng nhập cho người dùng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
          <div className="text-xs text-gray-500">Người dùng:</div>
          <div className="text-sm font-semibold text-gray-900">{user.full_name || 'Chưa cập nhật tên'}</div>
          <div className="text-xs text-gray-600">{user.email || user.username}</div>
          {user.organization && (
            <div className="text-xs text-blue-700 font-medium pt-1">Đơn vị: {user.organization}</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Mật khẩu mới <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-[11px] text-[#1E3A8A] hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Tạo ngẫu nhiên
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới..."
                className="w-full pl-3 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-transparent font-mono transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Mật khẩu mới sẽ có hiệu lực ngay lập tức. Hãy gửi thông tin mật khẩu mới cho người dùng sau khi lưu.
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium cursor-pointer transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white rounded-lg font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 transition"
            >
              {loading ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Xác nhận đặt lại mật khẩu</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
