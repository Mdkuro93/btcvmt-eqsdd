import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, Users } from 'lucide-react';

interface StatsProps {
  stats: {
    total: number;
    pendingCount: number;
    approvedActiveCount: number;
    expiredCount: number;
    internalCount: number;
  };
  activeTab: 'all' | 'pending' | 'approved' | 'expired' | 'internal';
  onSelectTab: (tab: 'all' | 'pending' | 'approved' | 'expired' | 'internal') => void;
}

export const UserManagementStats: React.FC<StatsProps> = ({ stats, activeTab, onSelectTab }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Pending Card */}
      <button
        type="button"
        onClick={() => onSelectTab('pending')}
        className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
          activeTab === 'pending'
            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/50 shadow-sm'
            : 'bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              {stats.pendingCount > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Chờ phê duyệt
          </span>
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-amber-900">{stats.pendingCount}</span>
          <span className="text-xs text-amber-700 font-medium">tài khoản tự đăng ký</span>
        </div>
      </button>

      {/* Active Approved Card */}
      <button
        type="button"
        onClick={() => onSelectTab('approved')}
        className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
          activeTab === 'approved'
            ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/50 shadow-sm'
            : 'bg-white border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
            Đã duyệt &amp; Còn hạn
          </span>
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-900">{stats.approvedActiveCount}</span>
          <span className="text-xs text-emerald-700 font-medium">đang có quyền tra cứu</span>
        </div>
      </button>

      {/* Expired Card */}
      <button
        type="button"
        onClick={() => onSelectTab('expired')}
        className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
          activeTab === 'expired'
            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/50 shadow-sm'
            : 'bg-white border-gray-200 hover:border-rose-300 hover:bg-rose-50/40 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
            Hết hạn tra cứu
          </span>
          <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-rose-900">{stats.expiredCount}</span>
          <span className="text-xs text-rose-700 font-medium">cần gia hạn lại</span>
        </div>
      </button>

      {/* Total Card */}
      <button
        type="button"
        onClick={() => onSelectTab('all')}
        className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
          activeTab === 'all'
            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/50 shadow-sm'
            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-800">
            Tổng số người dùng
          </span>
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-blue-900">{stats.total}</span>
          <span className="text-xs text-blue-700 font-medium">toàn hệ thống</span>
        </div>
      </button>
    </div>
  );
};
