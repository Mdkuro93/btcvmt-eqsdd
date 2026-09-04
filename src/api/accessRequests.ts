import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { AccessRequest } from '../types';
import { grantViewerWarehouseAccess } from './viewerAccess';
import { createNotification } from './notifications';

export interface CreateAccessRequestPayload {
  full_name: string;
  email: string;
  phone?: string;
  organization?: string;
  purpose?: string;
  warehouse_ids: string[]; // List of warehouse IDs user requests to view
}

/**
 * Gửi yêu cầu đăng ký viewer theo từng kho (public, không cần đăng nhập)
 */
export async function submitAccessRequests(payload: CreateAccessRequestPayload): Promise<{ success: boolean; count: number }> {
  const { full_name, email, phone, organization, purpose, warehouse_ids } = payload;
  if (!warehouse_ids || warehouse_ids.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một kho lưu trữ để yêu cầu quyền xem.');
  }

  const rows = warehouse_ids.map(warehouse_id => ({
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    organization: organization?.trim() || null,
    purpose: purpose?.trim() || null,
    warehouse_id,
    status: 'pending',
  }));

  if (isSupabaseConfigured) {
    try {
      const { error } = await withTimeout(
        supabase.from('access_requests').insert(rows),
        5000
      );
      if (error) throw error;
      return { success: true, count: rows.length };
    } catch (err) {
      console.warn('Supabase submitAccessRequests error or timeout, saving to mockStore:', err);
    }
  }

  // Fallback / Mock
  for (const row of rows) {
    mockStore.addAccessRequest(row);
  }
  return { success: true, count: rows.length };
}

/**
 * Lấy danh sách yêu cầu truy cập kho (Có áp dụng RLS hoặc filter theo role)
 */
export async function fetchAccessRequests(statusFilter?: 'pending' | 'approved' | 'rejected' | 'all'): Promise<AccessRequest[]> {
  if (isSupabaseConfigured) {
    try {
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

      const { data, error } = await withTimeout(query, 4000);
      if (error) throw error;
      return (data || []) as AccessRequest[];
    } catch (err) {
      console.warn('Supabase fetchAccessRequests error, fallback to mockStore:', err);
    }
  }

  let reqs = mockStore.getAccessRequests();
  if (statusFilter && statusFilter !== 'all') {
    reqs = reqs.filter(r => r.status === statusFilter);
  }
  return reqs as AccessRequest[];
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

  if (isSupabaseConfigured) {
    try {
      // 1. Thử gọi RPC duyệt an toàn
      const { data, error } = await withTimeout(
        supabase.rpc('approve_viewer_access_request', {
          p_request_id: requestId,
          p_expires_at: expiresAt || null,
          p_notes: notes || null,
        }),
        5000
      );

      if (!error) {
        return data;
      }
      console.warn('RPC approve_viewer_access_request failed, trying direct table update:', error);

      // 2. Direct query fallback if RPC is not deployed yet
      const { data: reqData, error: reqErr } = await supabase
        .from('access_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      if (reqErr || !reqData) throw reqErr || new Error('Không tìm thấy yêu cầu');

      // Find or create profile
      let targetUserId: string;
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', reqData.email)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
        await supabase.from('profiles').update({ status: 'active' }).eq('id', targetUserId);
      } else {
        const { data: newProf, error: pErr } = await supabase.from('profiles').insert([{
          email: reqData.email.toLowerCase(),
          full_name: reqData.full_name,
          role: 'viewer',
          status: 'active',
          permissions: ['asset.view'],
        }]).select().single();
        if (pErr) throw pErr;
        targetUserId = newProf.id;
      }

      // Upsert into viewer_warehouse_access
      await supabase.from('viewer_warehouse_access').upsert({
        user_id: targetUserId,
        warehouse_id: reqData.warehouse_id,
        approved_by: reviewerId,
        approved_at: new Date().toISOString(),
        expires_at: expiresAt || null,
        notes: notes || null,
      }, { onConflict: 'user_id,warehouse_id' });

      // Update access_requests status
      await supabase.from('access_requests').update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', requestId);

      return { success: true };
    } catch (err) {
      console.warn('Supabase approveAccessRequest error, fallback to mockStore:', err);
    }
  }

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
    };
    mockStore.saveProfiles([userProfile, ...profiles]);
  } else {
    userProfile.status = 'active';
    if (!userProfile.username) {
      userProfile.username = derivedUsername;
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

/**
 * Từ chối yêu cầu cấp quyền xem kho
 */
export async function rejectAccessRequest(params: {
  requestId: string;
  reviewerId: string;
  rejectReason: string;
}): Promise<any> {
  const { requestId, reviewerId, rejectReason } = params;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('access_requests')
          .update({
            status: 'rejected',
            reject_reason: rejectReason,
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', requestId)
          .select(),
        4000
      );
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase rejectAccessRequest error, fallback to mockStore:', err);
    }
  }

  mockStore.updateAccessRequest(requestId, {
    status: 'rejected',
    reject_reason: rejectReason,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  });
  return { success: true };
}
