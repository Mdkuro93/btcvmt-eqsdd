import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { sanitizeUuid } from './assets';

export function isDuplicateUnconfirmed(message?: string | null): boolean {
  if (!message) return false;
  return message.includes('DUPLICATE_UNCONFIRMED');
}

export interface BulkApproveDeclarationItem {
  request_id: string;
  asset_code_prefix: string | null;
  duplicate_ack_reason?: string | null;
}

export async function fetchDeclarationRequests(filters?: any): Promise<any[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  let query = supabase.from('asset_declaration_requests').select(`
    *,
    projects(name, areas(name)),
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

  const { id: _id, ...rest } = payload;
  const sanitized = {
    ...rest,
    parent_asset_id: sanitizeUuid(rest.parent_asset_id),
    old_asset_id: sanitizeUuid(rest.old_asset_id),
    project_id: sanitizeUuid(rest.project_id),
    warehouse_id: sanitizeUuid(rest.warehouse_id),
    current_owner_entity_id: sanitizeUuid(rest.current_owner_entity_id),
    requester_id: sanitizeUuid(rest.requester_id),
  };

  const { error } = await withTimeout(
    supabase.from('asset_declaration_requests').insert([sanitized]),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Lỗi createDeclarationRequest: ' + error.message);
  return true;
}

export async function approveDeclarationRequest(
  requestId: string,
  assetCodePrefix: string | null = null,
  duplicateAckReason: string | null = null
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanAck = duplicateAckReason ? duplicateAckReason.trim() : null;

  const { error } = await withTimeout(
    supabase.rpc('approve_asset_declaration_request', {
      p_request_id: requestId,
      p_decision: 'approved',
      p_asset_code_prefix: assetCodePrefix,
      p_duplicate_ack_reason: cleanAck && cleanAck.length > 0 ? cleanAck : null
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (isDuplicateUnconfirmed(error.message)) {
      const err = new Error(error.message) as Error & { code: string };
      err.code = 'DUPLICATE_UNCONFIRMED';
      throw err;
    }
    throw new Error('Lỗi approveDeclarationRequest: ' + error.message);
  }
}

export async function bulkApproveDeclarationRequests(
  items: BulkApproveDeclarationItem[]
): Promise<{ request_id: string; asset_id: string | null; error_message: string | null }[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const sanitizedItems = items.map((it) => {
    const itemObj: Record<string, any> = {
      request_id: it.request_id,
      asset_code_prefix: it.asset_code_prefix,
    };
    if (it.duplicate_ack_reason) {
      const trimmed = it.duplicate_ack_reason.trim();
      if (trimmed.length > 0) {
        itemObj.duplicate_ack_reason = trimmed;
      }
    }
    return itemObj;
  });

  const { data, error } = await withTimeout(
    supabase.rpc('approve_asset_declaration_requests_bulk', { p_items: sanitizedItems }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw new Error('Lỗi bulkApproveDeclarationRequests: ' + error.message);
  return data || [];
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

export async function updateDeclarationRequest(requestId: string, payload: any): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const { error } = await withTimeout(
    supabase.from('asset_declaration_requests').update(payload).eq('id', requestId),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw new Error('Lỗi updateDeclarationRequest: ' + error.message);
}