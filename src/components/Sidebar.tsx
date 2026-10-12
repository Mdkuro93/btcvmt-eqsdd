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
  Users, 
  ClipboardCheck,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowLeftRight
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
      name: 'Luân chuyển kho', 
      href: '/warehouse-transfers', 
      icon: ArrowLeftRight, 
      roles: ['warehouse_manager', 'btc_manager', 'admin', 'super_admin'] 
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
      // admin/super_admin: toàn quyền. project_dept/btc_manager/warehouse_manager: route /admin và
      // trang Admin.tsx tự giới hạn phạm vi chỉ còn tab "Dự án" (quản lý lô quy hoạch pháp lý).
      roles: ['admin', 'super_admin', 'project_dept', 'btc_manager', 'warehouse_manager'] 
    },
    { 
      name: 'Nhập & cập nhật hàng loạt', 
      href: '/bulk-update', 
      icon: Layers, 
      roles: ['warehouse_manager', 'btc_manager', 'admin', 'super_admin'] 
    },
  ];

  const GROUPS: { label: string; hrefs: string[] }[] = [
    { label: 'Nghiệp vụ', hrefs: ['/', '/lookup', '/my-access', '/assets', '/requests'] },
    { label: 'Kho', hrefs: ['/warehouse-transfers', '/access-requests', '/inventory-audits'] },
    { label: 'Báo cáo và dữ liệu', hrefs: ['/activity-logs', '/reports', '/bulk-update'] },
    { label: 'Quản trị', hrefs: ['/user-management', '/admin'] },
  ];

  const allowedNav = navigation.filter(item => {
    if (!profile) return false;
    // Tài khoản đang chờ duyệt chỉ thấy mục "Quyền truy cập của tôi"
    if (profile.status === 'pending') return item.href === '/my-access';
    const r = (profile.role || '').toLowerCase();
    // Admin và Quản trị viên đã có toàn quyền tất cả các kho -> ẩn mục "Quyền truy cập của tôi"
    if (r === 'admin' || r === 'super_admin') {
      if (item.href === '/my-access') return false;
      return true;
    }
    if (item.roles.includes(r)) return true;
    if (r === 'quan_ly' && (item.roles.includes('warehouse_manager') || item.roles.includes('btc_manager'))) return true;
    if (r === 'chuyen_vien' && (item.roles.includes('capital_dept') || item.roles.includes('project_dept') || item.roles.includes('re_dept'))) return true;
    if ((r === 'nguoi_dung' || r === 'user') && item.roles.includes('viewer')) return true;
    return false;
  });

  const groupedNav = GROUPS
    .map(g => ({ label: g.label, items: allowedNav.filter(i => g.hrefs.includes(i.href)) }))
    .filter(g => g.items.length > 0);
  // Mục chưa nằm trong nhóm nào (nếu sau này thêm menu mới) vẫn hiển thị, xếp vào nhóm cuối
  const knownHrefs = GROUPS.flatMap(g => g.hrefs);
  const orphanItems = allowedNav.filter(i => !knownHrefs.includes(i.href));
  if (orphanItems.length > 0) {
    const last = groupedNav[groupedNav.length - 1];
    if (last) last.items = [...last.items, ...orphanItems];
    else groupedNav.push({ label: 'Khác', items: orphanItems });
  }

  const activeStyle: React.CSSProperties = { background: 'var(--nav-bg)', color: 'var(--nav-fg)', boxShadow: 'var(--nav-bar)' };

  return (
    <aside
      className={`${isCollapsed ? 'w-20' : 'w-[248px]'} bg-brand text-brand-fg flex flex-col shrink-0 transition-all duration-300 ease-in-out relative z-30 select-none`}
      aria-label="Điều hướng chính"
    >
      {/* Đầu thanh bên: logo + tên hệ thống */}
      <div className={`h-16 flex items-center transition-all duration-300 relative ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center' : 'min-w-0 flex-1'}`}>
          <div
            className="w-[34px] h-[34px] rounded-[9px] bg-accent text-accent-ink flex items-center justify-center font-bold text-[15px] shrink-0"
            title="eQSDĐ & TSĐB — Ban Tài chính"
            aria-hidden={!isCollapsed}
          >
            eQ
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <h1 className="text-[15px] font-bold text-brand-fg leading-tight tracking-[.2px] truncate">eQSDĐ &amp; TSĐB</h1>
              <p className="text-[11px] uppercase tracking-[1.2px] text-brand-muted mt-0.5 truncate">Ban Tài chính</p>
            </div>
          )}
        </div>

        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapse}
            className="absolute -right-3.5 top-5 z-40 w-7 h-7 bg-raised border border-border rounded-full flex items-center justify-center text-muted hover:text-text shadow-[var(--shadow-sm)] transition-colors cursor-pointer"
            title="Mở rộng menu"
            aria-label="Mở rộng menu"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 text-brand-muted hover:text-brand-fg hover:bg-surface/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
            title="Thu gọn menu"
            aria-label="Thu gọn menu"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Danh sách menu theo nhóm */}
      <nav className={`flex-1 pt-2 pb-4 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-2' : 'px-3.5'}`}>
        {groupedNav.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? '' : isCollapsed ? 'mt-3 pt-3 border-t border-white/10' : 'mt-5'}>
            {!isCollapsed && (
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[1.2px] text-brand-muted">{group.label}</div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.href;

                if (isCollapsed) {
                  return (
                    <div key={item.name} className="relative group flex justify-center py-0.5">
                      <Link
                        to={item.href}
                        aria-label={item.name}
                        aria-current={isActive ? 'page' : undefined}
                        style={isActive ? activeStyle : undefined}
                        className={`flex items-center justify-center w-11 h-10 rounded-lg transition-colors relative ${isActive ? '' : 'text-brand-fg hover:bg-surface/10'}`}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                        {item.badge !== undefined && (
                          <span className="absolute -top-1 -right-1 px-1.5 rounded-full text-[9px] font-extrabold bg-accent text-accent-ink border-2 border-brand">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                      <div
                        role="tooltip"
                        className="opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 ease-out pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap"
                      >
                        <div className="bg-raised text-text text-xs font-medium px-3 py-1.5 rounded-lg shadow-[var(--shadow)] flex items-center gap-2 border border-border">
                          <span>{item.name}</span>
                          {item.badge !== undefined && (
                            <span className="px-1.5 rounded-full text-[9px] font-extrabold bg-accent text-accent-ink">{item.badge}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    style={isActive ? activeStyle : undefined}
                    className={`flex items-center justify-between px-2.5 py-[9px] text-sm rounded-lg transition-colors ${
                      isActive ? 'font-semibold' : 'text-brand-fg hover:bg-surface/10'
                    }`}
                  >
                    <div className="flex items-center min-w-0 gap-[11px]">
                      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-accent text-accent-ink shrink-0 ml-2">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};