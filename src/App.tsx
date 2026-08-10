/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Assets } from './pages/Assets';
import { Requests } from './pages/Requests';
import { Reports } from './pages/Reports';
import { ActivityLogs } from './pages/ActivityLogs';
import { Import } from './pages/Import';
import { Admin } from './pages/Admin';
import { Lookup } from './pages/Lookup';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Dashboard />} />

              {/* viewer chỉ được Tra cứu (field giới hạn), KHÔNG được xem toàn bộ danh mục */}
              <Route element={<ProtectedRoute allowedRoles={['btc_manager', 'capital_dept', 'project_dept', 're_dept']} />}>
                <Route path="/assets" element={<Assets />} />
              </Route>
              <Route path="/lookup" element={<Lookup />} />

              {/* Mọi role đăng nhập đều xem được yêu cầu của mình;
                  nút Duyệt/Từ chối chỉ hiện với ai có quyền request.approve (xử lý trong component) */}
              <Route path="/requests" element={<Requests />} />

              {/* btc_manager only routes */}
              <Route element={<ProtectedRoute allowedRoles={['btc_manager']} />}>
                <Route path="/import" element={<Import />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/activity-logs" element={<ActivityLogs />} />
              </Route>

              <Route path="/reports" element={<Reports />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
