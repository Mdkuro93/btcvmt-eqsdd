/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { RegisterAccess } from './pages/RegisterAccess';
import { Dashboard } from './pages/Dashboard';
import { Assets } from './pages/Assets';
import { Requests } from './pages/Requests';
import { Reports } from './pages/Reports';
import { ActivityLogs } from './pages/ActivityLogs';
import { Import } from './pages/Import';
import { Admin } from './pages/Admin';
import { Lookup } from './pages/Lookup';
import { AccessRequests } from './pages/AccessRequests';
import { UserManagement } from './pages/UserManagement';

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
      </BrowserRouter>
    </AuthProvider>
  );
}
