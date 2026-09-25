import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchRegistrationWarehouses,
  registerSelfService,
  RegistrationWarehouse,
  USERNAME_PATTERN,
} from '../api/selfRegistration';
import {
  ShieldCheck, UserPlus, User, Lock, ArrowRight, Clock, Eye, EyeOff,
  AlertCircle, Building2, Phone, Warehouse as WarehouseIcon, Loader2,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const inputClass =
  'w-full py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] text-sm text-slate-900 placeholder:text-slate-400';

export const Register: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [purpose, setPurpose] = useState('');

  const [warehouses, setWarehouses] = useState<RegistrationWarehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState('');
  const [registeredCount, setRegisteredCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchRegistrationWarehouses();
        if (!cancelled) setWarehouses(list);
      } catch (err: any) {
        if (!cancelled) setWarehouseError(err?.message || 'Không tải được danh sách kho.');
      } finally {
        if (!cancelled) setLoadingWarehouses(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleWarehouse = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds(prev => (prev.length === warehouses.length ? [] : warehouses.map(w => w.id)));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!fullName.trim()) {
      toast.error('Vui lòng nhập họ và tên');
      return;
    }
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      toast.error('Tên đăng nhập 3–30 ký tự: chữ thường không dấu, số, . _ -');
      return;
    }
    if (password.length < 8) {
      toast.error('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một kho cần tra cứu');
      return;
    }

    setLoading(true);
    try {
      await registerSelfService({
        username: cleanUsername,
        password,
        fullName,
        phone,
        organization,
        purpose,
        warehouseIds: selectedIds,
      });
      setRegisteredUsername(cleanUsername);
      setRegisteredCount(selectedIds.length);
      setRegisteredSuccess(true);
      toast.success('Đăng ký tài khoản thành công!');
    } catch (err: any) {
      const msg = err?.message || 'Đăng ký không thành công. Vui lòng thử lại.';
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
              Trạng thái: Chờ phê duyệt
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-2">Đăng ký thành công!</h2>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Tài khoản <strong>{registeredUsername}</strong> đã được tạo và đã gửi yêu cầu xin quyền tra cứu{' '}
              <strong>{registeredCount}</strong> kho tới Quản lý kho phụ trách.
            </p>
          </div>

          <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl text-left text-xs text-blue-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-blue-950">
              <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" />
              Các bước tiếp theo:
            </div>
            <p>• Quản trị viên hoặc Quản lý kho sẽ duyệt từng kho và cấp thời hạn tra cứu.</p>
            <p>• Bạn có thể đăng nhập bất cứ lúc nào để xem yêu cầu nào đã được duyệt, và xin thêm kho khác ở mục <strong>Quyền truy cập của tôi</strong>.</p>
          </div>

          <Link
            to="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-900/10 transition cursor-pointer"
          >
            <span>Về trang Đăng nhập</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        <div className="mx-auto h-16 w-16 bg-[#1E3A8A] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 mb-4">
          <UserPlus className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Đăng Ký Tài Khoản</h2>
        <p className="mt-1 text-sm text-gray-600 font-medium">
          Hệ thống Quản lý Giấy chứng nhận QSDĐ & TSĐB — VMT
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-2xl sm:px-10 space-y-6">
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Lưu ý:</strong> Tài khoản mới ở trạng thái <strong>chờ duyệt</strong>. Quản trị viên hoặc Quản lý kho
              phụ trách sẽ phê duyệt từng kho bạn chọn và cấp thời hạn tra cứu.
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
              <div>{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={120}
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className={inputClass + ' pl-10 pr-3.5'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={30}
                autoComplete="username"
                placeholder="nguyenvana"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={inputClass + ' px-3.5'}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                3–30 ký tự: chữ thường không dấu, chữ số, dấu chấm, gạch dưới hoặc gạch ngang.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Mật khẩu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Tối thiểu 8 ký tự"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={inputClass + ' pl-10 pr-10'}
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
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={inputClass + ' pl-10 pr-3.5'}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Số điện thoại</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    maxLength={30}
                    placeholder="09xx xxx xxx"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className={inputClass + ' pl-10 pr-3.5'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cơ quan / Đơn vị</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="Ngân hàng / Công ty..."
                    value={organization}
                    onChange={e => setOrganization(e.target.value)}
                    className={inputClass + ' pl-10 pr-3.5'}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mục đích tra cứu</label>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="VD: Đối chiếu hồ sơ tài sản bảo đảm phục vụ thẩm định..."
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                className={inputClass + ' px-3.5 resize-none'}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Kho cần tra cứu <span className="text-red-500">*</span>
                </label>
                {warehouses.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                  >
                    {selectedIds.length === warehouses.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                )}
              </div>

              {loadingWarehouses ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách kho...
                </div>
              ) : warehouseError ? (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                  {warehouseError}
                </div>
              ) : warehouses.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-xl">
                  Chưa có kho nào để chọn. Vui lòng liên hệ Quản trị viên.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {warehouses.map(w => (
                    <label
                      key={w.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(w.id)}
                        onChange={() => toggleWarehouse(w.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                      />
                      <WarehouseIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800">{w.name}</span>
                      {w.code && <span className="text-xs text-slate-400 font-mono">{w.code}</span>}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Mỗi kho do Quản lý kho tương ứng duyệt riêng. Sau này bạn vẫn có thể xin thêm kho khác.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || loadingWarehouses || !!warehouseError}
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

export default Register;