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

// Lazy-loaded Pages (Code Splitting)
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const RegisterAccess = lazy(() => import('./pages/RegisterAccess').then(m => ({ default: m.RegisterAccess })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Assets = lazy(() => import('./pages/Assets').then(m => ({ default: m.Assets })));
const Requests = lazy(() => import('./pages/Requests').then(m => ({ default: m.Requests })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const ActivityLogs = lazy(() => import('./pages/ActivityLogs').then(m => ({ default: m.ActivityLogs })));
const Import = lazy(() => import('./pages/Import').then(m => ({ default: m.Import })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Lookup = lazy(() => import('./pages/Lookup').then(m => ({ default: m.Lookup })));
const AccessRequests = lazy(() => import('./pages/AccessRequests').then(m => ({ default: m.AccessRequests })));
const UserManagement = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const InventoryAudits = lazy(() => import('./pages/InventoryAudits').then(m => ({ default: m.InventoryAudits })));

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
      </BrowserRouter>
    </AuthProvider>
  );
}
