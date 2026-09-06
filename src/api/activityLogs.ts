import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export async function fetchActivityLogs(params?: any): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getLogs(params);
  }
  const assetId = typeof params === 'string' ? params : params?.assetId;
  const actionType = typeof params === 'object' ? params?.actionType : undefined;

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
  if (error) throw error;
  return data || [];
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

  const { data, error } = await withTimeout(
    supabase
      .from('activity_logs')
      .insert([
        {
          asset_id: logData.assetId || null,
          action_type: logData.actionType,
          document_no: logData.documentNo || null,
          description: logData.description || null,
          used_by: logData.usedBy || null,
          warehouse_id: logData.warehouseId || null,
          notes: logData.notes || null,
          performed_by: logData.performedBy || null,
        },
      ])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const logs = mockStore.getLogs();
    mockStore.saveLogs([newLog, ...logs]);
  } catch {}

  return data;
}
