import { supabase } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { TransactionType } from '../types';
import { updateAsset } from './assets';
import { logActivity } from './activityLogs';

export async function fetchTransactions(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        created_by:profiles!transactions_created_by_fkey(full_name, email),
        items:transaction_items(
          *,
          asset:assets(*, projects(name)),
          decided_by:profiles!transaction_items_decided_by_fkey(full_name, email)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchTransactions error, using mockStore:', err);
    return mockStore.getTransactions();
  }
}

export async function createTransaction(
  param1: any,
  type?: TransactionType,
  details?: any,
  assetIds?: string[]
) {
  let createdBy: string | undefined;
  let txType: TransactionType;
  let txNotes: string | undefined;
  let items: Array<{ asset_id: string; type: TransactionType; details?: any }>;

  if (typeof param1 === 'string' && type) {
    createdBy = param1;
    txType = type;
    txNotes = details?.notes || details?.reason || '';
    items = (assetIds || []).map(id => ({
      asset_id: id,
      type: txType,
      details,
    }));
  } else {
    createdBy = param1.created_by;
    txType = param1.type;
    txNotes = param1.notes;
    items = param1.items || [];
  }

  try {
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert([{ type: txType, notes: txNotes, created_by: createdBy }])
      .select()
      .single();

    if (txErr) throw txErr;

    const itemsToInsert = items.map(it => ({
      transaction_id: tx.id,
      asset_id: it.asset_id,
      type: it.type,
      details: it.details,
      status: 'pending',
    }));

    const { data: insertedItems, error: itErr } = await supabase
      .from('transaction_items')
      .insert(itemsToInsert)
      .select();

    if (itErr) throw itErr;

    return { ...tx, items: insertedItems };
  } catch (err) {
    console.warn('Supabase createTransaction error, saving to mockStore:', err);
    const current = mockStore.getTransactions();
    const newTxId = 'tx-' + Date.now();
    const assets = mockStore.getAssets();

    const newTx = {
      id: newTxId,
      type: txType,
      notes: txNotes || '',
      created_at: new Date().toISOString(),
      created_by: { full_name: 'Người dùng hiện tại', email: 'user@btcvmt.vn' },
      items: items.map((it, idx) => ({
        id: 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        status: 'pending',
        details: it.details || {},
        asset: assets.find(a => a.id === it.asset_id),
      })),
    };

    mockStore.saveTransactions([newTx, ...current]);

    for (const it of items) {
      await logActivity({
        assetId: it.asset_id,
        actionType: `Gửi YC ${txType}`,
        description: `Tạo phiếu yêu cầu biến động (${txType})`,
      });
    }

    return newTx;
  }
}

export async function decideTransactionItem(
  itemId: string,
  decision: 'approved' | 'rejected',
  notes?: string,
  performerId?: string
) {
  let targetItem: any = null;

  try {
    const { data, error } = await supabase
      .from('transaction_items')
      .select('*, asset:assets(*)')
      .eq('id', itemId)
      .single();

    if (!error && data) targetItem = data;
  } catch {
    // fallback
  }

  if (!targetItem) {
    const txs = mockStore.getTransactions();
    for (const tx of txs) {
      const found = (tx.items || []).find((i: any) => i.id === itemId);
      if (found) {
        targetItem = found;
        break;
      }
    }
  }

  if (!targetItem) throw new Error('Không tìm thấy mục cần duyệt');

  const assetId = targetItem.asset_id;
  const itemType = targetItem.type;
  const details = targetItem.details || {};

  if (decision === 'approved') {
    const assetUpdates: Record<string, any> = {};

    if (itemType === 'checkout') {
      assetUpdates.custody_status = 'checked_out';
      if (details.department) assetUpdates.current_holder_dept = details.department;
    } else if (itemType === 'checkin') {
      assetUpdates.custody_status = 'in_stock';
      assetUpdates.current_holder_dept = null;
    } else if (itemType === 'mortgage') {
      assetUpdates.mortgage_status = 'mortgaged';
    } else if (itemType === 'sale_update') {
      if (details.saleStatus) assetUpdates.sale_status = details.saleStatus;
    }

    if (Object.keys(assetUpdates).length > 0) {
      await updateAsset(assetId, assetUpdates);
    }
  }

  try {
    const { data, error } = await supabase
      .from('transaction_items')
      .update({
        status: decision,
        decision_notes: notes || null,
        decided_by: performerId || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select()
      .single();

    if (!error && data) {
      await logActivity({
        assetId,
        actionType: decision === 'approved' ? 'Phê duyệt YC' : 'Từ chối YC',
        description: `Kết quả phê duyệt: ${decision === 'approved' ? 'Chấp thuận' : 'Từ chối'}. Ghi chú: ${notes || 'Không'}`,
      });
      return data;
    }
  } catch (err) {
    console.warn('Supabase decideTransactionItem error, updating mockStore:', err);
  }

  const txs = mockStore.getTransactions();
  const updatedTxs = txs.map(tx => ({
    ...tx,
    items: (tx.items || []).map((i: any) => {
      if (i.id === itemId) {
        return {
          ...i,
          status: decision,
          decision_notes: notes || undefined,
          decided_at: new Date().toISOString(),
        };
      }
      return i;
    }),
  }));
  mockStore.saveTransactions(updatedTxs);

  await logActivity({
    assetId,
    actionType: decision === 'approved' ? 'Phê duyệt YC' : 'Từ chối YC',
    description: `Kết quả phê duyệt: ${decision === 'approved' ? 'Chấp thuận' : 'Từ chối'}. Ghi chú: ${notes || 'Không'}`,
  });

  return targetItem;
}

export const fetchRequests = fetchTransactions;
export const createRequest = createTransaction;
export const approveRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'approved', notes, performerId);
export const rejectRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'rejected', notes, performerId);
