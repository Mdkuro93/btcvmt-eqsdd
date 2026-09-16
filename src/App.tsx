/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { LoadingFallback } from './components/LoadingFallback';
import { ErrorBoundary } from './components/ErrorBoundary';

// Helper tải component động có cơ chế tự phục hồi khi gặp lỗi chunk/mạng
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<any>,
  name?: string
) {
  return lazy(async () => {
    try {
      const module = await componentImport();
      if (name && module[name]) {
        return { default: module[name] };
      }
      return module.default ? module : { default: module };
    } catch (error: any) {
      console.warn('Lỗi tải module động (chunk load error), đang tự động thử lại...', error);
      const isFetchError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('dynamically imported module');

      if (isFetchError) {
        const retryKey = `chunk_retry_${window.location.pathname}`;
        const hasRetried = sessionStorage.getItem(retryKey);
        if (!hasRetried) {
          sessionStorage.setItem(retryKey, 'true');
          window.location.reload();
        }
      }
      throw error;
    }
  });
}

// Lazy-loaded Pages (Code Splitting có retry bảo vệ)
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login');
const Register = lazyWithRetry(() => import('./pages/Register'), 'Register');
const RegisterAccess = lazyWithRetry(() => import('./pages/RegisterAccess'), 'RegisterAccess');
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'), 'Dashboard');
const Assets = lazyWithRetry(() => import('./pages/Assets'), 'Assets');
const Requests = lazyWithRetry(() => import('./pages/Requests'), 'Requests');
const Reports = lazyWithRetry(() => import('./pages/Reports'), 'Reports');
const ActivityLogs = lazyWithRetry(() => import('./pages/ActivityLogs'), 'ActivityLogs');
const Import = lazyWithRetry(() => import('./pages/Import'), 'Import');
const Admin = lazyWithRetry(() => import('./pages/Admin'), 'Admin');
const Lookup = lazyWithRetry(() => import('./pages/Lookup'), 'Lookup');
const AccessRequests = lazyWithRetry(() => import('./pages/AccessRequests'), 'AccessRequests');
const UserManagement = lazyWithRetry(() => import('./pages/UserManagement'), 'UserManagement');
const InventoryAudits = lazyWithRetry(() => import('./pages/InventoryAudits'), 'InventoryAudits');

// Dispatcher for the root route "/"
function RootRoute() {
  const { profile } = useAuth();
  // Viewer and User only have access to /lookup, not the executive dashboard
  if (profile?.role === 'viewer' || profile?.role === 'user') {
    return <Navigate to="/lookup" replace />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback message="Đang tải giao diện..." className="min-h-[70vh] border-0 shadow-none bg-transparent" />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dang-ky-truy-cap" element={<RegisterAccess />} />
              
              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  {/* Root / Dashboard */}
                  <Route path="/" element={<RootRoute />} />

                  {/* Internal Departments & Managers */}
                  <Route element={<ProtectedRoute allowedRoles={['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'admin', 'super_admin']} />}>
                    <Route path="/assets" element={<Assets />} />
                    <Route path="/requests" element={<Requests />} />
                  </Route>
                  
                  {/* Public/External Viewer Lookup */}
                  <Route path="/lookup" element={<Lookup />} />

                  {/* User Management & Approval: Admin & Warehouse Manager */}
                  <Route element={<ProtectedRoute allowedRoles={['admin', 'super_admin', 'warehouse_manager', 'btc_manager']} />}>
                    <Route path="/user-management" element={<UserManagement />} />
                  </Route>

                  {/* Access Approval, Activity Logs & Reports */}
                  <Route element={<ProtectedRoute allowedRoles={['btc_manager', 'warehouse_manager', 'admin', 'super_admin']} />}>
                    <Route path="/access-requests" element={<AccessRequests />} />
                    <Route path="/inventory-audits" element={<InventoryAudits />} />
                    <Route path="/activity-logs" element={<ActivityLogs />} />
                    <Route path="/reports" element={<Reports />} />
                  </Route>

                  {/* Admin & Data Operations */}
                  <Route element={<ProtectedRoute allowedRoles={['btc_manager', 'admin', 'super_admin']} />}>
                    <Route path="/import" element={<Import />} />
                    <Route path="/admin" element={<Admin />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
