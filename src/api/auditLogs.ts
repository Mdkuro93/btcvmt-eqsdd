import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
import { AuditLog } from '../types';
import { mockStore } from '../lib/mockStore';

export const fetchAuditLogs = async (recordId?: string): Promise<AuditLog[]> => {
  if (!isSupabaseConfigured) {
    return mockStore.getAuditLogs(recordId);
  }

  try {
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

    const { data, error } = await withTimeout(query, 3000);
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.warn('Supabase fetchAuditLogs error or timeout, falling back to mockStore:', error);
    return mockStore.getAuditLogs(recordId);
  }
};

export const createAuditLog = async (
  log: Omit<AuditLog, 'id' | 'created_at'>
): Promise<AuditLog> => {
  if (!isSupabaseConfigured) {
    return mockStore.addAuditLog(log);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
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
        .single(),
      3000
    );

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase createAuditLog error or timeout, saving to mockStore:', err);
    return mockStore.addAuditLog(log);
  }
};
