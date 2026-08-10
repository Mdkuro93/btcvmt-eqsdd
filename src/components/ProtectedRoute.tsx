import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, Role } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // If user has a profile but their role is not allowed, redirect to dashboard
    return <Navigate to="/" replace />;
  }

  // If user doesn't have a profile yet but is logged in, wait or show error?
  // We'll just let them through and if profile is null, they might see limited things, 
  // but usually profile loads with session.
  if (allowedRoles && !profile) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
          <p className="text-red-600">Lỗi tải thông tin tài khoản. Vui lòng liên hệ Admin.</p>
        </div>
      );
  }

  return <Outlet />;
};
