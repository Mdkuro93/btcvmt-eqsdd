import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { InventoryAudit, InventoryAuditItem, Profile } from '../types';
import { mockStore } from '../lib/mockStore';
import { logActivity } from './activityLogs';

/**
 * Lấy danh sách các đợt kiểm kê kho
 */
export async function fetchInventoryAudits(warehouseId?: string): Promise<InventoryAudit[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getInventoryAudits(warehouseId);
  }

  try {
    let query = supabase
      .from('inventory_audits')
      .select(`
        *,
        warehouses:warehouses(id, name, code, is_central, region_code),
        performer:profiles!inventory_audits_performed_by_fkey(id, full_name, email)
      `)
      .order('started_at', { ascending: false });

    if (warehouseId && warehouseId !== 'all') {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) throw error;

    return (data || []).map((row: any) => ({
      ...row,
      warehouse: row.warehouses,
      profiles: row.performer,
    }));
  } catch (err) {
    console.warn('Supabase fetch inventory audits failed, fallback to mockStore:', err);
    return mockStore.getInventoryAudits(warehouseId);
  }
}

/**
 * Lấy chi tiết một đợt kiểm kê kèm danh sách các dòng kiểm kê (items)
 */
export async function getInventoryAuditDetail(auditId: string): Promise<InventoryAudit | null> {
  if (!isSupabaseConfigured) {
    return mockStore.getInventoryAudit(auditId);
  }

  try {
    const { data: audit, error: auditError } = await withTimeout(
      supabase
        .from('inventory_audits')
        .select(`
          *,
          warehouses:warehouses(id, name, code, is_central, region_code),
          performer:profiles!inventory_audits_performed_by_fkey(id, full_name, email)
        `)
        .eq('id', auditId)
        .single(),
      DEFAULT_READ_TIMEOUT
    );

    if (auditError) throw auditError;
    if (!audit) return null;

    const { data: items, error: itemsError } = await withTimeout(
      supabase
        .from('inventory_audit_items')
        .select(`
          *,
          asset:assets(
            id,
            asset_code,
            certificate_no,
            subdivision,
            lot_no,
            land_lot_no,
            map_sheet_no,
            business_project_name,
            business_plot_code,
            owner_name,
            area,
            custody_status,
            scan_file_url,
            projects:projects(name),
            warehouses:warehouses(name)
          )
        `)
        .eq('audit_id', auditId)
        .order('created_at', { ascending: true }),
      DEFAULT_READ_TIMEOUT
    );

    if (itemsError) throw itemsError;

    return {
      ...audit,
      warehouse: audit.warehouses,
      profiles: audit.performer,
      items: items || [],
    };
  } catch (err) {
    console.warn('Supabase get inventory audit detail failed, fallback to mockStore:', err);
    return mockStore.getInventoryAudit(auditId);
  }
}

/**
 * Bắt đầu đợt kiểm kê mới cho 1 kho:
 * Quét toàn bộ assets có `custody_status = 'in_stock'` tại kho đó và tạo audit session
 */
