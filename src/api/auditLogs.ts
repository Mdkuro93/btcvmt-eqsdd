import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { AuditLog } from '../types';
import { mockStore } from '../lib/mockStore';
import { sanitizeUuid } from './assets';

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

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) {
    if (isSchemaMissingError(error)) {
      throw new Error(
        'Bảng audit_logs chưa có trong cơ sở dữ liệu Supabase hoặc quan hệ liên kết profiles chưa khớp. ' +
        'Vui lòng chạy migration 0035_create_audit_logs.sql trong Supabase SQL Editor.'
      );
    }
    throw new Error(`Lỗi khi tải lịch sử kiểm toán: ${error.message || 'Lỗi cơ sở dữ liệu'}`);
  }

  return data || [];
};

export const createAuditLog = async (
  log: Omit<AuditLog, 'id' | 'created_at'>
): Promise<AuditLog> => {
  if (!isSupabaseConfigured) {
    return mockStore.addAuditLog(log);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('audit_logs')
      .insert([
        {
          record_id: String(log.record_id),
          action: log.action,
          old_data: log.old_data || null,
          new_data: log.new_data || null,
          changed_by: sanitizeUuid(log.changed_by),
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
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (isSchemaMissingError(error)) {
      throw new Error(
        'Không thể lưu nhật ký kiểm toán: bảng audit_logs chưa có trong cơ sở dữ liệu Supabase. ' +
        'Vui lòng chạy migration 0035_create_audit_logs.sql trong Supabase SQL Editor.'
      );
    }
    throw new Error(`Không thể lưu nhật ký kiểm toán: ${error.message || 'Lỗi cơ sở dữ liệu'}`);
  }

  return data;
};
