import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { ViewerWarehouseAccess } from '../types';

/**
 * Lấy danh sách các quyền xem kho đã cấp cho viewer
 */
export async function fetchViewerWarehouseAccess(userId?: string): Promise<ViewerWarehouseAccess[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getViewerWarehouseAccess(userId) as ViewerWarehouseAccess[];
  }

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
    if (error) {
      if (isSchemaMissingError(error)) {
        console.warn('Bảng viewer_warehouse_access hoặc warehouses chưa có trong Supabase, dùng mockStore:', error.message);
        return mockStore.getViewerWarehouseAccess(userId) as ViewerWarehouseAccess[];
      }
      console.warn('Lỗi khi tải danh sách quyền xem kho từ Supabase:', error);
      return mockStore.getViewerWarehouseAccess(userId) as ViewerWarehouseAccess[];
    }
    return (data || []) as ViewerWarehouseAccess[];
  } catch (err: any) {
    console.warn('Lỗi trong hàm fetchViewerWarehouseAccess, fallback mockStore:', err);
    return mockStore.getViewerWarehouseAccess(userId) as ViewerWarehouseAccess[];
  }
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
  if (!isSupabaseConfigured) {
    return mockStore.grantViewerWarehouseAccess(payload);
  }

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
    if (error) {
      console.error('Lỗi khi cấp quyền xem kho trên Supabase:', error);
      throw new Error(`Không thể cấp quyền xem kho: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      mockStore.grantViewerWarehouseAccess(payload);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm grantViewerWarehouseAccess:', err);
    throw new Error(err.message || 'Không thể cấp quyền xem kho, vui lòng thử lại.');
  }
}

/**
 * Gia hạn thời gian xem kho
 */
export async function extendViewerWarehouseAccess(id: string, newExpiresAt: string | null): Promise<any> {
  if (!isSupabaseConfigured) {
    mockStore.extendViewerWarehouseAccess(id, newExpiresAt);
    return { success: true };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('viewer_warehouse_access')
        .update({ expires_at: newExpiresAt })
        .eq('id', id)
        .select(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi gia hạn quyền xem kho trên Supabase:', error);
      throw new Error(`Không thể gia hạn quyền xem kho: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      mockStore.extendViewerWarehouseAccess(id, newExpiresAt);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm extendViewerWarehouseAccess:', err);
    throw new Error(err.message || 'Không thể gia hạn quyền xem kho, vui lòng thử lại.');
  }
}

/**
 * Thu hồi quyền xem kho (Xóa bản ghi)
 */
export async function revokeViewerWarehouseAccess(id: string): Promise<any> {
  if (!isSupabaseConfigured) {
    mockStore.deleteViewerWarehouseAccess(id);
    return { success: true };
  }

  try {
    const { error } = await withTimeout(
      supabase
        .from('viewer_warehouse_access')
        .delete()
        .eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi thu hồi quyền xem kho trên Supabase:', error);
      throw new Error(`Không thể thu hồi quyền xem kho: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      mockStore.deleteViewerWarehouseAccess(id);
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi trong hàm revokeViewerWarehouseAccess:', err);
    throw new Error(err.message || 'Không thể thu hồi quyền xem kho, vui lòng thử lại.');
  }
}
