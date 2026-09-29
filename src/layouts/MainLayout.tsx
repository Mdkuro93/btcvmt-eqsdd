import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogOut, 
  User, 
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

  return (
    <div className="flex h-screen bg-[#F8F9FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden transition-colors">
      {/* Sidebar Thu gọn / Mở rộng */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        pendingUserCount={pendingUserCount}
        pendingAccessCount={pendingAccessCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8F9FA] dark:bg-slate-950">
        {/* Role Simulation Warning Banner */}
        <RoleSimulationBanner />

        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-6 shadow-xs z-20 shrink-0 transition-colors">
          <div className="flex items-center">
            <RoleSwitcher />
          </div>

          <div className="flex items-center space-x-3">
            {/* Global Search Button (Ctrl + K) */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 bg-gray-100/80 dark:bg-slate-800 hover:bg-gray-200/80 dark:hover:bg-slate-700/80 border border-gray-200 dark:border-slate-700 rounded-lg transition-all shadow-2xs group cursor-pointer"
              title="Tìm kiếm nhanh toàn hệ thống (Ctrl + K hoặc Cmd + K)"
              aria-label="Tìm kiếm nhanh (Ctrl + K)"
            >
              <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 group-hover:text-[#1E3A8A] dark:group-hover:text-blue-400 transition-colors" />
              <span className="hidden sm:inline font-medium text-gray-600 dark:text-slate-300">Tìm kiếm...</span>
              <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-sm shadow-2xs">
                <span className="text-[9px]">⌘</span>K
              </kbd>
            </button>

            {/* Notification Bell Component */}
            <NotificationBell />

            {/* Theme Toggle Component */}
            <ThemeToggle variant="dropdown" />

            {/* Profile Info */}
            <div className="flex flex-col items-end pl-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{profile?.full_name || user?.email}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400 capitalize flex items-center gap-1">
                {profile?.role === 'warehouse_manager' ? (
                  <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                    <Store className="w-3 h-3" /> Quản lý kho ({profile.managed_warehouse_ids?.length || 0} kho)
                  </span>
                ) : (
                  profile?.role.replace('_', ' ')
                )}
                {' · '}{profile?.regions?.name || 'Toàn hệ thống'}
              </span>
            </div>
            
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/70 flex items-center justify-center text-[#1E3A8A] dark:text-blue-400">
              <User className="h-5 w-5" />
            </div>

            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="p-2 text-gray-400 dark:text-slate-400 hover:text-[#1E3A8A] dark:hover:text-blue-400 transition-colors rounded-full hover:bg-blue-50 dark:hover:bg-slate-800 ml-1 cursor-pointer"
              title="Đổi mật khẩu tài khoản"
            >
              <KeyRound className="h-5 w-5" />
            </button>

            <button
              onClick={signOut}
              className="p-2 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-slate-800 ml-0.5 cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
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

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F8F9FA] dark:bg-slate-950 transition-colors">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