export async function createInventoryAudit(
  warehouseId: string,
  profile: Profile,
  notes?: string
): Promise<InventoryAudit> {
  if (!isSupabaseConfigured) {
    const audit = mockStore.createInventoryAudit(warehouseId, profile.id, notes);
    // Ghi nhật ký biến động
    try {
      await logActivity({
        actionType: 'Bắt đầu kiểm kê kho',
        warehouseId,
        description: `Bắt đầu đợt kiểm kê tại kho ${audit.warehouses?.name || warehouseId} với ${audit.total_expected} GCN dự kiến.`,
        notes,
        performedBy: profile.id,
      });
    } catch (e) {
      console.warn('Log activity error:', e);
    }
    return audit;
  }

  try {
    // 1. Lấy danh sách toàn bộ asset in_stock tại kho
    const { data: assets, error: assetErr } = await withTimeout(
      supabase
        .from('assets')
        .select('id, subdivision, lot_no, land_lot_no, certificate_no, custody_status')
        .eq('warehouse_id', warehouseId)
        .eq('custody_status', 'in_stock'),
      DEFAULT_READ_TIMEOUT
    );

    if (assetErr) throw assetErr;
    const assetList = assets || [];

    // 2. Tạo bản ghi inventory_audits
    const { data: audit, error: createAuditErr } = await withTimeout(
      supabase
        .from('inventory_audits')
        .insert({
          warehouse_id: warehouseId,
          performed_by: profile.id,
          started_at: new Date().toISOString(),
          status: 'in_progress',
          notes: notes || null,
          total_expected: assetList.length,
          total_found: 0,
          total_missing: 0,
          total_misplaced: 0,
        })
        .select(`
          *,
          warehouses:warehouses(id, name, code, is_central, region_code),
          performer:profiles!inventory_audits_performed_by_fkey(id, full_name, email)
        `)
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (createAuditErr) throw createAuditErr;

    // 3. Tạo các dòng inventory_audit_items
    if (assetList.length > 0) {
      const itemsToInsert = assetList.map((a: any) => ({
        audit_id: audit.id,
        asset_id: a.id,
        expected_status: 'in_stock',
        expected_location: a.subdivision ? `${a.subdivision} - Lô ${a.lot_no || ''}` : 'Vị trí kho tiêu chuẩn',
        actual_found: false,
        actual_location: null,
        finding_status: 'pending',
        note: null,
      }));

      const { error: insertItemsErr } = await withTimeout(
        supabase.from('inventory_audit_items').insert(itemsToInsert),
        DEFAULT_WRITE_TIMEOUT
      );

      if (insertItemsErr) throw insertItemsErr;
    }

    // 4. Ghi log activity
    await logActivity({
      actionType: 'Bắt đầu kiểm kê kho',
      warehouseId,
      description: `Bắt đầu đợt kiểm kê tại kho ${audit.warehouses?.name || warehouseId} với ${assetList.length} GCN dự kiến.`,
      notes,
      performedBy: profile.id,
    });

    return await getInventoryAuditDetail(audit.id) as InventoryAudit;
  } catch (err) {
    console.warn('Supabase create inventory audit failed, fallback to mockStore:', err);
    return mockStore.createInventoryAudit(warehouseId, profile.id, notes);
  }
}

/**
 * Cập nhật một dòng kiểm kê
 */
export async function updateInventoryAuditItem(
  itemId: string,
  data: {
    finding_status: 'pending' | 'matched' | 'missing' | 'misplaced';
    actual_found: boolean;
    actual_location?: string | null;
    note?: string | null;
  }
): Promise<InventoryAuditItem | null> {
  if (!isSupabaseConfigured) {
    return mockStore.updateInventoryAuditItem(itemId, data);
  }

  try {
    const { data: updated, error } = await withTimeout(
      supabase
        .from('inventory_audit_items')
        .update({
          ...data,
          audited_at: data.finding_status !== 'pending' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select('*')
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) throw error;

    // Recalculate stats on parent audit
    if (updated?.audit_id) {
      await recalculateAuditStats(updated.audit_id);
    }

    return updated;
  } catch (err) {
    console.warn('Supabase update audit item failed, fallback to mockStore:', err);
    return mockStore.updateInventoryAuditItem(itemId, data);
  }
}

/**
 * Cập nhật hàng loạt các dòng kiểm kê (ví dụ: đánh dấu toàn bộ đúng vị trí)
 */
export async function batchUpdateAuditItems(
  auditId: string,
  items: Array<{
    id: string;
    finding_status: 'pending' | 'matched' | 'missing' | 'misplaced';
    actual_found: boolean;
    actual_location?: string | null;
    note?: string | null;
  }>
): Promise<void> {
  if (!isSupabaseConfigured) {
    mockStore.batchUpdateAuditItems(auditId, items);
    return;
  }

  try {
    for (const item of items) {
      await withTimeout(
        supabase
          .from('inventory_audit_items')
          .update({
            finding_status: item.finding_status,
            actual_found: item.actual_found,
            actual_location: item.actual_location || null,
            note: item.note || null,
            audited_at: item.finding_status !== 'pending' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id),
        DEFAULT_WRITE_TIMEOUT
      );
    }
    await recalculateAuditStats(auditId);
  } catch (err) {
    console.warn('Supabase batch update items failed, fallback to mockStore:', err);
    mockStore.batchUpdateAuditItems(auditId, items);
  }
}

/**
 * Tính toán lại thống kê của đợt kiểm kê
 */
export async function recalculateAuditStats(auditId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    mockStore.recalculateAuditStats(auditId);
    return;
  }

  try {
    const { data: items, error } = await withTimeout(
      supabase
        .from('inventory_audit_items')
        .select('actual_found, finding_status')
        .eq('audit_id', auditId),
      DEFAULT_READ_TIMEOUT
    );

    if (error || !items) return;

    const total_expected = items.length;
    const total_found = items.filter(i => i.actual_found).length;
    const total_missing = items.filter(i => i.finding_status === 'missing').length;
    const total_misplaced = items.filter(i => i.finding_status === 'misplaced').length;

    await withTimeout(
      supabase
        .from('inventory_audits')
        .update({
          total_expected,
          total_found,
          total_missing,
          total_misplaced,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auditId),
      DEFAULT_WRITE_TIMEOUT
    );
  } catch (err) {
    console.warn('Recalculate audit stats failed:', err);
  }
}

/**
 * Hoàn tất đợt kiểm kê kho
 */
export async function completeInventoryAudit(
  auditId: string,
  profile: Profile,
  notes?: string
): Promise<InventoryAudit | null> {
  if (!isSupabaseConfigured) {
    const completed = mockStore.completeInventoryAudit(auditId, notes);
    try {
      await logActivity({
        actionType: 'Hoàn tất kiểm kê kho',
        warehouseId: completed?.warehouse_id,
        description: `Hoàn tất đợt kiểm kê kho ${completed?.warehouses?.name || auditId}. Tìm thấy ${completed?.total_found}/${completed?.total_expected} GCN (Khuyết thiếu: ${completed?.total_missing}, Sai vị trí: ${completed?.total_misplaced}).`,
        notes,
        performedBy: profile.id,
      });
    } catch (e) {
      console.warn('Log activity error:', e);
    }
    return completed;
  }

  try {
    await recalculateAuditStats(auditId);

    const { data: completed, error } = await withTimeout(
      supabase
        .from('inventory_audits')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: notes || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auditId)
        .select(`
          *,
          warehouses:warehouses(id, name, code, is_central, region_code),
          performer:profiles!inventory_audits_performed_by_fkey(id, full_name, email)
        `)
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) throw error;

    await logActivity({
      actionType: 'Hoàn tất kiểm kê kho',
      warehouseId: completed?.warehouse_id,
      description: `Hoàn tất đợt kiểm kê kho ${completed?.warehouses?.name || auditId}. Tìm thấy ${completed?.total_found}/${completed?.total_expected} GCN (Khuyết thiếu: ${completed?.total_missing}, Sai vị trí: ${completed?.total_misplaced}).`,
      notes,
      performedBy: profile.id,
    });

    return await getInventoryAuditDetail(auditId);
  } catch (err) {
    console.warn('Supabase complete audit failed, fallback to mockStore:', err);
    return mockStore.completeInventoryAudit(auditId, notes);
  }
}

/**
 * Xóa một đợt kiểm kê (chỉ dành cho Admin / BTC Manager)
 */
export async function deleteInventoryAudit(auditId: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return mockStore.deleteInventoryAudit(auditId);
  }

  try {
    const { error } = await withTimeout(
      supabase
        .from('inventory_audits')
        .delete()
        .eq('id', auditId),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase delete inventory audit failed, fallback to mockStore:', err);
    return mockStore.deleteInventoryAudit(auditId);
  }
}
