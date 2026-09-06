import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { InvestorEntity, AssetOwnershipTransfer } from '../types';

export async function fetchInvestorEntities(): Promise<InvestorEntity[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getInvestorEntities();
  }

  const { data, error } = await withTimeout(
    supabase
      .from('investor_entities')
      .select('*')
      .order('name', { ascending: true }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Không thể tải danh mục pháp nhân CĐT/NĐT: ' + error.message);
  }

  return data || [];
}

export async function createInvestorEntity(payload: {
  name: string;
  company_code?: string | null;
  note?: string | null;
}): Promise<InvestorEntity> {
  const cleanCode = payload.company_code?.trim().toUpperCase() || null;
  const newEntity: InvestorEntity = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'inv-' + Date.now(),
    name: payload.name.trim(),
    company_code: cleanCode,
    note: payload.note?.trim() || null,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    const current = mockStore.getInvestorEntities();
    if (cleanCode && current.some(e => e.company_code?.toUpperCase() === cleanCode)) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
    const updated = [newEntity, ...current];
    mockStore.saveInvestorEntities(updated);
    return newEntity;
  }

  // Check unique company_code trong Supabase
  if (cleanCode) {
    const { data: existing } = await supabase
      .from('investor_entities')
      .select('id')
      .eq('company_code', cleanCode)
      .maybeSingle();

    if (existing) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
  }

  const { data, error } = await withTimeout(
    supabase
      .from('investor_entities')
      .insert([{
        name: payload.name.trim(),
        company_code: cleanCode,
        note: payload.note?.trim() || null,
      }])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (error.code === '23505' || error.message.includes('unique')) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
    throw error;
  }

  return data;
}

export async function updateInvestorEntity(
  id: string,
  payload: {
    name: string;
    company_code?: string | null;
    note?: string | null;
  }
): Promise<InvestorEntity> {
  const cleanCode = payload.company_code?.trim().toUpperCase() || null;

  if (!isSupabaseConfigured) {
    const current = mockStore.getInvestorEntities();
    if (cleanCode && current.some(e => e.id !== id && e.company_code?.toUpperCase() === cleanCode)) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
    const updated = current.map(e => e.id === id ? {
      ...e,
      name: payload.name.trim(),
      company_code: cleanCode,
      note: payload.note?.trim() || null,
    } : e);
    mockStore.saveInvestorEntities(updated);
    const found = updated.find(e => e.id === id);
    if (!found) throw new Error('Không tìm thấy pháp nhân');
    return found;
  }

  if (cleanCode) {
    const { data: existing } = await supabase
      .from('investor_entities')
      .select('id')
      .eq('company_code', cleanCode)
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
  }

  const { data, error } = await withTimeout(
    supabase
      .from('investor_entities')
      .update({
        name: payload.name.trim(),
        company_code: cleanCode,
        note: payload.note?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (error.code === '23505' || error.message.includes('unique')) {
      throw new Error(`Mã pháp nhân "${cleanCode}" đã tồn tại trong hệ thống.`);
    }
    throw error;
  }

  return data;
}

export async function deleteInvestorEntity(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getInvestorEntities();
    mockStore.saveInvestorEntities(current.filter(e => e.id !== id));
    return;
  }

  const { error } = await withTimeout(
    supabase
      .from('investor_entities')
      .delete()
      .eq('id', id),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;
}

/**
 * Lấy lịch sử chuyển nhượng sở hữu (CĐT / NĐT)
 * Sắp xếp theo transferred_at giảm dần
 */
export async function fetchAssetOwnershipTransfers(assetId?: string): Promise<AssetOwnershipTransfer[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAssetOwnershipTransfers(assetId);
  }

  let query = supabase
    .from('asset_ownership_transfers')
    .select(`
      *,
      from_entity:from_entity_id(*),
      to_entity:to_entity_id(*),
      performer:transferred_by(id, full_name, email)
    `)
    .order('transferred_at', { ascending: false });

  if (assetId) {
    query = query.eq('asset_id', assetId);
  }

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) {
    throw new Error('Lỗi fetch asset_ownership_transfers: ' + error.message);
  }

  return (data || []) as AssetOwnershipTransfer[];
}

/**
 * Thực hiện chuyển nhượng sở hữu 1 GCN / Tài sản:
 * 1. Cập nhật assets.current_owner_entity_id + current_owner_role
 * 2. Thêm 1 bản ghi vào asset_ownership_transfers ghi lại from_entity_id, from_role, to_entity_id, to_role, transferred_by, transferred_at, note
 */
export async function transferAssetOwnership(payload: {
  asset_id: string;
  to_entity_id: string;
  to_role: 'cdt' | 'ndt';
  note?: string | null;
  transferred_by?: string | null;
}): Promise<AssetOwnershipTransfer> {
  const transferredAt = new Date().toISOString();

  // 1. Nếu dùng mockStore
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const targetAsset = assets.find(a => a.id === payload.asset_id);
    const fromEntityId = targetAsset?.current_owner_entity_id || null;
    const fromRole = targetAsset?.current_owner_role || null;

    const record = mockStore.addAssetOwnershipTransfer({
      asset_id: payload.asset_id,
      from_entity_id: fromEntityId,
      from_role: fromRole,
      to_entity_id: payload.to_entity_id,
      to_role: payload.to_role,
      transferred_by: payload.transferred_by || null,
      transferred_at: transferredAt,
      note: payload.note?.trim() || null,
    });

    return record;
  }

  // 2. Supabase
  const { data: transferData, error: rpcErr } = await withTimeout(
    supabase.rpc('transfer_asset_ownership', {
      p_asset_id: payload.asset_id,
      p_to_entity_id: payload.to_entity_id,
      p_to_role: payload.to_role,
      p_note: payload.note?.trim() || null,
      p_transferred_by: payload.transferred_by || null,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (rpcErr) {
    console.error('Lỗi chuyển nhượng (RPC):', rpcErr);
    throw new Error('Lỗi tạo phiếu chuyển nhượng: ' + (rpcErr.message || 'Lỗi không xác định'));
  }

  return transferData as AssetOwnershipTransfer;
}

/**
 * Chuyển nhượng quyền sở hữu HÀNG LOẠT cho nhiều GCN sang 1 pháp nhân mới
 */
export async function batchTransferAssetOwnership(payload: {
  asset_ids: string[];
  to_entity_id: string;
  to_role: 'cdt' | 'ndt';
  note?: string | null;
  transferred_by?: string | null;
}): Promise<{ count: number }> {
  if (!payload.asset_ids || payload.asset_ids.length === 0) {
    return { count: 0 };
  }

  let successCount = 0;
  for (const assetId of payload.asset_ids) {
    try {
      await transferAssetOwnership({
        asset_id: assetId,
        to_entity_id: payload.to_entity_id,
        to_role: payload.to_role,
        note: payload.note,
        transferred_by: payload.transferred_by,
      });
      successCount++;
    } catch (err) {
      console.error(`Lỗi chuyển nhượng asset ${assetId}:`, err);
    }
  }

  return { count: successCount };
}

