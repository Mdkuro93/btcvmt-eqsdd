import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Files, 
  CheckSquare, 
  BarChart3, 
  Upload,
  LogOut,
  User,
  Settings,
  BookText,
  FileSearch
} from 'lucide-react';

export const MainLayout: React.FC = () => {
  const { profile, signOut, user, updateRole } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Tổng quan', href: '/', icon: LayoutDashboard, roles: ['btc_manager', 'capital_dept', 'project_dept', 're_dept', 'viewer'] },
    { name: 'Danh sách GCN', href: '/assets', icon: Files, roles: ['btc_manager', 'capital_dept', 'project_dept', 're_dept'] },
    { name: 'Tra cứu tình trạng', href: '/lookup', icon: FileSearch, roles: ['viewer'] },
    { name: profile?.role === 'btc_manager' ? 'Duyệt yêu cầu' : 'Yêu cầu của tôi', href: '/requests', icon: CheckSquare, roles: ['btc_manager', 'capital_dept', 'project_dept', 're_dept'] },
    { name: 'Nhật ký biến động', href: '/activity-logs', icon: BookText, roles: ['btc_manager'] },
    { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['btc_manager', 'capital_dept', 'project_dept', 're_dept'] },
    { name: 'Quản trị', href: '/admin', icon: Settings, roles: ['btc_manager'] },
    { name: 'Import dữ liệu', href: '/import', icon: Upload, roles: ['btc_manager'] },
  ];

  const allowedNav = navigation.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-[#1E3A8A]">GCN QSDĐ</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {allowedNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  isActive 
                    ? 'bg-[#EBF5FF] text-[#1E3A8A]' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-[#1E3A8A]' : 'text-gray-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 shadow-sm z-10 shrink-0">
          <div className="flex items-center space-x-4">
            
            {/* Quick Test Role Switcher */}
            <div className="mr-4 flex items-center text-sm border-r pr-4">
              <span className="text-gray-500 mr-2 text-xs">Test Role:</span>
              <select 
                value={profile?.role || ''} 
                onChange={(e) => updateRole && updateRole(e.target.value as any)}
                className="text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 py-1"
              >
                <option value="viewer">Viewer</option>
                <option value="btc_manager">Ban TC (Quản lý)</option>
                <option value="capital_dept">Ban Nguồn Vốn</option>
                <option value="project_dept">Ban DAĐT</option>
                <option value="re_dept">Ban KD BĐS</option>
              </select>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-gray-900">{user?.email}</span>
              <span className="text-xs text-gray-500 capitalize">{profile?.role.replace('_', ' ')} - {profile?.regions?.name || 'Toàn hệ thống'}{profile?.areas?.name ? ` (${profile.areas.name})` : ''}</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-[#1E3A8A]">
              <User className="h-5 w-5" />
            </div>
            <button
              onClick={signOut}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 ml-2"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
