import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useIdleLogout } from '../hooks/useIdleLogout';
import { IdleWarningModal } from '../components/IdleWarningModal';
import toast from 'react-hot-toast';
import { 
  LogOut, 
  Store, 
  KeyRound,
  Search
} from 'lucide-react';
import { fetchAccessRequests } from '../api/accessRequests';
import { fetchProfiles } from '../api/users';
import { RoleSwitcher, RoleSimulationBanner } from '../components/RoleSwitcher';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { Sidebar } from '../components/Sidebar';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { NotificationBell } from '../components/NotificationBell';
import { ThemeToggle } from '../components/ThemeToggle';

export const MainLayout: React.FC = () => {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();

  // Tự động đăng xuất khi nhàn rỗi (30 phút, cảnh báo 60s, phiên tối đa 12 giờ)
  const { showWarning, secondsRemaining, stayLoggedIn, manualLogout } = useIdleLogout({
    onLogout: async (reason) => {
      await signOut(reason);
      toast.error(reason || 'Phiên làm việc đã kết thúc.');
      navigate('/login', { replace: true });
    },
    enabled: Boolean(user && profile),
  });

  // Global search modal state (Ctrl + K)
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Lắng nghe phím tắt Ctrl + K / Cmd + K toàn cục
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sidebar collapsed state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (err) {
        console.warn('Cannot write to localStorage:', err);
      }
      return next;
    });
  };

  const [pendingAccessCount, setPendingAccessCount] = useState<number>(0);
  const [pendingUserCount, setPendingUserCount] = useState<number>(0);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const loadPendingAccessCount = async () => {
    if (profile?.role === 'btc_manager' || profile?.role === 'warehouse_manager' || profile?.role === 'admin' || profile?.role === 'super_admin') {
      try {
        const reqs = await fetchAccessRequests('pending');
        let count = reqs.length;
        if (profile.role === 'warehouse_manager' && profile.managed_warehouse_ids) {
          count = reqs.filter(r => profile.managed_warehouse_ids?.includes(r.warehouse_id)).length;
        }
        setPendingAccessCount(count);

        // Fetch pending users
        const users = await fetchProfiles();
        const pendingUsers = (users || []).filter(u => u.status === 'pending');
        setPendingUserCount(pendingUsers.length);
      } catch (err) {
        console.warn('Load pending count error:', err);
      }
    }
  };

  useEffect(() => {
    loadPendingAccessCount();
    const timer = setInterval(() => {
      loadPendingAccessCount();
    }, 15000); // Polling every 15s
    return () => clearInterval(timer);
  }, [user?.id, profile?.role]);

  const displayName = profile?.full_name || user?.email || '';
  const initials = (displayName.trim().split(/\s+/).slice(-2).map(w => w[0]).join('') || 'U').toUpperCase();
  const roleLabel = profile?.role ? profile.role.replace(/_/g, ' ') : '';
  const iconBtn = 'w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] border border-border bg-surface text-text hover:bg-surface-2 transition-colors cursor-pointer';

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden transition-colors">
      {/* Sidebar Thu gọn / Mở rộng */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        pendingUserCount={pendingUserCount}
        pendingAccessCount={pendingAccessCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg">
        {/* Role Simulation Warning Banner */}
        <RoleSimulationBanner />

        {/* Topbar */}
        <header className="min-h-16 bg-surface border-b border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-8 py-2.5 z-20 shrink-0 transition-colors">
          <div className="flex items-center">
            <RoleSwitcher />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tìm kiếm nhanh (Ctrl + K) */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2.5 sm:min-w-[230px] px-3 h-[38px] text-[13px] text-faint bg-surface-2 hover:bg-surface border border-border rounded-[10px] transition-colors cursor-pointer"
              title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K hoặc Cmd + K)"
              aria-label="Tìm kiếm nhanh (Ctrl + K)"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline flex-1 text-left">Tìm kiếm nhanh</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-px text-[11px] font-mono text-muted border border-border-strong rounded-[5px]">Ctrl K</kbd>
            </button>

            {/* Thông báo */}
            <NotificationBell />

            {/* Đổi giao diện sáng / tối */}
            <ThemeToggle variant="dropdown" />

            {/* Thông tin người dùng */}
            <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-border">
              <div className="h-9 w-9 rounded-full bg-brand text-brand-fg flex items-center justify-center font-semibold text-[13px] shrink-0" aria-hidden="true">
                {initials}
              </div>
              <div className="hidden md:flex flex-col leading-tight min-w-0">
                <span className="text-[13px] font-semibold text-text truncate max-w-[220px]">{displayName}</span>
                <span className="text-xs text-muted capitalize flex items-center gap-1 truncate">
                  {profile?.role === 'warehouse_manager' ? (
                    <span className="inline-flex items-center gap-1 text-warn-fg font-semibold">
                      <Store className="w-3 h-3" /> Quản lý kho ({profile.managed_warehouse_ids?.length || 0} kho)
                    </span>
                  ) : (
                    roleLabel
                  )}
                  {(() => {
                    // Nhãn phạm vi: chỉ hiển thị, không ảnh hưởng quyền. Thủ kho đã có "(N kho)" ở trên nên không ghi "Toàn hệ thống".
                    const role = profile?.role;
                    if (role === 'warehouse_manager') return null;
                    if (['supervisor', 'capital_dept', 'project_dept', 're_dept'].includes(role || '')) {
                      return ` · ${profile?.assigned_warehouse_ids?.length || 0} kho được gán`;
                    }
                    return ` · ${profile?.regions?.name || 'Toàn hệ thống'}`;
                  })()}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className={iconBtn}
              title="Đổi mật khẩu tài khoản"
              aria-label="Đổi mật khẩu tài khoản"
            >
              <KeyRound className="h-[18px] w-[18px]" />
            </button>

            <button
              onClick={() => signOut()}
              className={`${iconBtn} hover:!text-danger-fg`}
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {/* Change Password Modal */}
        <ChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
          userEmail={user?.email || profile?.email}
        />

        {/* Global Search Modal (Ctrl + K) */}
        <GlobalSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Hộp thoại cảnh báo phiên sắp hết hạn khi nhàn rỗi */}
        <IdleWarningModal
          isOpen={showWarning}
          secondsRemaining={secondsRemaining}
          onStayLoggedIn={stayLoggedIn}
          onLogout={manualLogout}
        />

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-bg transition-colors">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};