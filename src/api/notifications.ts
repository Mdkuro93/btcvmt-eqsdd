import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
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

    const { data, error } = await withTimeout(query, 3000);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchNotifications error or timeout, using mockStore:', err);
    return mockStore.getNotifications(userId);
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
      3000
    );

    if (error) throw error;
    mockStore.markNotificationAsRead(id);
  } catch (err) {
    console.warn('Supabase markNotificationAsRead error or timeout, using mockStore:', err);
    mockStore.markNotificationAsRead(id);
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
    const { error } = await withTimeout(query, 3000);
    if (error) throw error;
    mockStore.markAllNotificationsAsRead(userId);
  } catch (err) {
    console.warn('Supabase markAllNotificationsAsRead error or timeout, using mockStore:', err);
    mockStore.markAllNotificationsAsRead(userId);
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
      3000
    );

    if (!error && inserted) {
      mockStore.addNotification(inserted);
      return inserted;
    }
  } catch (err) {
    console.warn('Supabase createNotification error or timeout, saving to mockStore:', err);
  }

  return mockStore.addNotification(newNotif);
}
