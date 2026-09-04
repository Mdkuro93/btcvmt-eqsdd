import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchWarehouses } from '../api/assets';
import { submitAccessRequests } from '../api/accessRequests';
import { Warehouse } from '../types';
import { 
  Building2, 
  Warehouse as WarehouseIcon, 
  ShieldCheck, 
  CheckCircle2, 
  Send, 
  ArrowLeft, 
  Mail, 
  Phone, 
  User, 
  FileText,
  AlertCircle
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const RegisterAccess: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const whs = await fetchWarehouses();
        setWarehouses(whs);
      } catch (err) {
        console.warn('Error loading warehouses for registration:', err);
      } finally {
        setLoadingWarehouses(false);
      }
    }
    load();
  }, []);

  const handleToggleWarehouse = (whId: string) => {
    setSelectedWarehouseIds(prev => 
      prev.includes(whId) ? prev.filter(id => id !== whId) : [...prev, whId]
    );
  };

  const handleSelectAllWarehouses = () => {
    if (selectedWarehouseIds.length === warehouses.length) {
      setSelectedWarehouseIds([]);
    } else {
      setSelectedWarehouseIds(warehouses.map(w => w.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Vui lòng nhập Họ và tên');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Vui lòng nhập Email hợp lệ');
      return;
    }
    if (!organization.trim()) {
      toast.error('Vui lòng nhập Đơn vị công tác / Phòng ban');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Vui lòng nêu rõ Mục đích tra cứu');
      return;
    }
    if (selectedWarehouseIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một Kho lưu trữ muốn xin cấp quyền xem');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitAccessRequests({
        full_name: fullName,
        email: email,
        phone: phone,
        organization: organization,
        purpose: purpose,
        warehouse_ids: selectedWarehouseIds,
      });

      setSubmittedCount(res.count);
      setSubmittedSuccess(true);
      toast.success('Gửi yêu cầu đăng ký thành công!');
    } catch (err: any) {
      toast.error('Lỗi gửi yêu cầu: ' + (err.message || 'Vui lòng thử lại sau'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      <div className="max-w-3xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#1E3A8A] transition"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại trang Đăng nhập
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 bg-blue-100/70 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" /> Phê duyệt theo Kho
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
          
          {/* Card Header Banner */}
          <div className="bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] px-6 sm:px-8 py-8 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/15 backdrop-blur-sm rounded-xl">
                <WarehouseIcon className="w-7 h-7 text-blue-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Đăng Ký Quyền Xem Sổ Theo Kho</h1>
                <p className="text-xs sm:text-sm text-blue-100 mt-1">
                  Hệ thống Quản lý Giấy chứng nhận QSDĐ & TSĐB — Ban Tài Chính VMT
                </p>
              </div>
            </div>
          </div>

          {submittedSuccess ? (
            <div className="p-8 sm:p-12 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-slate-900">Yêu Cầu Đã Được Gửi Thành Công!</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Đã ghi nhận yêu cầu xin cấp quyền xem <strong>{submittedCount} kho lưu trữ</strong> cho tài khoản <strong>{email}</strong>.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left text-xs text-slate-700 space-y-3 max-w-lg mx-auto">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-[#1E3A8A] flex items-center justify-center font-bold flex-shrink-0 text-xs">1</div>
                  <span>Ban Quản Trị hoặc Thủ kho phụ trách sẽ tiến hành rà soát thông tin và thẩm định mục đích tra cứu.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-[#1E3A8A] flex items-center justify-center font-bold flex-shrink-0 text-xs">2</div>
                  <span>Sau khi được phê duyệt, bạn có thể dùng Tên đăng nhập hoặc Email <strong>{email}</strong> để đăng nhập bằng mã OTP hoặc mật khẩu.</span>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/login"
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition shadow-md shadow-blue-900/10"
                >
                  Về trang Đăng nhập
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedSuccess(false);
                    setSelectedWarehouseIds([]);
                    setPurpose('');
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Gửi yêu cầu khác
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
              
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Lưu ý bảo mật:</strong> Quyền xem được cấp theo từng kho lưu trữ cụ thể. Sau khi được duyệt, bạn chỉ được tra cứu các GCN hiện đang được lưu giữ tại các kho đã đăng ký.
                </div>
              </div>

              {/* Personal Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Họ và tên <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Email công vụ / cá nhân <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="chuyenvien@nganhang.com"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Số điện thoại liên hệ
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="0912 345 678"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Đơn vị công tác / Phòng ban <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={organization}
                      onChange={e => setOrganization(e.target.value)}
                      placeholder="Ngân hàng Vietcombank - CN Tân Định"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Mục đích sử dụng / Tra cứu hồ sơ <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <textarea
                    required
                    rows={3}
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    placeholder="VD: Thẩm định hồ sơ pháp lý & tình trạng thế chấp GCN phục vụ phê duyệt hạn mức tín dụng..."
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                  />
                </div>
              </div>

              {/* Warehouse Multi-select */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Chọn Kho lưu trữ xin cấp quyền xem <span className="text-red-500">*</span>
                    </label>
                    <span className="text-xs text-slate-500">
                      Đã chọn: {selectedWarehouseIds.length} / {warehouses.length} kho
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllWarehouses}
                    className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    {selectedWarehouseIds.length === warehouses.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả kho'}
                  </button>
                </div>

                {loadingWarehouses ? (
                  <div className="p-8 text-center text-xs text-slate-500">Đang tải danh sách kho...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                    {warehouses.map(w => {
                      const isSelected = selectedWarehouseIds.includes(w.id);
                      return (
                        <div
                          key={w.id}
                          onClick={() => handleToggleWarehouse(w.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-500 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Handled by parent div
                            className="mt-1 h-4 w-4 rounded text-[#1E3A8A] focus:ring-blue-500 border-gray-300 pointer-events-none"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">{w.name}</span>
                              {w.is_central && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                                  Kho Tổng
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Mã kho: <span className="font-mono">{w.code || '-'}</span> • {w.regions?.name || 'Toàn quốc'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <Link
                  to="/login"
                  className="px-5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy bỏ
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition shadow-md shadow-blue-900/10 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Đang gửi yêu cầu...' : 'Gửi Đăng Ký Truy Cập'}
                </button>
              </div>

            </form>
          )}

        </div>
      </div>
    </div>
  );
};
