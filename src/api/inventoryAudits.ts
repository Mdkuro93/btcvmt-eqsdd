import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { InventoryAudit, InventoryAuditItem, InventoryAuditFindingStatus, Profile } from '../types';
import { mockStore } from '../lib/mockStore';
import { logActivity } from './activityLogs';

/**
 * Lấy danh sách các đợt kiểm kê kho
 */
export async function fetchInventoryAudits(warehouseId?: string): Promise<InventoryAudit[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getInventoryAudits(warehouseId);
  }

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
    console.error('Lỗi khi tải danh sách đợt kiểm kê từ Supabase:', error);
    throw new Error('Không thể tải danh sách đợt kiểm kê: ' + error.message);
  }

  return (data || []).map((row: any) => ({
    ...row,
    warehouse: row.warehouses,
    profiles: row.performer,
  }));
}

/**
 * Lấy chi tiết một đợt kiểm kê kèm danh sách các dòng kiểm kê (items)
 * Sử dụng 2 truy vấn phẳng độc lập + in-memory map để triệt tiêu lỗi quan hệ JOIN PostgREST và nuốt lỗi.
 */
export async function getInventoryAuditDetail(auditId: string): Promise<InventoryAudit | null> {
  if (!isSupabaseConfigured) {
    return mockStore.getInventoryAudit(auditId);
  }

  // 1. Tải thông tin đợt kiểm kê cha
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
    console.error('Lỗi khi tải thông tin đợt kiểm kê từ Supabase:', auditError);
    throw new Error('Không thể tải thông tin đợt kiểm kê: ' + auditError.message);
  }
  if (!audit) return null;

  // 2. Tải danh sách chi tiết các dòng kiểm kê (truy vấn phẳng không lồng sâu)
  const { data: rawItems, error: itemsError } = await withTimeout(
    supabase
      .from('inventory_audit_items')
      .select('*')
      .eq('audit_id', auditId)
      .order('created_at', { ascending: true }),
    DEFAULT_READ_TIMEOUT
  );

  if (itemsError) {
    console.error('Lỗi khi tải danh sách dòng kiểm kê từ Supabase:', itemsError);
    throw new Error('Không thể tải danh sách chi tiết kiểm kê: ' + itemsError.message);
  }

  const itemsList = rawItems || [];
  const assetIds = itemsList.map((i: any) => i.asset_id).filter(Boolean);

  // 3. Tải thông tin tài sản tương ứng nếu có
  let assetMap = new Map<string, any>();
  if (assetIds.length > 0) {
    // PostgREST hỗ trợ in. Để an toàn với danh sách lớn, chia chunk nếu > 500
    const chunkSize = 500;
    const assetPromises = [];
    for (let i = 0; i < assetIds.length; i += chunkSize) {
      const slice = assetIds.slice(i, i + chunkSize);
      assetPromises.push(
        withTimeout(
          supabase
            .from('assets')
            .select(`
              id,
              asset_code,
              certificate_no,
              legal_lot_code,
              land_lot_no,
              map_sheet_no,
              business_project_name,
              business_plot_code,
              current_owner_entity_id,
              current_owner_entity:investor_entities(id, name, company_code),
              area,
              custody_status,
              scan_file_url,
              projects:projects(name),
              warehouses:warehouses(name)
            `)
            .in('id', slice),
          DEFAULT_READ_TIMEOUT
        )
      );
    }

    const chunkResults = await Promise.all(assetPromises);
    for (const res of chunkResults) {
      if (res.error) {
        console.error('Lỗi khi tải thông tin tài sản chi tiết kiểm kê:', res.error);
        throw new Error('Không thể tải thông tin tài sản kiểm kê: ' + res.error.message);
      }
      if (res.data) {
        for (const ast of res.data) {
          if (ast.id) assetMap.set(ast.id, ast);
        }
      }
    }
  }

  // 4. Ghép nối in-memory
  const items = itemsList.map((item: any) => ({
    ...item,
    asset: assetMap.get(item.asset_id) || null,
  }));

  return {
    ...audit,
    warehouse: audit.warehouses,
    profiles: audit.performer,
    items,
  };
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
    // Thay thế bước 1-3 bằng RPC create_inventory_audit nguyên tử
    const { data: auditId, error } = await supabase.rpc('create_inventory_audit', {
      p_warehouse_id: warehouseId,
      p_notes: notes ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const detail = await getInventoryAuditDetail(auditId);
    if (!detail) {
      throw new Error('Không thể tải chi tiết đợt kiểm kê vừa tạo.');
    }

    // Ghi log activity
    try {
      await logActivity({
        actionType: 'Bắt đầu kiểm kê kho',
        warehouseId,
        description: `Bắt đầu đợt kiểm kê tại kho ${detail.warehouses?.name || warehouseId} với ${detail.total_expected} GCN dự kiến.`,
        notes,
        performedBy: profile.id,
      });
    } catch (e) {
      console.warn('Log activity error:', e);
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
    finding_status: InventoryAuditFindingStatus;
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
 * Thêm một GCN phát sinh thừa vào đợt kiểm kê hiện tại
 */
export async function addSurplusAuditItem(
  auditId: string,
  assetId: string,
  actualLocation?: string,
  note?: string
): Promise<InventoryAuditItem> {
  if (!isSupabaseConfigured) {
    return mockStore.addSurplusAuditItem(auditId, assetId, actualLocation, note);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('inventory_audit_items')
        .insert({
          audit_id: auditId,
          asset_id: assetId,
          expected_status: 'other_warehouse',
          expected_location: 'Ngoài danh sách kho',
          actual_found: true,
          actual_location: actualLocation || 'Tại kho đang kiểm',
          finding_status: 'surplus',
          note: note || 'Hồ sơ phát sinh thừa thực tế',
          audited_at: new Date().toISOString(),
        })
        .select('*')
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Lỗi khi thêm GCN thừa vào đợt kiểm kê:', error);
      throw new Error(`Không thể thêm GCN thừa: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    await recalculateAuditStats(auditId);
    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm addSurplusAuditItem:', err);
    throw new Error(err.message || 'Không thể thêm hồ sơ thừa vào đợt kiểm kê.');
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
    const total_found = items.filter(i => i.actual_found || i.finding_status === 'matched' || i.finding_status === 'misplaced' || i.finding_status === 'surplus').length;
    const total_missing = items.filter(i => i.finding_status === 'missing').length;
    const total_misplaced = items.filter(i => i.finding_status === 'misplaced').length;
    const total_surplus = items.filter(i => i.finding_status === 'surplus').length;

    const { error: updateErr } = await withTimeout(
      supabase
        .from('inventory_audits')
        .update({
          total_expected,
          total_found,
          total_missing,
          total_misplaced,
          total_surplus,
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
 * Hoàn tất đợt kiểm kê kho & đồng bộ dữ liệu vào bảng assets
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
        description: `Hoàn tất đợt kiểm kê kho ${completed?.warehouses?.name || auditId}. Tìm thấy ${completed?.total_found}/${completed?.total_expected} GCN (Khuyết thiếu: ${completed?.total_missing}, Sai vị trí: ${completed?.total_misplaced}, Thừa: ${completed?.total_surplus || 0}).`,
        notes,
        performedBy: profile.id,
      });
    } catch (e) {
      console.warn('Log activity error:', e);
    }
    return completed;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('complete_inventory_audit', { p_audit_id: auditId, p_notes: notes || null }),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error(error.message || 'Không thể hoàn tất đợt kiểm kê.');
    }

    if (data && (data.assets_missing_skipped > 0 || data.total_pending > 0)) {
      console.info(
        `Hoàn tất kiểm kê với lưu ý: ${data.assets_missing_skipped || 0} GCN khuyết thiếu bị bỏ qua (đã xuất trong lúc kiểm kê), ${data.total_pending || 0} GCN chưa kiểm.`
      );
    }

    return await getInventoryAuditDetail(auditId);
  } catch (err: any) {
    console.error('Lỗi trong hàm completeInventoryAudit:', err);
    throw err instanceof Error ? err : new Error(err.message || 'Không thể hoàn tất đợt kiểm kê, vui lòng thử lại.');
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
    // Bước 1: Xóa toàn bộ các bản ghi con trong inventory_audit_items trước
    const { error: itemsDelError } = await withTimeout(
      supabase
        .from('inventory_audit_items')
        .delete()
        .eq('audit_id', auditId),
      DEFAULT_WRITE_TIMEOUT
    );

    if (itemsDelError) {
      console.error('Lỗi khi xóa các dòng chi tiết kiểm kê trên Supabase:', itemsDelError);
      throw new Error(`Không thể xóa chi tiết đợt kiểm kê: ${itemsDelError.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    // Bước 2: Xóa bản ghi cha trong inventory_audits
    const { error: auditDelError } = await withTimeout(
      supabase
        .from('inventory_audits')
        .delete()
        .eq('id', auditId),
      DEFAULT_WRITE_TIMEOUT
    );

    if (auditDelError) {
      console.error('Lỗi khi xóa đợt kiểm kê trên Supabase:', auditDelError);
      throw new Error(`Không thể xóa đợt kiểm kê: ${auditDelError.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    return true;
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteInventoryAudit:', err);
    throw new Error(err.message || 'Không thể xóa đợt kiểm kê, vui lòng thử lại.');
  }
}