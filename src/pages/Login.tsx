import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, User, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithPassword } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      toast.error('Vui lòng nhập Tên đăng nhập');
      return;
    }
    if (!password) {
      toast.error('Vui lòng nhập Mật khẩu');
      return;
    }

    setLoading(true);
    try {
      const res = await signInWithPassword(cleanUsername, password);
      toast.success('Đăng nhập thành công!');

      // Điều hướng theo vai trò
      const userRole = res?.profile?.role;
      if (userRole === 'admin' || userRole === 'super_admin') {
        navigate('/');
      } else {
        navigate('/lookup');
      }
    } catch (err: any) {
      const msg = err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 bg-[#1E3A8A] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Hệ Thống eQSDĐ & TSĐB
        </h2>
        <p className="mt-1 text-sm text-gray-600 font-medium">
          Ban Tài Chính — Tập Đoàn VMT
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-2xl sm:px-10 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-900">Đăng nhập hệ thống</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập Tên đăng nhập và Mật khẩu của bạn để truy cập
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3 animate-in fade-in duration-150">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
              <div>
                <p className="font-semibold">Đăng nhập không thành công</p>
                <p className="text-xs mt-0.5 text-red-600">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form đăng nhập chỉ nhập Tên đăng nhập và Mật khẩu */}
          <form onSubmit={handleLogin} className="space-y-4">
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập của bạn..."
                  className="w-full pl-10 pr-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] text-sm text-slate-900 font-medium placeholder:text-slate-400"
                />
              </div>
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-md shadow-blue-900/10 text-sm font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1E3A8A] disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </form>

          {/* Registration link */}
          <div className="pt-4 border-t border-slate-200">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Chưa có tài khoản?</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Đăng ký tài khoản tra cứu (hồ sơ sẽ chờ Quản trị viên duyệt).
                </p>
              </div>
              <Link
                to="/register"
                className="whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer shrink-0"
              >
                Đăng ký ngay <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
