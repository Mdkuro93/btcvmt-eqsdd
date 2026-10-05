import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Notification } from '../types';

export async function fetchNotifications(userId?: string): Promise<Notification[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getNotifications(userId);
  }
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) {
      throw new Error('Lỗi khi tải thông báo từ Supabase: ' + error.message);
    }
    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải thông báo: ' + String(err));
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    mockStore.markNotificationAsRead(id);
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error('Lỗi khi đánh dấu thông báo đã đọc trên Supabase: ' + error.message);
    }
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể đánh dấu thông báo đã đọc: ' + String(err));
  }
}

export async function markAllNotificationsAsRead(userId?: string): Promise<void> {
  if (!isSupabaseConfigured) {
    mockStore.markAllNotificationsAsRead(userId);
    return;
  }
  try {
    let query = supabase.from('notifications').update({ is_read: true });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { error } = await withTimeout(query, DEFAULT_WRITE_TIMEOUT);
    if (error) {
      throw new Error('Lỗi khi đánh dấu tất cả thông báo đã đọc trên Supabase: ' + error.message);
    }
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể đánh dấu tất cả thông báo đã đọc: ' + String(err));
  }
}

export async function createNotification(data: {
  user_id: string;
  type: 'request_approved' | 'request_approved_with_changes' | 'request_rejected' | string;
  title: string;
  body: string;
  transaction_item_id?: string | null;
}): Promise<Notification> {
  const newNotif: Notification = {
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    user_id: data.user_id,
    type: data.type,
    title: data.title,
    body: data.body,
    transaction_item_id: data.transaction_item_id || null,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    return mockStore.addNotification(newNotif);
  }

  try {
    const { data: inserted, error } = await withTimeout(
      supabase
        .from('notifications')
        .insert([
          {
            user_id: data.user_id,
            type: data.type,
            title: data.title,
            body: data.body,
            transaction_item_id: data.transaction_item_id || null,
            is_read: false,
          },
        ])
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error('Lỗi khi tạo thông báo trên Supabase: ' + error.message);
    }

    return inserted;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tạo thông báo: ' + String(err));
  }
}
