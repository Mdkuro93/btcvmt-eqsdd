import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Notification } from '../types';

export interface SendNotificationParams {
  userIds: string[];
  title: string;
  message: string;
  link?: string | null;
  type?: string;
  transactionItemId?: string | null;
}

/**
 * Gửi thông báo đến danh sách người dùng được chỉ định (hoặc lưu vết trong hệ thống).
 * Tuân thủ quy tắc #1: Khi Supabase đã kết nối, không âm thầm fallback sang mockStore khi gặp lỗi.
 */
export async function sendNotification({
  userIds,
  title,
  message,
  link = null,
  type = 'system',
  transactionItemId = null,
}: SendNotificationParams): Promise<Notification[]> {
  const cleanUserIds = Array.from(new Set(userIds.filter(id => Boolean(id && typeof id === 'string'))));
  if (cleanUserIds.length === 0) {
    return [];
  }

  const nowIso = new Date().toISOString();

  // Nhánh chỉ dùng khi chưa cấu hình Supabase
  if (!isSupabaseConfigured) {
    const created: Notification[] = [];
    for (const uid of cleanUserIds) {
      const item: Notification = {
        id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        user_id: uid,
        title,
        message,
        body: message,
        link: link || null,
        type,
        transaction_item_id: transactionItemId || null,
        is_read: false,
        created_at: nowIso,
      };
      mockStore.addNotification(item);
      created.push(item);
    }
    return created;
  }

  // Khi Supabase đã cấu hình: Ghi trực tiếp vào bảng notifications
  const rows = cleanUserIds.map(uid => ({
    user_id: uid,
    title,
    message,
    body: message,
    link: link || null,
    type,
    transaction_item_id: transactionItemId || null,
    is_read: false,
    created_at: nowIso,
  }));

  const { data, error } = await withTimeout(
    supabase.from('notifications').insert(rows).select('*'),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    console.error('Lỗi khi lưu thông báo vào Supabase:', error);
    throw new Error(`Không thể gửi thông báo: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
  }

  return (data || []) as Notification[];
}

/**
 * Tải danh sách thông báo của người dùng hiện tại
 */
export async function fetchUserNotifications(userId?: string): Promise<Notification[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getNotifications(userId);
  }

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);

  if (error) {
    console.error('Lỗi khi tải thông báo từ Supabase:', error);
    throw new Error(`Không thể tải thông báo: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
  }

  return (data || []) as Notification[];
}

/**
 * Đánh dấu một thông báo là đã đọc
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  if (!id) return;

  if (!isSupabaseConfigured) {
    mockStore.markNotificationAsRead(id);
    return;
  }

  const { error } = await withTimeout(
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    console.error('Lỗi khi cập nhật trạng thái đã đọc:', error);
    throw new Error(`Không thể đánh dấu đã đọc: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
  }

  try {
    mockStore.markNotificationAsRead(id);
  } catch {}
}

/**
 * Đánh dấu tất cả thông báo của người dùng là đã đọc
 */
export async function markAllNotificationsAsRead(userId?: string): Promise<void> {
  if (!isSupabaseConfigured) {
    mockStore.markAllNotificationsAsRead(userId);
    return;
  }

  let query = supabase.from('notifications').update({ is_read: true });
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    // Nếu không truyền userId thì cập nhật theo auth.uid()
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      query = query.eq('user_id', authData.user.id);
    }
  }

  const { error } = await withTimeout(query, DEFAULT_WRITE_TIMEOUT);

  if (error) {
    console.error('Lỗi khi đánh dấu tất cả thông báo đã đọc:', error);
    throw new Error(`Không thể đánh dấu tất cả đã đọc: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
  }

  try {
    mockStore.markAllNotificationsAsRead(userId);
  } catch {}
}

/**
 * Thực thi dọn dẹp dữ liệu thông báo tạm theo chu kỳ (gọi RPC clean_transient_data)
 */
export async function cleanTransientNotifications(): Promise<{
  success: boolean;
  deleted_read_30d: number;
  deleted_unread_90d: number;
  cleaned_at: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      success: true,
      deleted_read_30d: 0,
      deleted_unread_90d: 0,
      cleaned_at: new Date().toISOString(),
    };
  }

  const { data, error } = await withTimeout(
    supabase.rpc('clean_transient_data'),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    console.error('Lỗi khi gọi hàm dọn dẹp clean_transient_data:', error);
    throw new Error(`Không thể dọn dẹp dữ liệu tạm: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
  }

  return data as any;
}
