import React, { useState, useEffect, useRef } from 'react';
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
  FileSearch,
  Bell,
  Check,
  Store,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../api/notifications';
import { Notification } from '../types';
import { format } from 'date-fns';

export const MainLayout: React.FC = () => {
  const { profile, signOut, user, updateRole } = useAuth();
  const location = useLocation();

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const data = await fetchNotifications(user?.id);
      setNotifications(data || []);
    } catch (err) {
      console.warn('Load notifications error:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 15000); // Polling every 15s
    return () => clearInterval(timer);
  }, [user?.id]);

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

  const navigation = [
    { name: 'Tổng quan', href: '/', icon: LayoutDashboard, roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'viewer'] },
    { name: 'Danh sách GCN', href: '/assets', icon: Files, roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept'] },
    { name: 'Tra cứu tình trạng', href: '/lookup', icon: FileSearch, roles: ['viewer'] },
    { name: profile?.role === 'btc_manager' || profile?.role === 'warehouse_manager' ? 'Duyệt yêu cầu & Kho' : 'Yêu cầu của tôi', href: '/requests', icon: CheckSquare, roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept'] },
    { name: 'Nhật ký biến động', href: '/activity-logs', icon: BookText, roles: ['btc_manager', 'warehouse_manager'] },
    { name: 'Báo cáo', href: '/reports', icon: BarChart3, roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept'] },
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
        <div className="h-16 flex items-center px-6 border-b border-gray-200 gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] text-white font-black flex items-center justify-center text-sm">
            VMT
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1E3A8A] leading-none">GCN QSDĐ</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">Quản trị kho & tài sản</p>
          </div>
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
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 shadow-sm z-20 shrink-0">
          <div className="flex items-center space-x-3">
            
            {/* Quick Test Role Switcher */}
            <div className="mr-3 flex items-center text-sm border-r border-gray-200 pr-4">
              <span className="text-gray-500 mr-2 text-xs font-medium">Chuyển vai trò:</span>
              <select 
                value={profile?.role || ''} 
                onChange={(e) => updateRole && updateRole(e.target.value as any)}
                className="text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 py-1 bg-gray-50"
              >
                <option value="btc_manager">Ban TC (Quản lý)</option>
                <option value="warehouse_manager">Thủ kho (warehouse_manager)</option>
                <option value="capital_dept">Ban Nguồn Vốn</option>
                <option value="project_dept">Ban DAĐT</option>
                <option value="re_dept">Ban KD BĐS</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

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
              <span className="text-sm font-medium text-gray-900">{user?.email}</span>
              <span className="text-xs text-gray-500 capitalize flex items-center gap-1">
                {profile?.role === 'warehouse_manager' ? (
                  <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                    <Store className="w-3 h-3" /> Thủ kho ({profile.managed_warehouse_ids?.length || 0} kho)
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
              onClick={signOut}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 ml-1"
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
