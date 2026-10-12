import React from 'react';
import { Clock, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';

export interface IdleWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export const IdleWarningModal: React.FC<IdleWarningModalProps> = ({
  isOpen,
  secondsRemaining,
  onStayLoggedIn,
  onLogout,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Phiên sắp hết hạn</h3>
            <p className="text-xs text-amber-100">Bảo mật phiên làm việc hệ thống</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed text-left flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Bạn không thao tác trong thời gian gần đây. Để bảo vệ dữ liệu Giấy chứng nhận và bảo đảm an toàn hệ thống, phiên làm việc sẽ tự động kết thúc sau:
            </span>
          </div>

          {/* Bộ đếm ngược */}
          <div className="py-2">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl">
              <Clock className="w-5 h-5 text-rose-600 dark:text-rose-400 animate-pulse" />
              <span className="font-mono text-2xl font-black text-rose-600 dark:text-rose-400">
                00:{secondsRemaining < 10 ? `0${secondsRemaining}` : secondsRemaining}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
              Bạn có muốn tiếp tục làm việc không?
            </p>
          </div>

          {/* Hành động */}
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Đăng xuất</span>
            </button>

            <button
              type="button"
              onClick={onStayLoggedIn}
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tiếp tục làm việc</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
