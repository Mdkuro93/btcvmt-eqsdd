import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { AccessRequest, ViewerWarehouseAccess } from '../types';
import { grantViewerWarehouseAccess } from './viewerAccess';

/**
 * Lấy danh sách yêu cầu truy cập kho (Có áp dụng RLS hoặc filter theo role)
 */
export async function fetchAccessRequests(statusFilter?: 'pending' | 'approved' | 'rejected' | 'all'): Promise<AccessRequest[]> {
  if (!isSupabaseConfigured) {
    let reqs = mockStore.getAccessRequests();
    if (statusFilter && statusFilter !== 'all') {
      reqs = reqs.filter(r => r.status === statusFilter);
    }
    return reqs as AccessRequest[];
  }

  let query = supabase
    .from('access_requests')
    .select(`
      *,
      reviewer:profiles!access_requests_reviewed_by_fkey(full_name, email),
      warehouses:warehouses(id, name, code, is_central)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) {
    throw new Error('Không tải được danh sách yêu cầu truy cập: ' + error.message);
  }
  return (data || []) as AccessRequest[];
}

/**
 * Duyệt yêu cầu cấp quyền xem kho cho viewer
 */
export async function approveAccessRequest(params: {
  requestId: string;
  reviewerId: string;
  expiresAt?: string | null; // ISO Date String or null for perpetual
  notes?: string;
}): Promise<any> {
  const { requestId, reviewerId, expiresAt, notes } = params;

  if (!isSupabaseConfigured) {
    // Local Mock Logic
    const allReqs = mockStore.getAccessRequests();
    const targetReq = allReqs.find(r => r.id === requestId);
    if (!targetReq) throw new Error('Không tìm thấy yêu cầu cần duyệt');

    let profiles = mockStore.getProfiles();
    let userProfile = profiles.find(p => p.email?.toLowerCase() === targetReq.email.toLowerCase());
    const derivedUsername = targetReq.email.split('@')[0].toLowerCase();

    if (!userProfile) {
      userProfile = {
        id: `usr-viewer-${Date.now()}`,
        username: derivedUsername,
        email: targetReq.email.toLowerCase(),
        full_name: targetReq.full_name,
        role: 'viewer',
        status: 'active',
        permissions: ['asset.view'],
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        organization: targetReq.organization || null,
        purpose: targetReq.purpose || null,
        phone: targetReq.phone || null,
      };
      mockStore.saveProfiles([userProfile, ...profiles]);
    } else {
      userProfile.status = 'active';
      if (!userProfile.username) {
        userProfile.username = derivedUsername;
      }
      if (!userProfile.organization && targetReq.organization) {
        userProfile.organization = targetReq.organization;
      }
      if (!userProfile.purpose && targetReq.purpose) {
        userProfile.purpose = targetReq.purpose;
      }
      if (!userProfile.phone && targetReq.phone) {
        userProfile.phone = targetReq.phone;
      }
      mockStore.saveProfiles([...profiles]);
    }

    // Grant warehouse access
    grantViewerWarehouseAccess({
      user_id: userProfile.id,
      warehouse_id: targetReq.warehouse_id,
      approved_by: reviewerId,
      expires_at: expiresAt || null,
      notes: notes || null,
    });

    // Update request state
    mockStore.updateAccessRequest(requestId, {
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    });

    return { success: true };
  }

  // Chỉ duyệt qua RPC (kiểm tra quyền + phạm vi kho ở phía DB). KHÔNG có đường dự phòng ghi thẳng bảng.
  const { data, error } = await withTimeout(
    supabase.rpc('approve_viewer_access_request', {
      p_request_id: requestId,
      p_expires_at: expiresAt || null,
      p_notes: notes || null,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) {
    throw new Error('Không thể duyệt yêu cầu: ' + error.message);
  }
  return data;
}

/**
 * Từ chối yêu cầu cấp quyền xem kho
 */
export async function rejectAccessRequest(params: {
  requestId: string;
  reviewerId: string;
  rejectReason: string;
}): Promise<any> {
  const { requestId, reviewerId, rejectReason } = params;

  if (!isSupabaseConfigured) {
    mockStore.updateAccessRequest(requestId, {
      status: 'rejected',
      reject_reason: rejectReason,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    });
    return { success: true };
  }

  const { data, error } = await withTimeout(
    supabase.rpc('reject_viewer_access_request', {
      p_request_id: requestId,
      p_reason: rejectReason,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) {
    throw new Error('Không thể từ chối yêu cầu: ' + error.message);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Dành cho tài khoản tra cứu (viewer): xem quyền của mình và xin thêm/gia hạn kho
// ---------------------------------------------------------------------------

export interface MyWarehouseCatalogItem {
  id: string;
  name: string;
  code: string | null;
  is_central: boolean | null;
}

export interface MyAccessOverview {
  warehouses: MyWarehouseCatalogItem[];
  access: ViewerWarehouseAccess[];
  requests: AccessRequest[];
}

/**
 * Tổng hợp quyền của chính người dùng: danh mục kho, quyền đã cấp, các yêu cầu đã gửi.
 * Danh mục kho lấy qua RPC list_registration_warehouses (RLS có thể ẩn kho chưa được cấp quyền).
 */
export async function fetchMyAccessOverview(userId: string): Promise<MyAccessOverview> {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase.');
  }

  const [whRes, accessRes, reqRes] = await Promise.all([
    withTimeout(supabase.rpc('list_registration_warehouses'), DEFAULT_READ_TIMEOUT),
    withTimeout(
      supabase.from('viewer_warehouse_access').select('*').eq('user_id', userId),
      DEFAULT_READ_TIMEOUT
    ),
    withTimeout(
      supabase.from('access_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      DEFAULT_READ_TIMEOUT
    ),
  ]);

  if (whRes.error) {
    throw new Error('Không tải được danh sách kho: ' + whRes.error.message + ' (cần chạy migration 0044).');
  }
  if (accessRes.error) {
    throw new Error('Không tải được quyền truy cập của bạn: ' + accessRes.error.message);
  }
  if (reqRes.error) {
    throw new Error('Không tải được các yêu cầu đã gửi: ' + reqRes.error.message + ' (cần chạy migration 0044).');
  }

  return {
    warehouses: (whRes.data || []) as MyWarehouseCatalogItem[],
    access: (accessRes.data || []) as ViewerWarehouseAccess[],
    requests: (reqRes.data || []) as AccessRequest[],
  };
}

export interface RequestWarehouseAccessResult {
  created: number;
  skipped_active: number;
  skipped_pending: number;
  skipped_invalid: number;
}

/**
 * Xin quyền xem thêm một hoặc nhiều kho (hoặc gia hạn kho sắp/đã hết hạn).
 * Danh tính lấy từ phiên đăng nhập ở phía DB (RPC request_warehouse_access), không nhận email từ trình duyệt.
 */
export async function requestWarehouseAccess(params: {
  warehouseIds: string[];
  purpose?: string;
}): Promise<RequestWarehouseAccessResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase.');
  }
  if (!params.warehouseIds || params.warehouseIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một kho.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('request_warehouse_access', {
      p_warehouse_ids: params.warehouseIds,
      p_purpose: params.purpose?.trim() || null,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) {
    throw new Error('Không thể gửi yêu cầu: ' + error.message);
  }
  return data as RequestWarehouseAccessResult;
}