import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { TransactionType, Asset } from '../types';
import { updateAsset, createAsset, fetchWarehouses } from './assets';
import { logActivity } from './activityLogs';
import { generateNextVoucherCode } from '../lib/voucherEngine';
import { createNotification } from './notifications';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';

export async function fetchTransactions(): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getTransactions();
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('transactions')
        .select(`
          *,
          created_by:profiles!transactions_created_by_fkey(full_name, email),
          items:transaction_items(
            *,
            asset:assets(*, projects(name)),
            confirmed_asset:assets!transaction_items_confirmed_asset_id_fkey(*, projects(name)),
            decided_by:profiles!transaction_items_decided_by_fkey(full_name, email)
          )
        `)
        .order('created_at', { ascending: false }),
      3000
    );

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchTransactions error or timeout, using mockStore:', err);
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

  if (isSupabaseConfigured) {
    try {
      const { data: tx, error: txErr } = await withTimeout(
        supabase
          .from('transactions')
          .insert([{ type: txType, notes: txNotes, created_by: createdBy }])
          .select()
          .single(),
        3000
      );

      if (txErr) throw txErr;

      const itemsToInsert = items.map(it => ({
        transaction_id: tx.id,
        asset_id: it.asset_id,
        type: it.type,
        details: it.details,
        status: 'pending',
      }));

      const { data: insertedItems, error: itErr } = await withTimeout(
        supabase
          .from('transaction_items')
          .insert(itemsToInsert)
          .select(),
        3000
      );

      if (itErr) throw itErr;

      return { ...tx, items: insertedItems };
    } catch (err) {
      console.warn('Supabase createTransaction error or timeout, saving to mockStore:', err);
    }
  }

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

