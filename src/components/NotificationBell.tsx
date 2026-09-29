import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, ChevronRight, CheckCheck, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Notification } from '../types';
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService';
import toast from 'react-hot-toast';

export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    if (!user?.id) return;
    try {
      const data = await fetchUserNotifications(user.id);
      setNotifications(data || []);
    } catch (err: any) {
      console.warn('Lỗi khi tải thông báo:', err?.message || err);
    }
  };

  useEffect(() => {
    loadNotifications();
    // Tự động kiểm tra thông báo mới mỗi 60 giây
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Đóng Popover khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      loadNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead(user?.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('Đã đánh dấu tất cả là đã đọc');
    } catch (err: any) {
      toast.error('Không thể cập nhật: ' + (err?.message || 'Lỗi hệ thống'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.is_read) {
      try {
        await markNotificationAsRead(notif.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch (err) {
        console.warn('Không thể đánh dấu đã đọc:', err);
      }
    }

    setIsOpen(false);

    // Điều hướng nếu thông báo có liên kết
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkOneRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markNotificationAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err: any) {
      toast.error('Không thể cập nhật: ' + (err?.message || 'Lỗi'));
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Nút Chuông Thông Báo */}
      <button
        type="button"
        id="btn-notification-bell"
        onClick={handleToggle}
        className="relative p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/30"
        title="Thông báo hệ thống"
        aria-label="Thông báo"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            id="notification-unread-badge"
            className="absolute top-1 right-1 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Danh sách Thông báo */}
      {isOpen && (
        <div
          id="notification-popover-menu"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 z-50 border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header Popover */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-100/70 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 rounded-lg">
                <Bell className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  Thông báo
                </span>
                {unreadCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 rounded-full">
                    {unreadCount} chưa đọc
                  </span>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                id="btn-mark-all-notifications-read"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Đánh dấu tất cả là đã đọc"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Đánh dấu đã đọc</span>
              </button>
            )}
          </div>

          {/* Danh sách Thông báo */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">
                <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2 opacity-50" />
                <p className="font-medium text-slate-500 dark:text-slate-400">Chưa có thông báo nào</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Các thông báo chuyển kho, phân quyền sẽ xuất hiện ở đây.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.is_read;
                const hasLink = Boolean(n.link);

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 text-xs transition-colors flex items-start gap-2.5 cursor-pointer group ${
                      isUnread
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/80 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {/* Chấm tròn chưa đọc */}
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors ${
                        isUnread ? 'bg-blue-600 dark:bg-blue-400' : 'bg-transparent'
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <div
                          className={`font-semibold leading-tight line-clamp-2 ${
                            isUnread ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {n.title}
                        </div>
                        {hasLink && (
                          <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                        )}
                      </div>

                      <div className="text-slate-600 dark:text-slate-400 text-[11px] mt-1 line-clamp-2 leading-relaxed">
                        {n.message || n.body}
                      </div>

                      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          {n.created_at
                            ? format(new Date(n.created_at), 'dd/MM/yyyy HH:mm')
                            : '-'}
                        </span>

                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkOneRead(n.id, e)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium inline-flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-blue-100/50 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                            title="Đánh dấu đã đọc"
                          >
                            <Check className="w-3 h-3" /> Đã đọc
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Popover */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-800 text-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Hệ thống tự động lưu trữ thông báo tối đa 90 ngày
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
