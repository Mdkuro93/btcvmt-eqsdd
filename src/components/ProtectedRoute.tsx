import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, Role } from '../contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, profile, loading, effectiveRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
          <p className="text-sm text-gray-500 font-medium">Đang kiểm tra quyền truy cập hệ thống...</p>
        </div>
      </div>
    );
  }

  // Chưa đăng nhập -> Chuyển về login
  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  // Tài khoản bị khóa, từ chối hoặc ngừng hoạt động
  if (profile.status === 'disabled' || profile.status === 'rejected' || profile.status === 'inactive') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-200 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {profile.status === 'rejected' ? 'Tài khoản đã bị từ chối' : 'Tài khoản đang bị tạm khóa'}
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Tài khoản của bạn ({profile.email}) hiện có trạng thái <strong>{profile.status}</strong>. Vui lòng liên hệ Ban Quản Trị hoặc Thủ kho phụ trách để được hỗ trợ.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-[#1E3A8A] text-white rounded-lg font-medium text-sm hover:bg-blue-800 transition"
          >
            Quay lại trang Đăng nhập
          </a>
        </div>
      </div>
    );
  }

  // Kiểm tra phân quyền theo vai trò (Role-Based Access)
  if (allowedRoles) {
    const currentRole = (effectiveRole || profile.role) as string;
    let isAllowed = currentRole === 'admin' || currentRole === 'super_admin' || allowedRoles.includes(currentRole as Role);

    if (!isAllowed) {
      if (currentRole === 'quan_ly' && (allowedRoles.includes('warehouse_manager') || allowedRoles.includes('btc_manager'))) {
        isAllowed = true;
      } else if (currentRole === 'chuyen_vien' && (allowedRoles.includes('capital_dept') || allowedRoles.includes('project_dept') || allowedRoles.includes('re_dept'))) {
        isAllowed = true;
      } else if ((currentRole === 'nguoi_dung' || currentRole === 'user') && allowedRoles.includes('viewer')) {
        isAllowed = true;
      }
    }

    if (!isAllowed) {
      const fallbackPath = (currentRole === 'viewer' || currentRole === 'user' || currentRole === 'nguoi_dung') ? '/lookup' : '/';
      return <Navigate to={fallbackPath} replace />;
    }
  }

  return <Outlet />;
};
