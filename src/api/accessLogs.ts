import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
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

  if (!isSupabaseConfigured) {
    return mockStore.addAccessLog(row);
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from('access_logs').insert([row]).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.warn('Lỗi ghi nhật ký truy cập vào Supabase:', error.message);
      throw new Error('Lỗi ghi nhật ký truy cập vào Supabase: ' + error.message);
    }
    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể ghi nhật ký truy cập: ' + String(err));
  }
}

/**
 * Lấy danh sách nhật ký truy cập (cho Admin thống kê báo cáo)
 */
export async function fetchAccessLogs(filters?: {
  userId?: string;
  action?: string;
}): Promise<AccessLog[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAccessLogs(filters) as AccessLog[];
  }

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

    const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) {
      throw new Error('Lỗi khi tải nhật ký truy cập từ Supabase: ' + error.message);
    }
    return (data || []) as AccessLog[];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải nhật ký truy cập: ' + String(err));
  }
}
