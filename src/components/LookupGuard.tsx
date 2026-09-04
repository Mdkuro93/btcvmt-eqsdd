import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canLookupData, checkLookupAccess } from '../lib/accessGuard';
import { Loader2, Clock, AlertTriangle, ShieldCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface LookupGuardProps {
  children?: React.ReactNode;
}

/**
 * Route Guard / Middleware Component cho trang Tra cứu GCN (/lookup).
 * Quy tắc:
 * - Người dùng chưa đăng nhập -> chuyển hướng về /login.
 * - Người dùng vai trò 'user' hoặc 'viewer':
 *   BẮT BUỘC status === 'approved' VÀ access_expires_at vẫn còn hạn sử dụng.
 * - Nếu không đáp ứng (pending, expired, rejected, disabled), hiển thị giao diện thông báo khóa quyền và cho phép đồng bộ lại trạng thái.
 */
export const LookupGuard: React.FC<LookupGuardProps> = ({ children }) => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
          <p className="text-sm text-gray-500 font-medium">Đang kiểm tra quyền tra cứu...</p>
        </div>
      </div>
    );
  }

  // 1. Chưa đăng nhập
  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  // 2. Kiểm tra điều kiện tra cứu thông qua accessGuard
  const accessResult = checkLookupAccess(profile);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      toast.success('Đã cập nhật trạng thái mới nhất từ hệ thống!');
    } catch {
      toast.error('Không thể cập nhật trạng thái.');
    } finally {
      setRefreshing(false);
    }
  };

  // Nếu không đủ điều kiện truy cập (chưa duyệt hoặc đã hết hạn)
  if (!accessResult.allowed) {
    const isPending = profile.status === 'pending';
    const isRejected = profile.status === 'rejected';

    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
              {isPending ? 'Trạng thái: Chờ phê duyệt (pending)' : 'Trạng thái: Hết hạn / Chưa được duyệt'}
            </span>
            {/* Yêu cầu cụ thể: Hiển thị thông báo 'Tài khoản đang chờ duyệt hoặc đã hết hạn' */}
            <h2 className="text-xl font-extrabold text-amber-950 tracking-tight">
              Tài khoản đang chờ duyệt hoặc đã hết hạn
            </h2>
          </div>

          <p className="text-sm text-amber-900 leading-relaxed max-w-lg mx-auto">
            {isPending ? (
              <>
                Tài khoản <strong>{profile.username || profile.email}</strong> đang ở trạng thái chờ Quản trị viên phê duyệt quyền tra cứu. Bạn chỉ có thể tra cứu khi tài khoản chuyển sang trạng thái <strong>approved</strong> và có thời hạn tra cứu hợp lệ.
              </>
            ) : isRejected ? (
              <>
                Yêu cầu tra cứu của tài khoản <strong>{profile.username || profile.email}</strong> đã bị từ chối. Vui lòng liên hệ Quản trị viên để được hỗ trợ.
              </>
            ) : (
              <>
                Quyền tra cứu của tài khoản <strong>{profile.username || profile.email}</strong> đã hết hạn {profile.access_expires_at ? `(hết hạn vào ${format(new Date(profile.access_expires_at), 'HH:mm dd/MM/yyyy')})` : ''}. Vui lòng liên hệ Quản trị viên để được gia hạn thời gian tra cứu.
              </>
            )}
          </p>

          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-sm font-semibold shadow-sm transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Kiểm tra lại trạng thái duyệt</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Đủ điều kiện truy cập (status === 'approved' và access_expires_at còn hạn)
  return children ? <>{children}</> : <Outlet />;
};
