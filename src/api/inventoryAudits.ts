import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
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
    if (error) {
      if (isSchemaMissingError(error)) {
        console.warn('Bảng inventory_audits hoặc warehouses chưa có trên Supabase, dùng mockStore:', error.message);
        return mockStore.getInventoryAudits(warehouseId);
      }
      console.warn('Lỗi khi tải danh sách đợt kiểm kê từ Supabase, dùng mockStore:', error);
      return mockStore.getInventoryAudits(warehouseId);
    }

    return (data || []).map((row: any) => ({
      ...row,
      warehouse: row.warehouses,
      profiles: row.performer,
    }));
  } catch (err: any) {
    console.warn('Lỗi trong hàm fetchInventoryAudits, fallback sang mockStore:', err);
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

    if (auditError) {
      if (isSchemaMissingError(auditError)) {
        return mockStore.getInventoryAudit(auditId);
      }
      console.warn('Lỗi khi tải thông tin đợt kiểm kê từ Supabase, dùng mockStore:', auditError);
      return mockStore.getInventoryAudit(auditId);
    }
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

    if (itemsError) {
      if (isSchemaMissingError(itemsError)) {
        return mockStore.getInventoryAudit(auditId);
      }
      console.warn('Lỗi khi tải items kiểm kê từ Supabase:', itemsError);
    }

    return {
      ...audit,
      warehouse: audit.warehouses,
      profiles: audit.performer,
      items: items || [],
    };
  } catch (err: any) {
    console.warn('Lỗi trong hàm getInventoryAuditDetail, fallback sang mockStore:', err);
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

    if (assetErr) {
      console.error('Lỗi khi kiểm tra danh sách GCN trong kho để kiểm kê:', assetErr);
      throw new Error(`Không thể tải danh sách GCN trong kho: ${assetErr.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
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

    if (createAuditErr) {
      console.error('Lỗi khi tạo đợt kiểm kê mới trên Supabase:', createAuditErr);
      throw new Error(`Không thể khởi tạo đợt kiểm kê: ${createAuditErr.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

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

      if (insertItemsErr) {
        console.error('Lỗi khi chèn danh sách chi tiết kiểm kê:', insertItemsErr);
        throw new Error(`Không thể tạo danh sách GCN cần kiểm kê: ${insertItemsErr.message || 'Lỗi cơ sở dữ liệu'}.`);
      }
    }

    // 4. Ghi log activity
    try {
      await logActivity({
        actionType: 'Bắt đầu kiểm kê kho',
        warehouseId,
        description: `Bắt đầu đợt kiểm kê tại kho ${audit.warehouses?.name || warehouseId} với ${assetList.length} GCN dự kiến.`,
        notes,
        performedBy: profile.id,
      });
    } catch (e) {
      console.warn('Log activity error:', e);
    }

    const detail = await getInventoryAuditDetail(audit.id);
    if (!detail) {
      throw new Error('Không thể tải chi tiết đợt kiểm kê vừa tạo.');
    }
    return detail;
  } catch (err: any) {
    console.error('Lỗi trong hàm createInventoryAudit:', err);
    throw new Error(err.message || 'Không thể tạo đợt kiểm kê mới, vui lòng thử lại.');
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

    if (error) {
      console.error('Lỗi khi cập nhật dòng kiểm kê trên Supabase:', error);
      throw new Error(`Không thể cập nhật dòng kiểm kê: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    // Recalculate stats on parent audit
    if (updated?.audit_id) {
      await recalculateAuditStats(updated.audit_id);
    }

    return updated;
  } catch (err: any) {
    console.error('Lỗi trong hàm updateInventoryAuditItem:', err);
    throw new Error(err.message || 'Không thể cập nhật kết quả kiểm kê GCN, vui lòng thử lại.');
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
      const { error } = await withTimeout(
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
      if (error) {
        console.error('Lỗi khi cập nhật batch dòng kiểm kê:', error);
        throw new Error(`Không thể cập nhật dòng kiểm kê ID ${item.id}: ${error.message}`);
      }
    }
    await recalculateAuditStats(auditId);
  } catch (err: any) {
    console.error('Lỗi trong hàm batchUpdateAuditItems:', err);
    throw new Error(err.message || 'Không thể cập nhật hàng loạt kết quả kiểm kê, vui lòng thử lại.');
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

    if (error) {
      console.error('Lỗi khi lấy items để tính toán thống kê kiểm kê:', error);
      throw error;
    }
    if (!items) return;

    const total_expected = items.length;
    const total_found = items.filter(i => i.actual_found).length;
    const total_missing = items.filter(i => i.finding_status === 'missing').length;
    const total_misplaced = items.filter(i => i.finding_status === 'misplaced').length;

    const { error: updateErr } = await withTimeout(
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
    if (updateErr) throw updateErr;
  } catch (err: any) {
    console.warn('Recalculate audit stats failed on Supabase:', err);
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

    if (error) {
      console.error('Lỗi khi hoàn tất đợt kiểm kê trên Supabase:', error);
      throw new Error(`Không thể chốt đợt kiểm kê: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

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

    return await getInventoryAuditDetail(auditId);
  } catch (err: any) {
    console.error('Lỗi trong hàm completeInventoryAudit:', err);
    throw new Error(err.message || 'Không thể hoàn tất đợt kiểm kê, vui lòng thử lại.');
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

    if (error) {
      console.error('Lỗi khi xóa đợt kiểm kê trên Supabase:', error);
      throw new Error(`Không thể xóa đợt kiểm kê: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    return true;
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteInventoryAudit:', err);
    throw new Error(err.message || 'Không thể xóa đợt kiểm kê, vui lòng thử lại.');
  }
}