export async function decideTransactionItem(
  itemId: string,
  decision: 'approved' | 'rejected',
  notes?: string,
  performerId?: string,
  finalDetails?: any,
  confirmedAssetId?: string
) {
  let targetItem: any = null;
  let transactionParent: any = null;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('transaction_items')
          .select('*, transaction:transactions(*), asset:assets(*)')
          .eq('id', itemId)
          .single(),
        3000
      );

      if (!error && data) {
        targetItem = data;
        transactionParent = data.transaction;
      }
    } catch (e) {
      console.warn('Supabase fetch transaction_item failed or timed out:', e);
    }
  }

  if (!targetItem) {
    const txs = mockStore.getTransactions();
    for (const tx of txs) {
      const found = (tx.items || []).find((i: any) => i.id === itemId);
      if (found) {
        targetItem = found;
        transactionParent = tx;
        break;
      }
    }
  }

  if (!targetItem) throw new Error('Không tìm thấy mục cần duyệt');

  const effectiveAssetId = confirmedAssetId || targetItem.confirmed_asset_id || targetItem.asset_id;
  const itemType = targetItem.type;
  const details = finalDetails || targetItem.details || {};
  const hasChanges = (confirmedAssetId && confirmedAssetId !== targetItem.asset_id) || (notes && notes.trim().length > 0);

  const allAssets = mockStore.getAssets();
  const currentAsset = allAssets.find((a: any) => a.id === effectiveAssetId) || targetItem.asset;
  const warehouses = mockStore.getWarehouses();

  // Unified responsible warehouse determination (Strict rule: NO fallback to warehouses[0])
  const responsibleWarehouseId = getResponsibleWarehouseId(
    { ...targetItem, asset: currentAsset, details },
    itemType
  );
  const responsibleWarehouse = responsibleWarehouseId
    ? warehouses.find((w: any) => w.id === responsibleWarehouseId)
    : undefined;

  let generatedVoucher = '';

  if (decision === 'approved') {
    const { voucherCode } = generateNextVoucherCode(responsibleWarehouse, itemType);
    generatedVoucher = voucherCode;
  }

  // Inter-warehouse transfer check
  const sourceWarehouseId = currentAsset?.warehouse_id;
  const targetWarehouseId = details.targetWarehouseId;
  const isInterWarehouseTransfer = Boolean(
    sourceWarehouseId &&
    targetWarehouseId &&
    sourceWarehouseId !== targetWarehouseId
  );

  if (isSupabaseConfigured) {
    try {
      // Call secure RPC with timeout
      const { error } = await withTimeout(
        supabase.rpc('decide_transaction_item', {
          p_item_id: itemId,
          p_status: decision,
          p_notes: notes || null,
          p_details: details,
          p_voucher_code: generatedVoucher || null,
          p_confirmed_asset_id: confirmedAssetId || null,
        }),
        3000
      );
      
      if (error) throw error;
    } catch (rpcErr) {
      console.warn('RPC decide_transaction_item failed or timed out, executing local mock logic:', rpcErr);
      // Fall through to mock store updates
      await runLocalDecideLogic();
    }
  } else {
    await runLocalDecideLogic();
  }

  async function runLocalDecideLogic() {
    if (decision === 'approved') {
      const assetUpdates: Record<string, any> = {};

      if (itemType === 'checkout') {
        if (isInterWarehouseTransfer && currentAsset?.custody_status !== 'in_transit') {
          // Step 1 of Inter-warehouse transfer: Mark in_transit, keep at source warehouse
          assetUpdates.custody_status = 'in_transit';
          assetUpdates.current_holder_dept = details.department || 'Đang luân chuyển kho';
          if (details.returnDate) assetUpdates.expected_return_date = details.returnDate;
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          // Do NOT change warehouse_id until destination warehouse approves Step 2
          await updateAsset(effectiveAssetId, assetUpdates);

          // Automatically generate Step 2 checkin transaction for destination warehouse
          await createTransferReceiptStep({
            assetId: effectiveAssetId,
            sourceWarehouseId: sourceWarehouseId!,
            targetWarehouseId: targetWarehouseId!,
            voucherCode: generatedVoucher,
            details,
            transactionParent,
            performerId,
          });
        } else {
          assetUpdates.custody_status = 'checked_out';
          if (details.department) assetUpdates.current_holder_dept = details.department;
          if (details.returnDate) assetUpdates.expected_return_date = details.returnDate;
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          if (details.targetWarehouseId) assetUpdates.warehouse_id = details.targetWarehouseId;
          await updateAsset(effectiveAssetId, assetUpdates);
        }
      } else if (itemType === 'checkin') {
        if (currentAsset?.custody_status === 'in_transit' || details.isTransferReceipt) {
          // Step 2 of Inter-warehouse transfer: Destination warehouse confirms receipt
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.warehouse_id = targetWarehouseId || currentAsset.warehouse_id;
          assetUpdates.current_holder_dept = null;
          assetUpdates.expected_return_date = null;
          assetUpdates.borrow_purpose = null;
          await updateAsset(effectiveAssetId, assetUpdates);
        } else if (isInterWarehouseTransfer && currentAsset?.custody_status !== 'in_transit') {
          // Initiated checkin transfer: Step 1 sets in_transit
          assetUpdates.custody_status = 'in_transit';
          await updateAsset(effectiveAssetId, assetUpdates);

          await createTransferReceiptStep({
            assetId: effectiveAssetId,
            sourceWarehouseId: sourceWarehouseId!,
            targetWarehouseId: targetWarehouseId!,
            voucherCode: generatedVoucher,
            details,
            transactionParent,
            performerId,
          });
        } else {
          // Normal single-step checkin
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.current_holder_dept = null;
          assetUpdates.expected_return_date = null;
          assetUpdates.borrow_purpose = null;
          if (details.targetWarehouseId) assetUpdates.warehouse_id = details.targetWarehouseId;
          await updateAsset(effectiveAssetId, assetUpdates);
        }
      } else if (itemType === 'mortgage') {
        assetUpdates.mortgage_status = 'mortgaged';
        if (details.bank) assetUpdates.mortgage_bank = details.bank;
        if (details.borrower) assetUpdates.mortgage_unit = details.borrower;
        if (details.valuation) assetUpdates.mortgage_valuation = Number(details.valuation);
        if (details.releaseDate) assetUpdates.mortgage_expected_release_date = details.releaseDate;
        await updateAsset(effectiveAssetId, assetUpdates);
      } else if (itemType === 'sale_update') {
        if (details.saleStatus) assetUpdates.sale_status = details.saleStatus;
        await updateAsset(effectiveAssetId, assetUpdates);
      } else if (itemType === 'split') {
        const splitType = details.splitType || 'full';
        
        if (splitType === 'reissue') {
          assetUpdates.lifecycle_status = 'invalidated';
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã cấp đổi sang GCN mới: ${details.newCertificateNo || ''} (Lý do: ${details.reissueReason || ''})`;
          await updateAsset(effectiveAssetId, assetUpdates);

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
              parent_asset_id: effectiveAssetId,
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
          const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
          const remainingArea = Math.max(0, (currentAsset?.area || 0) - totalSplitArea);

          assetUpdates.lifecycle_status = 'active';
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.area = remainingArea;
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã trích tách một phần (${totalSplitArea.toLocaleString('vi-VN')} m² theo QĐ ${details.decisionNo || ''}). Diện tích còn lại: ${remainingArea.toLocaleString('vi-VN')} m²`;
          await updateAsset(effectiveAssetId, assetUpdates);

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
                parent_asset_id: effectiveAssetId,
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
          assetUpdates.lifecycle_status = 'invalidated';
          assetUpdates.custody_status = 'in_stock';
          assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã tách toàn bộ thành ${(details.splitChildren || []).length} sổ con theo QĐ ${details.decisionNo || ''}`;
          await updateAsset(effectiveAssetId, assetUpdates);

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
                parent_asset_id: effectiveAssetId,
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
            confirmed_asset_id: confirmedAssetId || i.confirmed_asset_id,
            confirmed_asset: confirmedAssetId ? allAssets.find(a => a.id === confirmedAssetId) : i.confirmed_asset,
            requested_details: i.requested_details || i.details,
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

  // Send Notification to requester
  const requesterId = transactionParent?.created_by?.id || transactionParent?.created_by || '00000000-0000-0000-0000-000000000002';
  try {
    if (decision === 'approved') {
      if (hasChanges) {
        await createNotification({
          user_id: requesterId,
          type: 'request_approved_with_changes',
          title: `Phiếu yêu cầu #${(targetItem.transaction_id || targetItem.id)?.slice(0, 8)} đã được duyệt với điều chỉnh`,
          body: `Thủ kho đã duyệt phiếu với điều chỉnh thực tế: "${notes || 'Thay đổi GCN hoặc thông số bàn giao'}". Mã chứng từ xuất/nhập: ${generatedVoucher}`,
          transaction_item_id: targetItem.id,
        });
      } else {
        await createNotification({
          user_id: requesterId,
          type: 'request_approved',
          title: `Phiếu yêu cầu #${(targetItem.transaction_id || targetItem.id)?.slice(0, 8)} đã được duyệt`,
          body: `Phiếu yêu cầu ${itemType} cho GCN ${currentAsset?.certificate_no || ''} đã được phê duyệt. Mã chứng từ: ${generatedVoucher}`,
          transaction_item_id: targetItem.id,
        });
      }
    } else {
      await createNotification({
        user_id: requesterId,
        type: 'request_rejected',
        title: `Phiếu yêu cầu #${(targetItem.transaction_id || targetItem.id)?.slice(0, 8)} đã bị từ chối`,
        body: `Thủ kho / Ban quản trị đã từ chối yêu cầu. Lý do: "${notes || 'Không thỏa mãn điều kiện kho'}"`,
        transaction_item_id: targetItem.id,
      });
    }
  } catch (notifErr) {
    console.warn('Could not send notification:', notifErr);
  }

  // Activity Logging with correct responsible warehouse
  const warehouseDisplayName = responsibleWarehouse?.name || 'Chưa xác định';

  if (decision === 'approved') {
    if (itemType === 'checkout') {
      const desc = isInterWarehouseTransfer
        ? `Xuất kho luân chuyển GCN ${currentAsset?.certificate_no || ''} từ ${responsibleWarehouse?.name || 'Kho xuất'} sang kho đích (Đang luân chuyển)${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`
        : `Xuất sổ cho ${details.department || 'Ban/Bộ phận'}. Lý do: ${details.reason || 'Mượn xử lý công việc'}${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`;

      await logActivity({
        assetId: effectiveAssetId,
        actionType: isInterWarehouseTransfer ? 'Xuất kho luân chuyển' : 'Mượn/Xuất sổ',
        documentNo: generatedVoucher,
        description: desc,
        usedBy: details.department || 'Bộ phận sử dụng',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'checkin') {
      const desc = currentAsset?.custody_status === 'in_transit' || details.isTransferReceipt
        ? `Tiếp nhận và nhập kho hoàn tất luân chuyển GCN về ${warehouseDisplayName}${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`
        : `Nhập lưu kho GCN QSDĐ về kho ${warehouseDisplayName}${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`;

      await logActivity({
        assetId: effectiveAssetId,
        actionType: 'Nhập sổ',
        documentNo: generatedVoucher,
        description: desc,
        usedBy: 'BTC VMT',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'mortgage') {
      await logActivity({
        assetId: effectiveAssetId,
        actionType: 'Thế chấp',
        documentNo: generatedVoucher,
        description: `Thế chấp tại ${details.bank || 'Ngân hàng'}. Đơn vị: ${details.borrower || '-'}. Định giá: ${details.valuation ? Number(details.valuation).toLocaleString('vi-VN') + ' VNĐ' : '-'}`,
        usedBy: details.bank || 'Ngân hàng nhận thế chấp',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'sale_update') {
      await logActivity({
        assetId: effectiveAssetId,
        actionType: 'Xuất bán',
        documentNo: generatedVoucher,
        description: `Chuyển trạng thái kinh doanh sang: ${details.saleStatus === 'sold' ? 'Đã bán' : 'Sẵn sàng bán'}. Giá: ${details.salePrice ? Number(details.salePrice).toLocaleString('vi-VN') + ' VNĐ' : 'Chưa nhập'}`,
        usedBy: 'Khách hàng / Ban KD',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'split') {
      const splitType = details.splitType || 'full';
      if (splitType === 'reissue') {
        await logActivity({
          assetId: effectiveAssetId,
          actionType: 'Cấp đổi GCN (Thu hồi sổ cũ)',
          documentNo: generatedVoucher,
          description: `Thu hồi GCN cũ ${currentAsset?.certificate_no || ''} để cấp đổi sang GCN mới ${details.newCertificateNo || ''}. Lý do: ${details.reissueReason || 'Cấp đổi theo quy định'}`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ',
          warehouseId: responsibleWarehouse?.id || null,
          notes: notes || undefined,
          performedBy: performerId,
        });
      } else if (splitType === 'partial') {
        const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
        await logActivity({
          assetId: effectiveAssetId,
          actionType: 'Tách sổ (Trích 1 phần)',
          documentNo: generatedVoucher,
          description: `Trích tách ${details.splitChildren?.length || 0} sổ con (${totalSplitArea.toLocaleString('vi-VN')} m²) theo QĐ ${details.decisionNo || ''}. Diện tích còn lại của sổ gốc: ${(details.remainingArea || 0).toLocaleString('vi-VN')} m²`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ',
          warehouseId: responsibleWarehouse?.id || null,
          notes: details.splitNotes || notes || undefined,
          performedBy: performerId,
        });
      } else {
        await logActivity({
          assetId: effectiveAssetId,
          actionType: 'Tách sổ (Toàn bộ)',
          documentNo: generatedVoucher,
          description: `Tách toàn bộ sổ gốc ${currentAsset?.certificate_no || ''} thành ${details.splitChildren?.length || 0} sổ con theo QĐ ${details.decisionNo || ''} (Sổ gốc hết hiệu lực)`,
          usedBy: 'Ban DAĐT / Văn phòng ĐKĐĐ',
          warehouseId: responsibleWarehouse?.id || null,
          notes: details.splitNotes || notes || undefined,
          performedBy: performerId,
        });
      }
    }
  } else {
    await logActivity({
      assetId: effectiveAssetId,
      actionType: 'Từ chối YC',
      description: `Yêu cầu (${itemType}) bị từ chối. Lý do/Ghi chú: ${notes || 'Không'}`,
      warehouseId: responsibleWarehouse?.id || null,
      performedBy: performerId,
    });
  }

  return targetItem;
}

/**
 * Tự động tạo Bước 2 của quy trình luân chuyển kho
 * (Tạo phiếu checkin chờ thủ kho đích phê duyệt)
 */
async function createTransferReceiptStep(params: {
  assetId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  voucherCode: string;
  details: any;
  transactionParent: any;
  performerId?: string;
}) {
  const warehouses = mockStore.getWarehouses();
  const sourceWh = warehouses.find(w => w.id === params.sourceWarehouseId);
  const targetWh = warehouses.find(w => w.id === params.targetWarehouseId);
  const assets = mockStore.getAssets();
  const asset = assets.find(a => a.id === params.assetId);

  const newTxId = 'tx-transit-' + Date.now();
  const newTxItemId = 'txi-transit-' + Date.now();

  const step2ItemDetails = {
    ...params.details,
    sourceWarehouseId: params.sourceWarehouseId,
    targetWarehouseId: params.targetWarehouseId,
    transferVoucherCode: params.voucherCode,
    isTransferReceipt: true,
    reason: `[Bước 2 - Xác nhận nhập kho luân chuyển] Tiếp nhận GCN ${asset?.certificate_no || ''} từ ${sourceWh?.name || 'kho xuất'} sang ${targetWh?.name || 'kho đích'} (Theo ${params.voucherCode})`,
  };

  const newTx = {
    id: newTxId,
    type: 'checkin',
    created_at: new Date().toISOString(),
    notes: `[Bước 2 - Chờ xác nhận nhập kho luân chuyển] Bàn giao GCN ${asset?.certificate_no || ''} từ ${sourceWh?.name || 'kho xuất'} đến ${targetWh?.name || 'kho nhận'} (PX: ${params.voucherCode})`,
    requester_id: params.transactionParent?.requester_id || '00000000-0000-0000-0000-000000000001',
    created_by: params.transactionParent?.created_by || { full_name: 'Hệ thống luân chuyển VMT', email: 'system@btcvmt.vn' },
    items: [
      {
        id: newTxItemId,
        transaction_id: newTxId,
        asset_id: params.assetId,
        type: 'checkin',
        status: 'pending',
        details: step2ItemDetails,
        requested_details: step2ItemDetails,
        asset: asset,
      },
    ],
  };

  if (isSupabaseConfigured) {
    try {
      const { data: txData, error: txErr } = await supabase.from('transactions').insert([{
        type: 'checkin',
        requester_id: params.transactionParent?.requester_id || '00000000-0000-0000-0000-000000000001',
        details: { notes: newTx.notes, isTransferReceipt: true },
      }]).select().single();

      if (!txErr && txData) {
        await supabase.from('transaction_items').insert([{
          transaction_id: txData.id,
          asset_id: params.assetId,
          type: 'checkin',
          status: 'pending',
          details: step2ItemDetails,
        }]);
      }
    } catch (e) {
      console.warn('Supabase createTransferReceiptStep error, using mock:', e);
    }
  }

  const txs = mockStore.getTransactions();
  mockStore.saveTransactions([newTx, ...txs]);
}

/**
 * Duyệt hàng loạt nâng cao:
 * - Hỗ trợ thêm GCN mới / bớt GCN so với danh sách ban đầu
 * - Tự động đối chiếu số lượng và tạo thông báo "Yêu cầu: N sổ — Thực nhận: M sổ"
 */
export interface BulkDecideItemPayload {
  itemId?: string;
  assetId: string;
  decision: 'approved';
  notes?: string;
  finalDetails?: any;
  confirmedAssetId?: string;
  type?: string;
}

export async function bulkDecideTransactionItems(params: {
  transactionId?: string;
  approvedItems: BulkDecideItemPayload[];
  excludedItemIds?: string[];
  originalRequestedCount: number;
  globalNotes?: string;
  performerId?: string;
}) {
  const { transactionId, approvedItems, excludedItemIds = [], originalRequestedCount, globalNotes, performerId } = params;

  // 1. Duyệt các mục được chấp thuận
  for (const item of approvedItems) {
    if (item.itemId && !item.itemId.startsWith('new-added-')) {
      await decideTransactionItem(
        item.itemId,
        'approved',
        item.notes || globalNotes || '',
        performerId,
        item.finalDetails,
        item.confirmedAssetId
      );
    } else {
      // GCN mới thêm trực tiếp trong modal
      const txs = mockStore.getTransactions();
      const parentTx = txs.find(t => t.id === transactionId) || txs[0];
      const newTxItemId = 'txi-bulk-add-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const allAssets = mockStore.getAssets();
      const asset = allAssets.find(a => a.id === item.assetId);

      const newTxItem = {
        id: newTxItemId,
        transaction_id: parentTx?.id || transactionId || 'tx-bulk-add',
        asset_id: item.assetId,
        type: item.type || parentTx?.type || 'checkout',
        status: 'pending',
        details: item.finalDetails || parentTx?.details || {},
        requested_details: item.finalDetails || parentTx?.details || {},
        asset: asset,
      };

      if (parentTx) {
        parentTx.items = parentTx.items || [];
        parentTx.items.push(newTxItem);
        mockStore.saveTransactions([...txs]);
      }

      await decideTransactionItem(
        newTxItemId,
        'approved',
        item.notes || globalNotes || 'Thêm GCN bổ sung trong đợt duyệt hàng loạt',
        performerId,
        item.finalDetails,
        item.assetId
      );
    }
  }

  // 2. Xử lý các mục bị loại trừ khỏi đợt duyệt
  for (const excludedId of excludedItemIds) {
    try {
      await decideTransactionItem(
        excludedId,
        'rejected',
        globalNotes || 'Không bàn giao trong đợt duyệt này (Điều chỉnh giảm số lượng)',
        performerId
      );
    } catch (e) {
      console.warn('Failed to reject excluded item:', excludedId, e);
    }
  }

  // 3. Nếu số lượng thực nhận khác số lượng yêu cầu gốc -> Gửi thông báo chuẩn: "Yêu cầu: N sổ — Thực nhận: M sổ"
  const actualCount = approvedItems.length;
  const isCountChanged = actualCount !== originalRequestedCount;

  if (isCountChanged || (globalNotes && globalNotes.trim().length > 0)) {
    const txs = mockStore.getTransactions();
    const parentTx = txs.find(t => t.id === transactionId);
    const requesterId = parentTx?.created_by?.id || parentTx?.created_by || '00000000-0000-0000-0000-000000000002';

    try {
      await createNotification({
        user_id: requesterId,
        type: 'request_approved_with_changes',
        title: `Phiếu yêu cầu #${(transactionId || '').slice(0, 8)} đã được duyệt với điều chỉnh số lượng`,
        body: `Thực duyệt: ${actualCount} sổ (Yêu cầu ban đầu: ${originalRequestedCount} sổ). Ghi chú: "${globalNotes || 'Thủ kho đã điều chỉnh số lượng bàn giao thực tế'}". Vui lòng kiểm tra chi tiết trong phiếu.`,
        transaction_item_id: approvedItems[0]?.itemId || undefined,
      });
    } catch (notifErr) {
      console.warn('Could not send bulk count change notification:', notifErr);
    }
  }
}

export const fetchRequests = fetchTransactions;
export const createRequest = createTransaction;
export const approveRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'approved', notes, performerId);
export const rejectRequest = (requestId: string, performerId: string, name: string, notes?: string) =>
  decideTransactionItem(requestId, 'rejected', notes, performerId);
