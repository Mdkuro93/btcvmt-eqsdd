import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { TransactionType, Asset } from '../types';
import { updateAsset, createAsset, fetchWarehouses } from './assets';
import { logActivity } from './activityLogs';
import { generateNextVoucherCode } from '../lib/voucherEngine';

export async function fetchTransactions(): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getTransactions();
  }
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
    txNotes = details?.notes || details?.reason || details?.splitNotes || '';
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
  performerId?: string,
  finalDetails?: any
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
  const details = finalDetails || targetItem.details || {};

  const allAssets = mockStore.getAssets();
  const currentAsset = allAssets.find((a: any) => a.id === assetId) || targetItem.asset;
  const warehouses = mockStore.getWarehouses();
  const currentWarehouse = warehouses.find((w: any) => w.id === (details.targetWarehouseId || currentAsset?.warehouse_id)) || warehouses[0];

  let generatedVoucher = '';

  if (decision === 'approved') {
    const { voucherCode } = generateNextVoucherCode(currentWarehouse, itemType);
    generatedVoucher = voucherCode;
  }

  if (isSupabaseConfigured) {
    // Call secure RPC
    const { error } = await supabase.rpc('decide_transaction_item', {
      p_item_id: itemId,
      p_status: decision,
      p_notes: notes || null,
      p_details: details,
      p_voucher_code: generatedVoucher || null
    });
    
    if (error) {
      console.error('RPC decide_transaction_item failed:', error);
      throw error;
    }
  } else {
    // Local mock store logic
    if (decision === 'approved') {
      const assetUpdates: Record<string, any> = {};

      if (itemType === 'checkout') {
        assetUpdates.custody_status = 'checked_out';
        if (details.department) assetUpdates.current_holder_dept = details.department;
        if (details.returnDate) assetUpdates.expected_return_date = details.returnDate;
        if (details.reason) assetUpdates.borrow_purpose = details.reason;
        if (details.targetWarehouseId) assetUpdates.warehouse_id = details.targetWarehouseId;
        await updateAsset(assetId, assetUpdates);
      } else if (itemType === 'checkin') {
        assetUpdates.custody_status = 'in_stock';
        assetUpdates.current_holder_dept = null;
        assetUpdates.expected_return_date = null;
        assetUpdates.borrow_purpose = null;
        await updateAsset(assetId, assetUpdates);
      } else if (itemType === 'mortgage') {
        assetUpdates.mortgage_status = 'mortgaged';
        if (details.bank) assetUpdates.mortgage_bank = details.bank;
        if (details.borrower) assetUpdates.mortgage_unit = details.borrower;
        if (details.valuation) assetUpdates.mortgage_valuation = Number(details.valuation);
        if (details.releaseDate) assetUpdates.mortgage_expected_release_date = details.releaseDate;
        await updateAsset(assetId, assetUpdates);
      } else if (itemType === 'sale_update') {
        if (details.saleStatus) assetUpdates.sale_status = details.saleStatus;
        await updateAsset(assetId, assetUpdates);
      } else if (itemType === 'split') {
        const splitType = details.splitType || 'full';
        
        if (splitType === 'reissue') {
          // CẤP ĐỔI / CẤP LẠI SỔ
          assetUpdates.lifecycle_status = 'invalidated';
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã cấp đổi sang GCN mới: ${details.newCertificateNo || ''} (Lý do: ${details.reissueReason || ''})`;
          await updateAsset(assetId, assetUpdates);

          if (details.newCertificateNo) {
            const reissuedAssetData = {
              certificate_no: details.newCertificateNo,
              registry_no: details.newRegistryNo || currentAsset?.registry_no || null,
              project_id: currentAsset?.project_id || null,
              subdivision: currentAsset?.subdivision || null,
              lot_no: currentAsset?.lot_no || null,
              area: currentAsset?.area || null,
              owner_name: currentAsset?.owner_name || null,
              warehouse_id: currentAsset?.warehouse_id || null,
              parent_asset_id: assetId,
              custody_status: 'in_stock' as any,
              lifecycle_status: 'active' as any,
              sale_status: currentAsset?.sale_status || 'not_ready',
              mortgage_status: currentAsset?.mortgage_status || 'none',
              map_sheet_no: currentAsset?.map_sheet_no || null,
              land_lot_no: currentAsset?.land_lot_no || null,
              province: currentAsset?.province || null,
              district: currentAsset?.district || null,
              ward: currentAsset?.ward || null,
              address_detail: currentAsset?.address_detail || null,
              usage_purpose: currentAsset?.usage_purpose || null,
              asset_type: currentAsset?.asset_type || null,
              managing_unit: currentAsset?.managing_unit || null,
              notes: `Cấp đổi từ GCN gốc: ${currentAsset?.certificate_no || ''}`,
            };
            await createAsset(reissuedAssetData);
          }
        } else if (splitType === 'partial') {
          // TÁCH MỘT PHẦN: SỔ MẸ VẪN CÒN HIỆU LỰC (ACTIVE), GIẢM DIỆN TÍCH
          const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
          const remainingArea = Math.max(0, (currentAsset?.area || 0) - totalSplitArea);

          assetUpdates.lifecycle_status = 'active';
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.area = remainingArea;
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã trích tách một phần (${totalSplitArea.toLocaleString('vi-VN')} m² theo QĐ ${details.decisionNo || ''}). Diện tích còn lại: ${remainingArea.toLocaleString('vi-VN')} m²`;
          await updateAsset(assetId, assetUpdates);

          if (Array.isArray(details.splitChildren)) {
            for (const child of details.splitChildren) {
              if (!child.certificate_no) continue;
              const childAssetData = {
                certificate_no: child.certificate_no,
                project_id: currentAsset?.project_id || null,
                subdivision: child.subdivision || currentAsset?.subdivision || null,
                lot_no: child.land_lot_no || currentAsset?.lot_no || null,
                area: child.area ? Number(child.area) : null,
                owner_name: currentAsset?.owner_name || null,
                warehouse_id: currentAsset?.warehouse_id || null,
                parent_asset_id: assetId,
                custody_status: 'in_stock' as any,
                lifecycle_status: 'active' as any,
                sale_status: 'not_ready' as any,
                mortgage_status: 'none' as any,
                map_sheet_no: currentAsset?.map_sheet_no || null,
                land_lot_no: child.land_lot_no || currentAsset?.land_lot_no || null,
                province: currentAsset?.province || null,
                district: currentAsset?.district || null,
                ward: currentAsset?.ward || null,
                address_detail: currentAsset?.address_detail || null,
                usage_purpose: currentAsset?.usage_purpose || null,
                asset_type: currentAsset?.asset_type || null,
                managing_unit: currentAsset?.managing_unit || null,
                notes: `Tách từ GCN gốc: ${currentAsset?.certificate_no || ''} theo QĐ ${details.decisionNo || ''}`,
              };
              await createAsset(childAssetData);
            }
          }
        } else {
          // TÁCH TOÀN BỘ: SỔ CŨ HẾT HIỆU LỰC (INVALIDATED)
          assetUpdates.lifecycle_status = 'invalidated';
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã tách toàn bộ thành ${(details.splitChildren || []).length} sổ con theo QĐ ${details.decisionNo || ''}`;
          await updateAsset(assetId, assetUpdates);

          if (Array.isArray(details.splitChildren)) {
            for (const child of details.splitChildren) {
              if (!child.certificate_no) continue;
              const childAssetData = {
                certificate_no: child.certificate_no,
                project_id: currentAsset?.project_id || null,
                subdivision: child.subdivision || currentAsset?.subdivision || null,
                lot_no: child.land_lot_no || currentAsset?.lot_no || null,
                area: child.area ? Number(child.area) : null,
                owner_name: currentAsset?.owner_name || null,
                warehouse_id: currentAsset?.warehouse_id || null,
                parent_asset_id: assetId,
                custody_status: 'in_stock' as any,
                lifecycle_status: 'active' as any,
                sale_status: 'not_ready' as any,
                mortgage_status: 'none' as any,
                map_sheet_no: currentAsset?.map_sheet_no || null,
                land_lot_no: child.land_lot_no || currentAsset?.land_lot_no || null,
                province: currentAsset?.province || null,
                district: currentAsset?.district || null,
                ward: currentAsset?.ward || null,
                address_detail: currentAsset?.address_detail || null,
                usage_purpose: currentAsset?.usage_purpose || null,
                asset_type: currentAsset?.asset_type || null,
                managing_unit: currentAsset?.managing_unit || null,
                notes: `Tách từ GCN gốc: ${currentAsset?.certificate_no || ''} theo QĐ ${details.decisionNo || ''}`,
              };
              await createAsset(childAssetData);
            }
          }
        }
      }
    }

    const txs = mockStore.getTransactions();
    const updatedTxs = txs.map(tx => ({
      ...tx,
      items: (tx.items || []).map((i: any) => {
        if (i.id === itemId) {
          return {
            ...i,
            status: decision,
            details: details,
            voucher_code: generatedVoucher || undefined,
            decision_notes: notes || undefined,
            decided_at: new Date().toISOString(),
          };
        }
        return i;
      }),
    }));
    mockStore.saveTransactions(updatedTxs);
  }

  // Activity Logging (happens for both Supabase and Mock modes because logActivity handles both internally)
  if (decision === 'approved') {
    if (itemType === 'checkout') {
      await logActivity({
        assetId, actionType: 'Mượn/Xuất sổ', documentNo: generatedVoucher,
        description: `Xuất sổ cho ${details.department || 'Ban/Bộ phận'}. Lý do: ${details.reason || 'Mượn xử lý công việc'}`,
        usedBy: details.department || 'Bộ phận sử dụng', warehouseId: currentWarehouse?.id, notes: notes || undefined, performedBy: performerId,
      });
    } else if (itemType === 'checkin') {
      await logActivity({
        assetId, actionType: 'Nhập sổ', documentNo: generatedVoucher,
        description: `Nhập lưu kho GCN QSDĐ về kho ${currentWarehouse?.name || 'Trung tâm'}`,
        usedBy: 'BTC VMT', warehouseId: currentWarehouse?.id, notes: notes || undefined, performedBy: performerId,
      });
    } else if (itemType === 'mortgage') {
      await logActivity({
        assetId, actionType: 'Thế chấp', documentNo: generatedVoucher,
        description: `Thế chấp tại ${details.bank || 'Ngân hàng'}. Đơn vị: ${details.borrower || '-'}. Định giá: ${details.valuation ? Number(details.valuation).toLocaleString('vi-VN') + ' VNĐ' : '-'}`,
        usedBy: details.bank || 'Ngân hàng nhận thế chấp', warehouseId: currentWarehouse?.id, notes: notes || undefined, performedBy: performerId,
      });
    } else if (itemType === 'sale_update') {
      await logActivity({
        assetId, actionType: 'Xuất bán', documentNo: generatedVoucher,
        description: `Chuyển trạng thái kinh doanh sang: ${details.saleStatus === 'sold' ? 'Đã bán' : 'Sẵn sàng bán'}. Giá: ${details.salePrice ? Number(details.salePrice).toLocaleString('vi-VN') + ' VNĐ' : 'Chưa nhập'}`,
        usedBy: 'Khách hàng / Ban KD', warehouseId: currentWarehouse?.id, notes: notes || undefined, performedBy: performerId,
      });
    } else if (itemType === 'split') {
      const splitType = details.splitType || 'full';
      if (splitType === 'reissue') {
        await logActivity({
          assetId, actionType: 'Cấp đổi GCN (Thu hồi sổ cũ)', documentNo: generatedVoucher,
          description: `Thu hồi GCN cũ ${currentAsset?.certificate_no || ''} để cấp đổi sang GCN mới ${details.newCertificateNo || ''}. Lý do: ${details.reissueReason || 'Cấp đổi theo quy định'}`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ', warehouseId: currentWarehouse?.id, notes: notes || undefined, performedBy: performerId,
        });
      } else if (splitType === 'partial') {
        const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
        await logActivity({
          assetId, actionType: 'Tách sổ (Trích 1 phần)', documentNo: generatedVoucher,
          description: `Trích tách ${details.splitChildren?.length || 0} sổ con (${totalSplitArea.toLocaleString('vi-VN')} m²) theo QĐ ${details.decisionNo || ''}. Diện tích còn lại của sổ gốc: ${(details.remainingArea || 0).toLocaleString('vi-VN')} m²`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ', warehouseId: currentWarehouse?.id, notes: details.splitNotes || notes || undefined, performedBy: performerId,
        });
      } else {
        await logActivity({
          assetId, actionType: 'Tách sổ (Toàn bộ)', documentNo: generatedVoucher,
          description: `Tách toàn bộ sổ gốc ${currentAsset?.certificate_no || ''} thành ${details.splitChildren?.length || 0} sổ con theo QĐ ${details.decisionNo || ''} (Sổ gốc hết hiệu lực)`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ', warehouseId: currentWarehouse?.id, notes: details.splitNotes || notes || undefined, performedBy: performerId,
        });
      }
    }
  } else {
    await logActivity({
      assetId, actionType: 'Từ chối YC',
      description: `Yêu cầu (${itemType}) bị từ chối. Lý do/Ghi chú: ${notes || 'Không'}`,
      performedBy: performerId,
    });
  }

  return targetItem;
}

export const fetchRequests = fetchTransactions;
export const createRequest = createTransaction;
export const approveRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'approved', notes, performerId);
export const rejectRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'rejected', notes, performerId);
