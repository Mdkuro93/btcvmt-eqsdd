import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { sanitizeUuid } from './assets';

export async function fetchActivityLogs(params?: any): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getLogs(params);
  }
  const assetId = typeof params === 'string' ? params : params?.assetId;
  const actionType = typeof params === 'object' ? params?.actionType : undefined;

  try {
    let query = supabase
      .from('activity_logs')
      .select(`
        *,
        performer:profiles!activity_logs_performed_by_fkey(full_name, email),
        warehouse:warehouses(name)
      `)
      .order('log_date', { ascending: false });

    if (assetId) query = query.eq('asset_id', assetId);
    if (actionType) query = query.eq('action_type', actionType);

    const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) {
      if (isSchemaMissingError(error)) {
        console.warn('Bảng activity_logs hoặc quan hệ liên quan chưa có trong Supabase, dùng mockStore:', error.message);
        return mockStore.getLogs(params);
      }
      console.warn('Lỗi fetchActivityLogs từ Supabase:', error);
      return mockStore.getLogs(params);
    }
    return data || [];
  } catch (err: any) {
    console.warn('Lỗi trong hàm fetchActivityLogs, fallback mockStore:', err);
    return mockStore.getLogs(params);
  }
}

export async function logActivity(logData: {
  assetId?: string;
  actionType: string;
  documentNo?: string;
  description?: string;
  usedBy?: string;
  warehouseId?: string;
  notes?: string;
  performedBy?: string;
}) {
  const warehouses = mockStore.getWarehouses();
  const whObj = logData.warehouseId ? warehouses.find(w => w.id === logData.warehouseId) : undefined;
  
  const newLog = {
    id: 'log-' + Date.now(),
    asset_id: logData.assetId || null,
    warehouse_id: logData.warehouseId || null,
    warehouse: whObj ? { name: whObj.name } : undefined,
    notes: logData.notes || null,
    log_date: new Date().toISOString(),
    action_type: logData.actionType,
    document_no: logData.documentNo || 'CT-' + Math.floor(Math.random() * 1000),
    description: logData.description || '',
    used_by: logData.usedBy || '',
    performed_by: logData.performedBy || null,
    performer: { full_name: 'Quản trị viên (BTC VMT)', email: 'quantri@btcvmt.vn' },
  };

  if (!isSupabaseConfigured) {
    const logs = mockStore.getLogs();
    mockStore.saveLogs([newLog, ...logs]);
    return newLog;
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('activity_logs')
        .insert([
          {
            asset_id: sanitizeUuid(logData.assetId),
            action_type: logData.actionType,
            document_no: logData.documentNo || null,
            description: logData.description || null,
            used_by: logData.usedBy || null,
            warehouse_id: sanitizeUuid(logData.warehouseId),
            notes: logData.notes || null,
            performed_by: sanitizeUuid(logData.performedBy),
          },
        ])
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      if (isSchemaMissingError(error)) {
        const logs = mockStore.getLogs();
        mockStore.saveLogs([newLog, ...logs]);
        return newLog;
      }
      throw error;
    }

    try {
      const logs = mockStore.getLogs();
      mockStore.saveLogs([newLog, ...logs]);
    } catch {}

    return data;
  } catch (err: any) {
    if (isSchemaMissingError(err)) {
      const logs = mockStore.getLogs();
      mockStore.saveLogs([newLog, ...logs]);
      return newLog;
    }
    const logs = mockStore.getLogs();
    mockStore.saveLogs([newLog, ...logs]);
    return newLog;
  }
}
