import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { ViewerWarehouseAccess } from '../types';

/**
 * Lấy danh sách các quyền xem kho đã cấp cho viewer
 */
export async function fetchViewerWarehouseAccess(userId?: string): Promise<ViewerWarehouseAccess[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('viewer_warehouse_access')
        .select(`
          *,
          profiles:profiles!viewer_warehouse_access_user_id_fkey(id, full_name, email, role, status),
          approver:profiles!viewer_warehouse_access_approved_by_fkey(id, full_name, email),
          warehouses:warehouses(id, name, code, is_central)
        `)
        .order('approved_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
      if (error) throw error;
      return (data || []) as ViewerWarehouseAccess[];
    } catch (err) {
      console.warn('Supabase fetchViewerWarehouseAccess error, using mockStore:', err);
    }
  }

  return mockStore.getViewerWarehouseAccess(userId) as ViewerWarehouseAccess[];
}

/**
 * Cấp quyền xem kho cho user
 */
export async function grantViewerWarehouseAccess(payload: {
  user_id: string;
  warehouse_id: string;
  approved_by: string;
  expires_at?: string | null;
  notes?: string | null;
}): Promise<any> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('viewer_warehouse_access')
          .upsert(
            {
              user_id: payload.user_id,
              warehouse_id: payload.warehouse_id,
              approved_by: payload.approved_by,
              approved_at: new Date().toISOString(),
              expires_at: payload.expires_at || null,
              notes: payload.notes || null,
            },
            { onConflict: 'user_id,warehouse_id' }
          )
          .select(),
        DEFAULT_WRITE_TIMEOUT
      );
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase grantViewerWarehouseAccess error, using mockStore:', err);
    }
  }

  return mockStore.grantViewerWarehouseAccess(payload);
}

/**
 * Gia hạn thời gian xem kho
 */
export async function extendViewerWarehouseAccess(id: string, newExpiresAt: string | null): Promise<any> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('viewer_warehouse_access')
          .update({ expires_at: newExpiresAt })
          .eq('id', id)
          .select(),
        DEFAULT_WRITE_TIMEOUT
      );
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase extendViewerWarehouseAccess error, using mockStore:', err);
    }
  }

  mockStore.extendViewerWarehouseAccess(id, newExpiresAt);
  return { success: true };
}

/**
 * Thu hồi quyền xem kho (Xóa bản ghi)
 */
export async function revokeViewerWarehouseAccess(id: string): Promise<any> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await withTimeout(
        supabase
          .from('viewer_warehouse_access')
          .delete()
          .eq('id', id),
        DEFAULT_WRITE_TIMEOUT
      );
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.warn('Supabase revokeViewerWarehouseAccess error, using mockStore:', err);
    }
  }

  mockStore.deleteViewerWarehouseAccess(id);
  return { success: true };
}
