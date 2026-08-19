import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

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

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchActivityLogs error, using mockStore:', err);
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
  const newLog = {
    id: 'log-' + Date.now(),
    asset_id: logData.assetId || null,
    log_date: new Date().toISOString(),
    action_type: logData.actionType,
    document_no: logData.documentNo || 'CT-' + Math.floor(Math.random() * 1000),
    description: logData.description || '',
    used_by: logData.usedBy || '',
    performed_by: logData.performedBy || null,
    performer: { full_name: 'Quản trị viên (BTC VMT)', email: 'admin@btcvmt.vn' },
  };

  try {
    const { data, error } = await supabase
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
      .single();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase logActivity error, saving to mockStore:', err);
  }

  const logs = mockStore.getLogs();
  mockStore.saveLogs([newLog, ...logs]);
  return newLog;
}
