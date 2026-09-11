import React, { useState, useEffect } from 'react';
import { AppUserSession } from '../../types';
import { fetchAllAppUsers, approveAppUser, rejectAppUser } from '../../services/auth';
import { 
  Users, RotateCcw, Clock, CheckCircle2, UserX, 
  Search, X, Infinity as InfinityIcon, Calendar 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { LoadingFallback } from '../LoadingFallback';

export const AdminAppUsers: React.FC = () => {
  const [appUsers, setAppUsers] = useState<AppUserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [appUserFilter, setAppUserFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [appUserSearch, setAppUserSearch] = useState<string>('');

  // Approval modal states
  const [approvingAppUser, setApprovingAppUser] = useState<AppUserSession | null>(null);
  const [approvalDays, setApprovalDays] = useState<number>(7);
  const [customApprovalDate, setCustomApprovalDate] = useState<string>('');
  const [isUnlimitedAccess, setIsUnlimitedAccess] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allUsers = await fetchAllAppUsers().catch(() => []);
      setAppUsers(allUsers || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải danh sách tài khoản app_users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveAppUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingAppUser) return;

    setIsApproving(true);
    try {
      let expiresAtIso: string | null = null;
      if (!isUnlimitedAccess) {
        if (customApprovalDate) {
          expiresAtIso = new Date(customApprovalDate).toISOString();
        } else {
          expiresAtIso = new Date(Date.now() + approvalDays * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      await approveAppUser(approvingAppUser.id, expiresAtIso);
      toast.success(
        `Đã duyệt tài khoản "${approvingAppUser.username}" thành công! ${
          expiresAtIso ? `Hạn đến: ${format(new Date(expiresAtIso), 'dd/MM/yyyy HH:mm')}` : 'Thời hạn: Vô thời hạn'
        }`
      );
      setApprovingAppUser(null);
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi phê duyệt: ' + (err.message || 'Thao tác thất bại'));
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectAppUser = async (user: AppUserSession) => {
    if (!window.confirm(`Bạn có chắc chắn muốn từ chối (status = rejected) tài khoản "${user.username}"?`)) {
      return;
    }
    try {
      await rejectAppUser(user.id);
      toast.success(`Đã từ chối tài khoản "${user.username}"`);
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi từ chối: ' + (err.message || 'Thao tác thất bại'));
    }
  };

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải danh sách tài khoản app_users..."
        onRetry={loadData}
        onForceLocal={() => {
          setAppUsers([]);
          setLoading(false);
        }}
      />
    );
  }

  const filteredAppUsers = appUsers
    .filter(u => {
      if (appUserFilter === 'pending') return u.status === 'pending';
      if (appUserFilter === 'approved') return u.status === 'approved';
      if (appUserFilter === 'rejected') return u.status === 'rejected';
      return true;
    })
    .filter(u => {
      if (!appUserSearch.trim()) return true;
      return u.username?.toLowerCase().includes(appUserSearch.toLowerCase().trim());
    });

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1E3A8A]" />
            Quản lý danh sách tài khoản (bảng public.app_users)
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Dữ liệu được truy vấn từ bảng <span className="font-mono font-semibold">app_users</span>. Admin có quyền phê duyệt (<span className="font-semibold text-emerald-700">approved</span>), từ chối (<span className="font-semibold text-red-700">rejected</span>) và thiết lập ngày hết hạn tra cứu (<span className="font-semibold text-blue-700">access_expires_at</span>).
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Làm mới danh sách
        </button>
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setAppUserFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              appUserFilter === 'all'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tất cả ({appUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setAppUserFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              appUserFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <Clock className="w-3 h-3" />
            Chờ duyệt ({appUsers.filter(u => u.status === 'pending').length})
          </button>
          <button
            type="button"
            onClick={() => setAppUserFilter('approved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              appUserFilter === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Đã duyệt ({appUsers.filter(u => u.status === 'approved').length})
          </button>
          <button
            type="button"
            onClick={() => setAppUserFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
              appUserFilter === 'rejected'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
            }`}
          >
            <UserX className="w-3 h-3" />
            Bị từ chối ({appUsers.filter(u => u.status === 'rejected').length})
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={appUserSearch}
            onChange={(e) => setAppUserSearch(e.target.value)}
            placeholder="Tìm theo tên đăng nhập..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
          />
          {appUserSearch && (
            <button
              type="button"
              onClick={() => setAppUserSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bảng danh sách app_users */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase">
            <tr>
              <th className="px-4 py-3">Tên đăng nhập (Username)</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3">Trạng thái (status)</th>
              <th className="px-4 py-3">Hạn tra cứu (access_expires_at)</th>
              <th className="px-4 py-3 text-right">Thao tác quản trị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAppUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-gray-500">
                  <p className="font-medium text-gray-700">Không tìm thấy tài khoản nào phù hợp.</p>
                  <p className="text-xs text-gray-400 mt-1">Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
                </td>
              </tr>
            ) : (
              filteredAppUsers.map((user) => {
                const isApproved = user.status === 'approved';
                const isPending = user.status === 'pending';
                const isRejected = user.status === 'rejected';

                // Kiểm tra tình trạng hạn tra cứu
                let expiryBadge = null;
                if (!user.access_expires_at) {
                  expiryBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      <InfinityIcon className="w-3 h-3" />
                      Vô thời hạn
                    </span>
                  );
                } else {
                  const expireDate = new Date(user.access_expires_at);
                  const isExpired = expireDate.getTime() <= Date.now();
                  expiryBadge = (
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-gray-900">
                        {format(expireDate, 'dd/MM/yyyy HH:mm')}
                      </div>
                      {isExpired ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                          Đã hết hạn
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Còn hiệu lực
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#1E3A8A] flex items-center justify-center font-mono text-xs font-bold shrink-0">
                          {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                        </span>
                        <span className="truncate">{user.username}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5 ml-9">ID: {user.id}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {user.role || 'user'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          approved (Đã duyệt)
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          pending (Chờ duyệt)
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                          <UserX className="w-3.5 h-3.5 text-red-600" />
                          rejected (Từ chối)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {expiryBadge}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setApprovingAppUser(user);
                            if (user.access_expires_at) {
                              setIsUnlimitedAccess(false);
                              setCustomApprovalDate(format(new Date(user.access_expires_at), "yyyy-MM-dd'T'HH:mm"));
                            } else {
                              setIsUnlimitedAccess(false);
                              setApprovalDays(7);
                              setCustomApprovalDate('');
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                          title="Phê duyệt hoặc điều chỉnh hạn tra cứu"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isApproved ? 'Gia hạn' : 'Phê duyệt'}</span>
                        </button>

                        {!isRejected && (
                          <button
                            type="button"
                            onClick={() => handleRejectAppUser(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                            title="Từ chối quyền truy cập của tài khoản"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Từ chối</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: Approve app_user and set access_expires_at */}
      {approvingAppUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Phê duyệt &amp; Thiết lập hạn tra cứu
              </h3>
              <button 
                onClick={() => setApprovingAppUser(null)} 
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-xs text-slate-500">Tài khoản được duyệt:</div>
              <div className="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>{approvingAppUser.username}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                  role: {approvingAppUser.role || 'user'}
                </span>
              </div>
            </div>

            <form onSubmit={handleApproveAppUserSubmit} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-900 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={isUnlimitedAccess}
                    onChange={(e) => setIsUnlimitedAccess(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <span>Cho phép tra cứu Vô thời hạn (access_expires_at = null)</span>
                </label>
              </div>

              {!isUnlimitedAccess && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      1. Chọn nhanh thời hạn tra cứu:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '24 giờ', days: 1 },
                        { label: '3 ngày', days: 3 },
                        { label: '7 ngày', days: 7 },
                        { label: '30 ngày', days: 30 },
                        { label: '90 ngày', days: 90 },
                        { label: '180 ngày', days: 180 },
                        { label: '365 ngày', days: 365 },
                      ].map((preset) => (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => {
                            setApprovalDays(preset.days);
                            setCustomApprovalDate('');
                          }}
                          className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                            approvalDays === preset.days && !customApprovalDate
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      2. Hoặc chỉ định ngày &amp; giờ hết hạn cụ thể:
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <input
                        type="datetime-local"
                        value={customApprovalDate}
                        onChange={(e) => setCustomApprovalDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                <strong>Thời hạn sẽ áp dụng: </strong>
                {isUnlimitedAccess ? (
                  <span className="font-bold text-emerald-800">Vô thời hạn (Không giới hạn ngày tra cứu)</span>
                ) : customApprovalDate ? (
                  format(new Date(customApprovalDate), 'dd/MM/yyyy HH:mm')
                ) : (
                  format(new Date(Date.now() + approvalDays * 24 * 60 * 60 * 1000), 'dd/MM/yyyy HH:mm')
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setApprovingAppUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isApproving ? 'Đang lưu...' : 'Xác nhận Phê duyệt (approved)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
