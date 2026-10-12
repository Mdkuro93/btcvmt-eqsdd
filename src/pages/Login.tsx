import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Search, ArrowLeftRight, BookText, User, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { ThemeToggle } from '../components/ThemeToggle';

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

  const points = [
    { icon: Search, title: 'Tra cứu tức thì', text: 'Tìm theo số GCN, mã TSĐB, lô, dự án.' },
    { icon: ArrowLeftRight, title: 'Kiểm soát kho và thế chấp', text: 'Mọi lần nhập, xuất, luân chuyển đều có phiếu.' },
    { icon: BookText, title: 'Nhật ký biến động đầy đủ', text: 'Ai đổi gì, khi nào, đều được lưu lại để đối chiếu.' },
  ];

  const fieldWrap = 'flex items-center gap-2.5 h-11 px-3 border border-border-strong rounded-[10px] bg-bg text-faint focus-within:border-blue-500 focus-within:ring-[3px] focus-within:ring-ring transition';

  return (
    <div className="min-h-screen flex flex-wrap bg-bg text-text">
      <Toaster position="top-right" />

      {/* Cột thương hiệu */}
      <section className="hidden lg:flex flex-1 min-w-[520px] relative overflow-hidden bg-brand text-brand-fg px-16 py-14 flex-col justify-between gap-12">
        <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 w-full h-full">
          <g fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1.2">
            <path d="M-20 520 L180 470 L330 540 L300 700 L90 760 Z" />
            <path d="M180 470 L260 330 L430 360 L330 540" />
            <path d="M430 360 L560 440 L520 600 L330 540" />
            <path d="M300 700 L520 600 L640 700 L560 880 L330 900" />
            <path d="M260 330 L300 190 L470 160 L430 360" />
            <path d="M470 160 L620 220 L560 440" />
            <path d="M90 760 L120 900" />
          </g>
        </svg>

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-accent text-accent-ink flex items-center justify-center font-bold text-base" aria-hidden="true">eQ</div>
          <div>
            <div className="font-bold text-[17px]">eQSDĐ &amp; TSĐB</div>
            <div className="text-[11px] uppercase tracking-[1.4px] text-brand-muted">Ban Tài chính · Tập đoàn VMT</div>
          </div>
        </div>

        <div className="relative max-w-[520px]">
          <h1 className="text-[38px] leading-[1.2] font-bold tracking-tight">Quản lý GCN QSDĐ và tài sản bảo đảm trên một hệ thống</h1>
          <p className="mt-4 text-base text-brand-muted">Hồ sơ pháp lý, tình trạng lưu kho và biến động quyền sở hữu được theo dõi tập trung, có phân quyền theo từng vùng và kho.</p>
          <ul className="mt-7 space-y-3.5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                </span>
                <span>
                  <strong className="font-semibold text-brand-fg">{title}</strong>
                  <br />
                  <span className="text-[13px] text-brand-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-brand-muted">Hệ thống nội bộ. Chỉ dành cho người dùng được cấp quyền.</div>
      </section>

      {/* Cột đăng nhập */}
      <section className="flex-1 min-w-[320px] px-4 sm:px-8 py-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-[420px] space-y-5">
          <div className="flex items-center justify-between">
            <div className="lg:hidden flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-[9px] bg-accent text-accent-ink flex items-center justify-center font-bold" aria-hidden="true">eQ</div>
              <div className="font-bold">eQSDĐ &amp; TSĐB</div>
            </div>
            <div className="ml-auto"><ThemeToggle variant="dropdown" /></div>
          </div>

          <form onSubmit={handleLogin} className="bg-surface border border-border rounded-2xl p-8 shadow-[var(--shadow-sm)] space-y-5">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight">Đăng nhập</h2>
              <p className="mt-1 text-sm text-muted">Dùng tên đăng nhập và mật khẩu do Quản trị viên cấp.</p>
            </div>

            {errorMessage && (
              <div role="alert" className="p-3.5 bg-danger-bg text-danger-fg text-sm rounded-[10px] flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Đăng nhập không thành công</p>
                  <p className="text-xs mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-username" className="block text-[13px] font-semibold">Tên đăng nhập</label>
              <div className={fieldWrap}>
                <User className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                <input
                  id="login-username"
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ví dụ: nguyen.van.a"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-text placeholder:text-faint"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-[13px] font-semibold">Mật khẩu</label>
              <div className={`${fieldWrap} pr-2`}>
                <Lock className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-text placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:text-text cursor-pointer"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[46px] inline-flex items-center justify-center gap-2 rounded-[10px] bg-accent text-accent-ink text-[15px] font-semibold hover:brightness-95 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60 transition cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>

            <p className="text-center text-[13px] text-muted">Quên mật khẩu? Liên hệ Quản trị viên để được cấp lại.</p>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border border-dashed border-border-strong rounded-xl text-[13px] text-muted">
            <span>Chưa có tài khoản? Hồ sơ đăng ký chờ Quản trị viên duyệt.</span>
            <Link to="/register" className="text-link font-semibold hover:underline">Đăng ký tài khoản</Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;