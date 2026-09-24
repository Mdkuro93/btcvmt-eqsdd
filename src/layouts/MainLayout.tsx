import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogOut, 
  User, 
  Bell, 
  Check, 
  Store, 
  Clock, 
  ChevronRight,
  KeyRound
} from 'lucide-react';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../api/notifications';
import { fetchAccessRequests } from '../api/accessRequests';
import { fetchProfiles } from '../api/users';
import { Notification } from '../types';
import { format } from 'date-fns';
import { RoleSwitcher, RoleSimulationBanner } from '../components/RoleSwitcher';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { Sidebar } from '../components/Sidebar';

export const MainLayout: React.FC = () => {
  const { profile, signOut, user } = useAuth();

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

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [pendingAccessCount, setPendingAccessCount] = useState<number>(0);
  const [pendingUserCount, setPendingUserCount] = useState<number>(0);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const data = await fetchNotifications(user?.id);
      setNotifications(data || []);
    } catch (err) {
      console.warn('Load notifications error:', err);
    }
  };

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
    loadNotifications();
    loadPendingAccessCount();
    const timer = setInterval(() => {
      loadNotifications();
      loadPendingAccessCount();
    }, 15000); // Polling every 15s
    return () => clearInterval(timer);
  }, [user?.id, profile?.role]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(user?.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden">
      {/* Sidebar Thu gọn / Mở rộng */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        pendingUserCount={pendingUserCount}
        pendingAccessCount={pendingAccessCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Role Simulation Warning Banner */}
        <RoleSimulationBanner />

        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-xs z-20 shrink-0">
          <div className="flex items-center">
            <RoleSwitcher />
          </div>

          <div className="flex items-center space-x-3">

            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                title="Thông báo hệ thống"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown Menu */}
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 z-50 border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-gray-900 uppercase">
                      <Bell className="w-3.5 h-3.5 text-[#1E3A8A]" /> Thông báo ({notifications.length})
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Đánh dấu tất cả đã đọc
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400">
                        Chưa có thông báo mới nào.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-3 text-xs transition-colors hover:bg-gray-50 flex items-start gap-2.5 ${
                            !n.is_read ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.is_read ? 'bg-blue-600' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 leading-tight">
                              {n.title}
                            </div>
                            <div className="text-gray-600 text-[11px] mt-1 line-clamp-2">
                              {n.body}
                            </div>
                            <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {n.created_at ? format(new Date(n.created_at), 'dd/MM/yyyy HH:mm') : ''}
                              </span>
                              {!n.is_read && (
                                <button
                                  onClick={(e) => handleMarkAsRead(n.id, e)}
                                  className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5"
                                >
                                  <Check className="w-3 h-3" /> Đã đọc
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-2.5 bg-gray-50 border-t border-gray-200 text-center">
                    <Link
                      to="/requests"
                      onClick={() => setIsNotifOpen(false)}
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
                    >
                      Xem tất cả phiếu yêu cầu <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex flex-col items-end pl-2">
              <span className="text-sm font-semibold text-gray-900">{profile?.full_name || user?.email}</span>
              <span className="text-xs text-gray-500 capitalize flex items-center gap-1">
                {profile?.role === 'warehouse_manager' ? (
                  <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                    <Store className="w-3 h-3" /> Quản lý kho ({profile.managed_warehouse_ids?.length || 0} kho)
                  </span>
                ) : (
                  profile?.role.replace('_', ' ')
                )}
                {' · '}{profile?.regions?.name || 'Toàn hệ thống'}
              </span>
            </div>
            
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-[#1E3A8A]">
              <User className="h-5 w-5" />
            </div>

            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="p-2 text-gray-400 hover:text-[#1E3A8A] transition-colors rounded-full hover:bg-blue-50 ml-1 cursor-pointer"
              title="Đổi mật khẩu tài khoản"
            >
              <KeyRound className="h-5 w-5" />
            </button>

            <button
              onClick={signOut}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 ml-0.5 cursor-pointer"
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

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F8F9FA]">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
