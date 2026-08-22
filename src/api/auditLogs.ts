import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuditLog } from '../types';
import { mockStore } from '../lib/mockStore';

export const fetchAuditLogs = async (recordId?: string): Promise<AuditLog[]> => {
  if (!isSupabaseConfigured) {
    return mockStore.getAuditLogs(recordId);
  }

  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      profiles:changed_by (
        id,
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false });

  if (recordId) {
    query = query.eq('record_id', recordId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Supabase fetchAuditLogs error, falling back to mockStore:', error);
    return mockStore.getAuditLogs(recordId);
  }

  return data || [];
};

export const createAuditLog = async (
  log: Omit<AuditLog, 'id' | 'created_at'>
): Promise<AuditLog> => {
  if (!isSupabaseConfigured) {
    return mockStore.addAuditLog(log);
  }

  const { data, error } = await supabase
    .from('audit_logs')
    .insert([
      {
        record_id: log.record_id,
        action: log.action,
        old_data: log.old_data || null,
        new_data: log.new_data || null,
        changed_by: log.changed_by || null,
        changed_by_name: log.changed_by_name || null,
        notes: log.notes || null,
      },
    ])
    .select(`
      *,
      profiles:changed_by (
        id,
        full_name,
        email
      )
    `)
    .single();

  if (error) {
    console.warn('Supabase createAuditLog error, saving to mockStore:', error);
    return mockStore.addAuditLog(log);
  }

  return data;
};
