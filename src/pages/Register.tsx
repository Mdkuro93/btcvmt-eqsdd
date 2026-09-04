import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { registerUser } from '../services/auth';
import { ShieldCheck, UserPlus, User, Lock, ArrowRight, Clock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      toast.error('Vui lòng nhập Tên đăng nhập');
      return;
    }

    if (password.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      // 1. Gọi đăng ký qua hàm registerUser (RPC register_user)
      await registerUser(cleanUsername, password);

      // Đồng bộ thông tin đăng ký vào context
      try {
        await signUp({
          email: `${cleanUsername}@btcvmt.vn`,
          password,
          fullName: cleanUsername,
          username: cleanUsername,
        });
      } catch (contextErr) {
        console.warn('Lưu phụ trợ context:', contextErr);
      }

      setRegisteredUsername(cleanUsername);
      setRegisteredSuccess(true);
      toast.success('Đăng ký tài khoản thành công!');
    } catch (err: any) {
      const msg = err.message || 'Đăng ký không thành công. Vui lòng thử lại.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (registeredSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Toaster position="top-right" />
        <div className="max-w-md w-full mx-auto bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 text-center space-y-5">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              Trạng thái: Chờ phê duyệt (Pending)
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-2">Đăng Ký Thành Công!</h2>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Tài khoản <strong>{registeredUsername}</strong> đã được tạo trên hệ thống với vai trò <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-800 font-mono text-xs">role: 'user'</code> và trạng thái <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-800 font-mono text-xs">status: 'pending'</code>.
            </p>
          </div>

          <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl text-left text-xs text-blue-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-blue-950">
              <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" />
              Quy định quyền tra cứu dữ liệu:
            </div>
            <p>
              • Tài khoản chỉ được phép tra cứu sau khi được <strong>Quản trị viên (Admin)</strong> phê duyệt sang trạng thái <strong className="text-emerald-700">approved</strong> và thiết lập <strong>ngày hết hạn (access_expires_at)</strong>.
            </p>
            <p>
              • Nếu tài khoản chưa duyệt hoặc đã hết hạn, hệ thống sẽ tự động khóa tính năng tra cứu.
            </p>
          </div>

          <Link
            to="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-900/10 transition cursor-pointer"
          >
            <span>Quay lại trang Đăng nhập</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 bg-[#1E3A8A] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4">
          <UserPlus className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Đăng Ký Tài Khoản
        </h2>
        <p className="mt-1 text-sm text-gray-600 font-medium">
          Hệ thống Quản lý Giấy chứng nhận QSDĐ & TSĐB — VMT
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-2xl sm:px-10 space-y-6">
          
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Lưu ý:</strong> Tài khoản mới tạo sẽ có trạng thái <code className="bg-amber-100 px-1 rounded font-mono">status = 'pending'</code>. Quản trị viên sẽ phê duyệt và cấp thời hạn tra cứu trước khi bạn có thể xem dữ liệu.
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Form đăng ký: CHỈ NHẬP TÊN ĐĂNG NHẬP VÀ MẬT KHẨU (KHÔNG YÊU CẦU EMAIL) */}
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <div className="relative rounded-lg">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: nguyenvana, ketoan01..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] text-sm text-slate-900 font-medium placeholder:text-slate-400"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Chỉ sử dụng chữ cái, chữ số hoặc dấu gạch nối.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative rounded-lg">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] text-sm text-slate-900 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Xác nhận mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative rounded-lg">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Nhập lại mật khẩu..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-md shadow-blue-900/10 text-sm font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1E3A8A] disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-600">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-[#1E3A8A] font-bold hover:underline">
                Đăng nhập ngay
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
