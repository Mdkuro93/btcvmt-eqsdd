import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { sanitizeUuid } from './assets';

export interface FetchActivityLogsParams {
  assetId?: string;
  actionType?: string;
  warehouseId?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function fetchActivityLogs(params?: FetchActivityLogsParams | string): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getLogs(params);
  }

  const assetId = typeof params === 'string' ? params : params?.assetId;
  const actionType = typeof params === 'object' ? params?.actionType : undefined;
  const warehouseId = typeof params === 'object' ? params?.warehouseId : undefined;
  const projectId = typeof params === 'object' ? params?.projectId : undefined;
  const fromDate = typeof params === 'object' ? params?.fromDate : undefined;
  const toDate = typeof params === 'object' ? params?.toDate : undefined;

  let query = supabase
    .from('activity_logs')
    .select(`
      *,
      performer:profiles!activity_logs_performed_by_fkey(full_name, email),
      warehouse:warehouses(name),
      asset:assets(id, certificate_no, project_id, projects(id, name))
    `)
    .order('log_date', { ascending: false });

  if (assetId) query = query.eq('asset_id', assetId);
  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  if (actionType) query = query.eq('action_type', actionType);
  if (fromDate) query = query.gte('log_date', fromDate);
  if (toDate) query = query.lte('log_date', toDate);
  if (projectId) query = query.eq('asset.project_id', projectId);

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) {
    throw new Error('Lỗi tải nhật ký biến động từ CSDL Supabase: ' + error.message);
  }

  let result = data || [];
  // Đảm bảo lọc chính xác theo projectId ở tầng ứng dụng nếu có quan hệ lồng
  if (projectId) {
    result = result.filter(item => item.asset?.project_id === projectId);
  }

  return result;
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

  // Tự động gán người thực hiện nếu chưa có
  let performedBy = sanitizeUuid(logData.performedBy);
  if (!performedBy) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) performedBy = user.id;
    } catch {}
  }

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
          performed_by: performedBy,
        },
      ])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error('Lỗi ghi nhật ký biến động (activity_logs): ' + error.message);
  }

  return data;
}
