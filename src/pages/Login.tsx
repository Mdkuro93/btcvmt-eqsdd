import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Role } from '../contexts/AuthContext';
import { ShieldCheck, UserCheck, KeyRound, ArrowRight } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vui lòng nhập Email');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, 'btc_manager');
      toast.success('Đăng nhập thành công');
      navigate('/');
    } catch (err: any) {
      toast.error('Đăng nhập thất bại: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: Role, demoEmail: string) => {
    setLoading(true);
    try {
      await signIn(demoEmail, role);
      toast.success(`Đã đăng nhập vai trò: ${role}`);
      navigate('/');
    } catch (err: any) {
      toast.error('Lỗi đăng nhập quick: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts: { role: Role; label: string; email: string; desc: string }[] = [
    { role: 'btc_manager', label: 'Ban Tài Chính (BTC)', email: 'btc_manager@btcvmt.vn', desc: 'Duyệt tất cả yêu cầu, Import & Quản trị' },
    { role: 'capital_dept', label: 'Ban Nguồn Vốn', email: 'capital@btcvmt.vn', desc: 'Gửi yêu cầu mượn/xuất sổ & Thế chấp' },
    { role: 'project_dept', label: 'Ban Dự Án Đầu Tư', email: 'project@btcvmt.vn', desc: 'Gửi yêu cầu mượn/xuất sổ & Tách thửa' },
    { role: 're_dept', label: 'Ban Kinh Doanh BĐS', email: 're_dept@btcvmt.vn', desc: 'Gửi yêu cầu xuất bán & Cập nhật SS bán' },
    { role: 'viewer', label: 'Viewer (Khách / Đơn vị ngoài)', email: 'viewer@btcvmt.vn', desc: 'Chỉ tra cứu tình trạng GCN' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 bg-[#1E3A8A] text-white rounded-2xl flex items-center justify-center shadow-lg mb-4">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900">Quản Lý GCN QSDĐ</h2>
        <p className="mt-2 text-sm text-gray-600">Hệ thống theo dõi & duyệt biến động Sổ Đỏ BTC VMT</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 shadow-md border border-gray-200 rounded-xl sm:px-10 space-y-6">
          <form onSubmit={handleCustomLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email đăng nhập</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@btcvmt.vn"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4 mr-2" /> Đăng nhập
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-gray-500 font-semibold">Hoặc chọn tài khoản thử nghiệm nhanh</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {demoAccounts.map((acc) => (
              <button
                key={acc.role}
                onClick={() => handleQuickLogin(acc.role, acc.email)}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 group-hover:bg-blue-100 text-gray-600 group-hover:text-[#1E3A8A] rounded-lg">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 group-hover:text-[#1E3A8A]">{acc.label}</div>
                    <div className="text-xs text-gray-500">{acc.desc}</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#1E3A8A]" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
