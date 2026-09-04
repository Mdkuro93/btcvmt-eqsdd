import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { AccessLog } from '../types';

export interface LogAccessEventPayload {
  userId: string;
  action: 'login' | 'view_asset' | 'search' | 'export' | string;
  resourceTable?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Ghi log hành động truy cập (login, view_asset, search, export)
 */
export async function logAccessEvent(payload: LogAccessEventPayload): Promise<any> {
  const { userId, action, resourceTable, resourceId, details, ipAddress, userAgent } = payload;
  if (!userId) return;

  const row = {
    user_id: userId,
    action,
    resource_table: resourceTable || null,
    resource_id: resourceId || null,
    details: details || {},
    ip_address: ipAddress || null,
    user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('access_logs').insert([row]).select().single(),
        3000
      );
      if (!error && data) return data;
    } catch (err) {
      console.warn('Supabase logAccessEvent error or timeout, saving to mockStore:', err);
    }
  }

  return mockStore.addAccessLog(row);
}

/**
 * Lấy danh sách nhật ký truy cập (cho Admin thống kê báo cáo)
 */
export async function fetchAccessLogs(filters?: {
  userId?: string;
  action?: string;
}): Promise<AccessLog[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('access_logs')
        .select(`
          *,
          profiles:profiles!access_logs_user_id_fkey(id, full_name, email, role)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      const { data, error } = await withTimeout(query, 4000);
      if (error) throw error;
      return (data || []) as AccessLog[];
    } catch (err) {
      console.warn('Supabase fetchAccessLogs error, using mockStore:', err);
    }
  }

  return mockStore.getAccessLogs(filters) as AccessLog[];
}
