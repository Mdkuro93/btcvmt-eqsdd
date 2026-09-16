import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export async function fetchDeclarationRequests(filters?: any): Promise<any[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  let query = supabase.from('asset_declaration_requests').select(`
    *,
    projects(name),
    warehouses(name),
    requester:profiles!requester_id(full_name, email),
    reviewer:profiles!reviewed_by(full_name, email)
  `).order('created_at', { ascending: false });

  if (filters) {
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.requester_id) query = query.eq('requester_id', filters.requester_id);
  }

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) throw new Error('Lỗi fetchDeclarationRequests: ' + error.message);
  return data || [];
}

export async function createDeclarationRequest(payload: any): Promise<any> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const { error } = await withTimeout(
    supabase.from('asset_declaration_requests').insert([payload]),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Lỗi createDeclarationRequest: ' + error.message);
  return true;
}

export async function approveDeclarationRequest(requestId: string, assetCodePrefix: string | null = null): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const { error } = await withTimeout(
    supabase.rpc('approve_asset_declaration_request', {
      p_request_id: requestId,
      p_decision: 'approved',
      p_asset_code_prefix: assetCodePrefix
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw new Error('Lỗi approveDeclarationRequest: ' + error.message);
}

export async function rejectDeclarationRequest(requestId: string, reason: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const { error } = await withTimeout(
    supabase.rpc('approve_asset_declaration_request', {
      p_request_id: requestId,
      p_decision: 'rejected',
      p_rejection_reason: reason
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw new Error('Lỗi rejectDeclarationRequest: ' + error.message);
}
