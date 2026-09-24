import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Files, 
  CheckSquare, 
  BarChart3, 
  Upload, 
  Settings, 
  BookText, 
  FileSearch, 
  ShieldCheck, 
  Landmark, 
  Users, 
  ClipboardCheck,
  KeyRound,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  pendingUserCount?: number;
  pendingAccessCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  pendingUserCount = 0,
  pendingAccessCount = 0,
}) => {
  const { profile } = useAuth();
  const location = useLocation();

  // Internal state with localStorage fallback
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      const next = !internalCollapsed;
      setInternalCollapsed(next);
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (err) {
        console.warn('Cannot write to localStorage:', err);
      }
    }
  };

  const navigation = [
    { 
      name: 'Tổng quan', 
      href: '/', 
      icon: LayoutDashboard, 
      roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'] 
    },
    { 
      name: 'Tra cứu tình trạng', 
      href: '/lookup', 
      icon: FileSearch, 
      roles: ['admin', 'super_admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'investor', 'supervisor', 'viewer', 'user'] 
    },
    { 
      name: 'Quyền truy cập của tôi', 
      href: '/my-access', 
      icon: KeyRound, 
      roles: ['viewer', 'user'] 
    },
    { 
      name: 'Quản lý người dùng', 
      href: '/user-management', 
      icon: Users, 
      roles: ['admin', 'super_admin'],
      badge: pendingUserCount > 0 ? pendingUserCount : undefined
    },
    { 
      name: 'Danh sách GCN', 
      href: '/assets', 
      icon: Files, 
      roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'] 
    },
    { 
      name: profile?.role === 'btc_manager' || profile?.role === 'warehouse_manager' ? 'Duyệt yêu cầu & Kho' : 'Yêu cầu của tôi', 
      href: '/requests', 
      icon: CheckSquare, 
      roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'] 
    },
    { 
      name: 'Duyệt truy cập kho', 
      href: '/access-requests', 
      icon: ShieldCheck, 
      roles: ['btc_manager', 'warehouse_manager', 'admin', 'super_admin'],
      badge: pendingAccessCount > 0 ? pendingAccessCount : undefined
    },
    { 
      name: 'Kiểm kê kho', 
      href: '/inventory-audits', 
      icon: ClipboardCheck, 
      roles: ['btc_manager', 'warehouse_manager', 'admin', 'super_admin'] 
    },
    { 
      name: 'Nhật ký biến động', 
      href: '/activity-logs', 
      icon: BookText, 
      roles: ['btc_manager', 'warehouse_manager', 'supervisor', 'admin', 'super_admin'] 
    },
    { 
      name: 'Báo cáo', 
      href: '/reports', 
      icon: BarChart3, 
      roles: ['btc_manager', 'warehouse_manager', 'supervisor', 'admin', 'super_admin'] 
    },
    { 
      name: 'Quản trị danh mục', 
      href: '/admin', 
      icon: Settings, 
      roles: ['admin', 'super_admin'] 
    },
    { 
      name: 'Import dữ liệu', 
      href: '/import', 
      icon: Upload, 
      roles: ['warehouse_manager', 'btc_manager', 'admin', 'super_admin'] 
    },
  ];

  const allowedNav = navigation.filter(item => {
    if (!profile) return false;
    // Tài khoản đang chờ duyệt chỉ thấy mục "Quyền truy cập của tôi"
    if (profile.status === 'pending') return item.href === '/my-access';
    const r = profile.role;
    if (r === 'admin' || r === 'super_admin') return true;
    if (item.roles.includes(r)) return true;
    if (r === 'quan_ly' && (item.roles.includes('warehouse_manager') || item.roles.includes('btc_manager'))) return true;
    if (r === 'chuyen_vien' && (item.roles.includes('capital_dept') || item.roles.includes('project_dept') || item.roles.includes('re_dept'))) return true;
    if ((r === 'nguoi_dung' || r === 'user') && item.roles.includes('viewer')) return true;
    return false;
  });

  return (
    <aside 
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out relative z-30 select-none`}
    >
      {/* Header & Logo */}
      <div className={`h-16 flex items-center border-b border-gray-200 transition-all duration-300 relative ${
        isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
      }`}>
        <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center' : 'min-w-0 flex-1'}`}>
          {/* Icon Logo Badge - Banking & Corporate */}
          <div 
            className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#1E3A8A] to-slate-900 border border-white/10 flex items-center justify-center shadow-xs shrink-0"
            title="eQSDĐ & TSĐB — Ban Tài chính"
          >
            <Landmark className="w-4.5 h-4.5 text-white stroke-[2]" />
          </div>

          {/* Tên thương hiệu & Hệ thống (chỉ hiển thị khi mở rộng) */}
          {!isCollapsed && (
            <div className="min-w-0 flex-1 overflow-hidden transition-opacity duration-200">
              <h1 className="text-sm font-bold text-slate-900 leading-none tracking-tight truncate">
                eQSDĐ &amp; TSĐB
              </h1>
              <p className="text-[11px] font-medium tracking-wider uppercase text-slate-400 mt-1 truncate">
                Ban Tài chính
              </p>
            </div>
          )}
        </div>

        {/* Nút chuyển đổi Thu gọn / Mở rộng ở viền phải Header/Logo */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapse}
            className="absolute -right-3.5 top-5 z-40 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 hover:border-blue-300 shadow-sm transition-all duration-200 cursor-pointer"
            title="Mở rộng menu"
            aria-label="Mở rộng menu"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
            title="Thu gọn menu"
            aria-label="Thu gọn menu"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {allowedNav.map((item) => {
          const isActive = location.pathname === item.href;
          
          if (isCollapsed) {
            return (
              <div key={item.name} className="relative group flex justify-center py-0.5">
                <Link
                  to={item.href}
                  className={`flex items-center justify-center w-11 h-11 rounded-lg transition-colors relative ${
                    isActive 
                      ? 'bg-blue-50 text-[#1E3A8A] font-semibold shadow-2xs' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label={item.name}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[#1E3A8A]' : 'text-gray-400'}`} />
                  
                  {item.badge !== undefined && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-500 text-slate-950 border-2 border-white shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </Link>

                {/* Tooltip khi hover vào Icon ở trạng thái Thu gọn */}
                <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none absolute left-full ml-3.5 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap">
                  <div className="bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-2 border border-slate-700">
                    <span>{item.name}</span>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-500 text-slate-950">
                        {item.badge}
                      </span>
                    )}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-50 text-[#1E3A8A] font-semibold' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center min-w-0">
                <item.icon className={`mr-3 h-5 w-5 shrink-0 ${isActive ? 'text-[#1E3A8A]' : 'text-gray-400'}`} />
                <span className="truncate">{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 shrink-0 ml-2">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};