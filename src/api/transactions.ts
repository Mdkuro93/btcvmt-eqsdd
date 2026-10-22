import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { DEFAULT_WAREHOUSE_SLA_DAYS, DEFAULT_RETURN_DAYS } from '../lib/constants';
import { TransactionType, Asset, Warehouse } from '../types';
import { updateAsset, createAsset, fetchWarehouses, generateUuid, sanitizeUuid, isUuid } from './assets';
import { logActivity } from './activityLogs';
import { generateNextVoucherCode } from '../lib/voucherEngine';
import { createNotification } from './notifications';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';

/** Phiếu đang CHỜ DUYỆT của một GCN (dùng để cảnh báo trước khi gửi phiếu mới, vì hệ thống chặn gửi trùng). */
export interface PendingItemInfo {
  itemId: string;
  transactionId: string;
  assetId: string;
  type: 'checkout' | 'checkin' | string;
  reason: string | null;
  createdAt: string | null;
  requesterName: string | null;
}

export const PENDING_TYPE_LABEL: Record<string, string> = { checkout: 'xuất kho', checkin: 'nhập kho' };

/** Tra cứu các phiếu đang chờ duyệt của danh sách GCN (chỉ thấy phiếu trong phạm vi quyền xem của người dùng). */
export async function fetchPendingItemsForAssets(assetIds: string[]): Promise<PendingItemInfo[]> {
  const ids = Array.from(new Set((assetIds || []).filter(Boolean)));
  if (!isSupabaseConfigured || ids.length === 0) return [];

  const { data: items, error } = await withTimeout(
    supabase
      .from('transaction_items')
      .select('id, transaction_id, asset_id, type, reason, created_at')
      .in('asset_id', ids)
      .eq('status', 'pending'),
    DEFAULT_READ_TIMEOUT
  );
  if (error || !items || items.length === 0) return [];

  const names = new Map<string, string>();
  const createdBy = new Map<string, string>();
  try {
    const txIds = Array.from(new Set(items.map((i: any) => i.transaction_id).filter(Boolean)));
    const { data: txs } = await supabase.from('transactions').select('id, created_by').in('id', txIds);
    (txs || []).forEach((t: any) => { if (t.created_by) createdBy.set(t.id, t.created_by); });
    const userIds = Array.from(new Set(Array.from(createdBy.values())));
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      (profs || []).forEach((p: any) => names.set(p.id, p.full_name || p.email || ''));
    }
  } catch {
    // Không tra được tên người tạo thì bỏ qua, vẫn hiện được phiếu
  }

  return items.map((i: any) => ({
    itemId: i.id,
    transactionId: i.transaction_id,
    assetId: i.asset_id,
    type: i.type,
    reason: i.reason ?? null,
    createdAt: i.created_at ?? null,
    requesterName: names.get(createdBy.get(i.transaction_id) || '') || null,
  }));
}

/** Câu mô tả một phiếu đang chờ, dùng cho cả thông báo lỗi và khung cảnh báo. */
export function describePendingItem(p: PendingItemInfo, certificateNo?: string): string {
  const when = p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN') : '';
  return [
    certificateNo ? `GCN ${certificateNo}` : 'GCN',
    `đang có phiếu ${PENDING_TYPE_LABEL[p.type] || p.type}${p.reason ? ` (${p.reason})` : ''} chờ duyệt`,
    `(mã phiếu ${String(p.transactionId).slice(0, 8).toUpperCase()}${when ? `, tạo ${when}` : ''}${p.requesterName ? ` bởi ${p.requesterName}` : ''})`,
  ].join(' ');
}

export async function fetchTransactions(): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getTransactions();
  }
  
  const { data, error } = await withTimeout(
    supabase
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
      .order('created_at', { ascending: false }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    if (error.code === '42P17') {
      throw new Error(
        'Lỗi đệ quy chính sách RLS (42P17) trên bảng transaction_items / transactions: ' +
        'Vui lòng thực thi migration 0019_fix_transaction_policies_recursion.sql trên Supabase SQL Editor để gỡ bỏ các policy cũ bị đệ quy chéo.'
      );
    }
    throw error;
  }
  
  return (data || []).map((tx: any) => ({
    ...tx,
    items: (tx.items || []).map((item: any) => ({
      ...item,
      confirmed_asset_id: item.confirmed_asset_id || item.details?.confirmed_asset_id || null,
      confirmed_asset: item.confirmed_asset || item.asset
    }))
  }));
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
  let items: Array<{ asset_id: string; type: TransactionType; reason?: string | null; details?: any }>;
  // Quản lý kho / admin: tạo xong ghi nhận ngay (tạo phiếu rồi duyệt ngay bằng chính RPC duyệt có kiểm tra quyền + kho)
  const autoApprove = Boolean(
    (typeof param1 === 'object' && param1 && param1.autoApprove) || (details && details.autoApprove)
  );

  // Thêm logic desiredReceiveDate nếu thiếu
  if (details && !details.desiredReceiveDate) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + DEFAULT_WAREHOUSE_SLA_DAYS);
    details.desiredReceiveDate = defaultDate.toISOString().split('T')[0];
  }

  if (typeof param1 === 'string' && type) {
    createdBy = param1;
    txType = type;
    txNotes = details?.notes || details?.reason || details?.splitNotes || '';
    items = (assetIds || []).map(id => ({
      asset_id: id,
      type: txType,
      reason: details?.reason || null,
      details,
    }));
  } else {
    createdBy = param1.created_by || param1.createdBy;
    txType = param1.type;
    txNotes = param1.notes;
    items = (param1.items || []).map((it: any) => ({
      asset_id: it.asset_id || it.assetId || it.id,
      type: it.type || txType,
      reason: it.reason || it.details?.reason || null,
      details: it.details,
    }));
  }

  const scanUrl =
    (typeof param1 === 'object' ? (param1.scan_url || param1.scanUrl) : null) ||
    details?.scan_url ||
    details?.scanUrl ||
    (items[0]?.details?.scan_url || items[0]?.details?.scanUrl) ||
    null;

  if (!isSupabaseConfigured) {
    const current = mockStore.getTransactions();
    const newTxId = 'tx-' + Date.now();
    const assets = mockStore.getAssets();

    const newTx = {
      id: newTxId,
      type: txType,
      notes: txNotes || '',
      scan_url: scanUrl,
      created_at: new Date().toISOString(),
      created_by: { full_name: 'Người dùng hiện tại', email: 'user@btcvmt.vn' },
      items: items.map((it, idx) => ({
        id: 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        reason: it.details?.reason || null,
        status: 'pending',
        details: { ...it.details, scan_url: scanUrl },
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

  const itemsPayload = items.map(it => ({
    asset_id: it.asset_id,
    type: it.type || txType,
    reason: it.reason || it.details?.reason || null,
    details: (() => {
      const { autoApprove: _drop, ...rest } = (it.details || {}) as any;
      return { ...rest, scan_url: scanUrl };
    })(),
  }));

  // Kiểm tra trước: GCN đã có phiếu cùng loại đang chờ duyệt thì báo rõ phiếu nào (thay vì lỗi chung chung từ CSDL)
  try {
    const pending = (await fetchPendingItemsForAssets(items.map(it => it.asset_id)))
      .filter(p => p.type === txType);
    if (pending.length > 0) {
      const lines = pending.slice(0, 3).map(p => describePendingItem(p));
      throw new Error(
        'Không thể tạo phiếu: ' + lines.join('; ') +
        (pending.length > 3 ? ` và ${pending.length - 3} GCN khác` : '') +
        '. Vào "Duyệt yêu cầu & Kho" để duyệt hoặc từ chối phiếu đó trước, rồi tạo lại.'
      );
    }
  } catch (preErr: any) {
    if (preErr?.message?.startsWith('Không thể tạo phiếu:')) throw preErr;
    // Lỗi tra cứu (mạng...) thì bỏ qua, để CSDL kiểm tra
  }

  // Ưu tiên gọi RPC atomic create_transaction_request kèm p_scan_url
  let rpcResult: any = null;
  let rpcErr: any = null;

  try {
    const res = await withTimeout(
      supabase.rpc('create_transaction_request', {
        p_type: txType,
        p_notes: txNotes || null,
        p_items: itemsPayload,
        p_scan_url: scanUrl,
      }),
      DEFAULT_WRITE_TIMEOUT
    );
    rpcResult = res.data;
    rpcErr = res.error;
  } catch (err) {
    rpcErr = err;
  }

  // Fallback gọi phiên bản 3 tham số nếu DB chưa chạy migration nhận p_scan_url
  if (rpcErr && rpcErr.code === 'PGRST202') {
    try {
      const res3 = await withTimeout(
        supabase.rpc('create_transaction_request', {
          p_type: txType,
          p_notes: txNotes || null,
          p_items: itemsPayload,
        }),
        DEFAULT_WRITE_TIMEOUT
      );
      rpcResult = res3.data;
      rpcErr = res3.error;
    } catch (err) {
      rpcErr = err;
    }
  }

  // Nếu RPC gặp lỗi thật (không phải PGRST202 function not found) -> báo lỗi rõ ràng theo Rule #15
  if (rpcErr && rpcErr.code !== 'PGRST202') {
    const raw = String(rpcErr.message || 'Không thể tạo phiếu yêu cầu');
    if (/đang chờ duyệt/.test(raw)) {
      // CSDL từ chối vì đã có phiếu chờ duyệt mà người dùng không thấy được (thường thuộc người/kho khác)
      throw new Error(
        raw.replace('phiếu checkout', 'phiếu xuất kho').replace('phiếu checkin', 'phiếu nhập kho') +
        ' Phiếu đó không hiện trong danh sách của bạn (có thể do người khác tạo hoặc thuộc kho khác); hãy nhờ quản trị viên xử lý.'
      );
    }
    throw new Error('Lỗi tạo phiếu yêu cầu: ' + raw);
  }

  let finalTx: any = null;
  let finalItems: any[] = [];

  if (!rpcErr && rpcResult) {
    finalTx = rpcResult;
    finalItems = rpcResult.items || [];
  } else {
    // Không còn ghi trực tiếp vào transactions / transaction_items từ trình duyệt (migration 0117):
    // mọi phiếu phải đi qua RPC create_transaction_request (có kiểm tra vai trò, lý do, phạm vi, trùng phiếu).
    throw new Error(
      'Không thể tạo phiếu yêu cầu: hệ thống chưa sẵn sàng (thiếu hàm create_transaction_request trên CSDL). ' +
      'Vui lòng liên hệ quản trị viên.'
    );
  }

  // Ghi nhận ngay: duyệt từng mục vừa tạo. Nếu một mục lỗi thì từ chối các mục còn chờ để không để phiếu treo chặn lần tạo sau.
  if (autoApprove) {
    const approvedIds: string[] = [];
    let failure: any = null;
    for (const fi of finalItems) {
      try {
        const src = items.find(it => it.asset_id === fi.asset_id);
        const { autoApprove: _drop, ...baseDetails } = (src?.details || fi.details || {}) as any;
        await decideTransactionItem(fi.id, 'approved', 'Tự ghi nhận khi tạo phiếu (quản lý kho/quản trị trong phạm vi quyền)', createdBy, { ...baseDetails, scan_url: scanUrl });
        approvedIds.push(fi.id);
      } catch (e: any) {
        failure = e;
        break;
      }
    }
    if (failure) {
      for (const fi of finalItems) {
        if (approvedIds.includes(fi.id)) continue;
        try {
          await decideTransactionItem(fi.id, 'rejected', 'Tự động từ chối: ghi nhận ngay thất bại', createdBy);
        } catch { /* bỏ qua: phiếu vẫn hiện ở Duyệt yêu cầu để xử lý tay */ }
      }
      throw new Error(
        'Không ghi nhận được ngay' +
        (approvedIds.length ? ` (đã ghi nhận ${approvedIds.length}/${finalItems.length} GCN, phần còn lại đã tự từ chối)` : '') +
        ': ' + (failure?.message || 'lỗi không xác định')
      );
    }
  }

  try {
    const current = mockStore.getTransactions();
    const newTxId = finalTx.id;
    const assets = mockStore.getAssets();

    const newTx = {
      id: newTxId,
      type: txType,
      notes: txNotes || '',
      created_at: new Date().toISOString(),
      created_by: { full_name: 'Người dùng hiện tại', email: 'user@btcvmt.vn' },
      items: items.map((it, idx) => ({
        id: finalItems?.[idx]?.id || 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        reason: it.details?.reason || null,
        status: 'pending',
        details: it.details || {},
        asset: assets.find(a => a.id === it.asset_id),
      })),
    };

    mockStore.saveTransactions([newTx, ...current]);
  } catch {}

  for (const it of items) {
    await logActivity({
      assetId: it.asset_id,
      actionType: `Gửi YC ${txType}`,
      description: `Tạo phiếu yêu cầu biến động (${txType})`,
    });
  }

  return { ...finalTx, items: finalItems };
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

  if (!isSupabaseConfigured) {
    const txs = mockStore.getTransactions();
    for (const tx of txs) {
      const found = (tx.items || []).find((i: any) => i.id === itemId);
      if (found) {
        targetItem = found;
        transactionParent = tx;
        break;
      }
    }
  } else {
    const { data, error } = await withTimeout(
      supabase
        .from('transaction_items')
        .select('*, transaction:transactions(*), asset:assets(*)')
        .eq('id', itemId)
        .single(),
      DEFAULT_READ_TIMEOUT
    );

    if (error) throw error;
    if (data) {
      targetItem = data;
      transactionParent = data.transaction;
    }
  }

  if (!targetItem) throw new Error('Không tìm thấy mục cần duyệt');

  const effectiveAssetId = confirmedAssetId || targetItem.confirmed_asset_id || targetItem.asset_id;
  const itemType = targetItem.type;
  const details = finalDetails || targetItem.details || {};
  const hasChanges = (confirmedAssetId && confirmedAssetId !== targetItem.asset_id) || (notes && notes.trim().length > 0);

  let currentAsset = targetItem.asset;
  let warehouses: Warehouse[] = [];

  if (isSupabaseConfigured) {
    if (!currentAsset || currentAsset.id !== effectiveAssetId) {
      const { data: dbAsset } = await withTimeout(
        supabase.from('assets').select('*, warehouses:warehouses(*)').eq('id', effectiveAssetId).maybeSingle(),
        DEFAULT_READ_TIMEOUT
      );
      if (dbAsset) currentAsset = dbAsset;
    }
    const { data: dbWhs, error: whErr } = await withTimeout(
      supabase.from('warehouses').select('*'),
      DEFAULT_READ_TIMEOUT
    );
    if (whErr) {
      throw new Error('Lỗi khi tải danh sách kho: ' + whErr.message);
    }
    warehouses = dbWhs || [];
  } else {
    const allAssets = mockStore.getAssets();
    currentAsset = allAssets.find((a: any) => a.id === effectiveAssetId) || targetItem.asset;
    warehouses = mockStore.getWarehouses();
  }

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
    if (!responsibleWarehouse) {
      throw new Error(
        `Không xác định được kho lưu trữ của tài sản (GCN ${currentAsset?.certificate_no || ''}) để sinh mã phiếu. Vui lòng gán kho cho tài sản trước khi duyệt xuất.`
      );
    }
    const { voucherCode } = await generateNextVoucherCode(responsibleWarehouse, itemType, details?.reason);
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

  
  // Nếu là duyệt checkout và không có returnDate thì tự tính ngày trả (SLA trả sổ)
  if (decision === 'approved' && itemType === 'checkout') {
    if (!details.returnDate) {
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + DEFAULT_RETURN_DAYS);
      details.returnDate = returnDate.toISOString().split('T')[0];
    }
  }

  if (isSupabaseConfigured) {
    const rpcDetails = confirmedAssetId ? { ...details, confirmed_asset_id: confirmedAssetId } : details;

    // Call secure RPC with timeout
    const { error } = await withTimeout(
      supabase.rpc('decide_transaction_item', {
        p_item_id: itemId,
        p_status: decision,
        p_notes: notes || null,
        p_details: rpcDetails,
        p_voucher_code: generatedVoucher || null,
      }),
      DEFAULT_WRITE_TIMEOUT
    );
    
    if (error) throw error;
  } else {
    await runLocalDecideLogic();
  }

  async function runLocalDecideLogic() {
    if (decision === 'approved') {
      const assetUpdates: Record<string, any> = {};


      if (itemType === 'checkout') {
        assetUpdates.custody_status = 'checked_out';
        
        if (isInterWarehouseTransfer && currentAsset?.custody_status !== 'in_transit') {
          assetUpdates.custody_status = 'in_transit';
          assetUpdates.current_holder_dept = details.department || 'Đang luân chuyển kho';
          if (details.returnDate) assetUpdates.expected_return_date = details.returnDate;
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          await updateAsset(effectiveAssetId, assetUpdates);
        } else {
          assetUpdates.current_holder_dept = details.department || null;
          if (details.reason === 'mượn' && details.returnDate) {
            assetUpdates.expected_return_date = details.returnDate;
          }
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          
          if (details.reason === 'thế chấp' || (details.reason === 'chuyển nhượng' && details.concurrentMortgage)) {
            assetUpdates.mortgage_status = 'mortgaged';
            if (details.bank) assetUpdates.mortgage_bank = details.bank;
            if (details.mortgage_unit) assetUpdates.mortgage_borrower = details.mortgage_unit;
            if (details.valuation) assetUpdates.mortgage_valuation = Number(details.valuation);
            if (details.expected_release_date) assetUpdates.mortgage_expected_release_date = details.expected_release_date;
          }

          if (details.reason === 'xuất bán' || details.reason === 'sang tên cho khách') {
            assetUpdates.sale_status = details.saleStatus || 'sold';
            if (details.salePrice) assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}${details.reason === 'sang tên cho khách' ? 'Sang tên cho khách' : 'Xuất bán'} giá: ${details.salePrice}`;
          }

          if (details.reason === 'tách sổ' || details.reason === 'đổi sổ') {
             // Handle split/reissue logic...
             const splitType = details.splitType || 'full';
             if (splitType === 'reissue') {
               assetUpdates.lifecycle_status = 'invalidated';
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã cấp đổi sang GCN mới: ${details.newCertificateNo || ''} (Lý do: ${details.reissueReason || ''})`;
             } else if (splitType === 'partial') {
               const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
               const remainingArea = Math.max(0, (currentAsset?.area || 0) - totalSplitArea);
               assetUpdates.lifecycle_status = 'active';
               assetUpdates.area = remainingArea;
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã trích tách một phần (${totalSplitArea.toLocaleString('vi-VN')} m² theo QĐ ${details.decisionNo || ''}). Diện tích còn lại: ${remainingArea.toLocaleString('vi-VN')} m²`;
             } else {
               assetUpdates.lifecycle_status = 'invalidated';
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã tách toàn bộ thành ${(details.splitChildren || []).length} sổ con theo QĐ ${details.decisionNo || ''}`;
             }
          }
          
          await updateAsset(effectiveAssetId, assetUpdates);
          
          // Child creation logic for split...
          if ((details.reason === 'tách sổ' || details.reason === 'đổi sổ') && (details.splitType === 'partial' || details.splitType === 'full') && Array.isArray(details.splitChildren)) {
            for (const child of details.splitChildren) {
              if (!child.certificate_no) continue;
              const childAssetData = {
                certificate_no: child.certificate_no,
                project_id: sanitizeUuid(currentAsset?.project_id),
                subdivision: child.subdivision || currentAsset?.subdivision || null,
                lot_no: child.land_lot_no || currentAsset?.lot_no || null,
                area: child.area ? Number(child.area) : null,
                owner_name: currentAsset?.owner_name || null,
                warehouse_id: sanitizeUuid(currentAsset?.warehouse_id),
                parent_asset_id: sanitizeUuid(effectiveAssetId),
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
          } else if ((details.reason === 'tách sổ' || details.reason === 'đổi sổ') && details.splitType === 'reissue' && details.newCertificateNo) {
            const reissuedAssetData = {
              certificate_no: details.newCertificateNo,
              registry_no: details.newRegistryNo || currentAsset?.registry_no || null,
              project_id: sanitizeUuid(currentAsset?.project_id),
              subdivision: currentAsset?.subdivision || null,
              lot_no: currentAsset?.lot_no || null,
              area: currentAsset?.area || null,
              owner_name: currentAsset?.owner_name || null,
              warehouse_id: sanitizeUuid(currentAsset?.warehouse_id),
              parent_asset_id: sanitizeUuid(effectiveAssetId),
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
        }
      } else if (itemType === 'checkin') {
        assetUpdates.custody_status = 'in_stock';
        assetUpdates.warehouse_id = details.targetWarehouseId || currentAsset?.warehouse_id;
        assetUpdates.expected_return_date = null;
        assetUpdates.current_holder_dept = null;
        
        if (details.reason === 'giải chấp') {
          assetUpdates.mortgage_status = 'none';
          assetUpdates.mortgage_bank = null;
          assetUpdates.mortgage_borrower = null;
          assetUpdates.mortgage_valuation = null;
          assetUpdates.mortgage_expected_release_date = null;
        }

        await updateAsset(effectiveAssetId, assetUpdates);
        
        if (details.updateOwnership && details.newOwnerEntityId) {
          if (isSupabaseConfigured) {
            await supabase.rpc('transfer_asset_ownership', {
              p_asset_id: effectiveAssetId,
              p_to_entity_id: details.newOwnerEntityId,
              p_to_role: details.newOwnerRole,
              p_note: `Đồng thời nhập kho: ${details.reason || ''}`,
              p_transferred_by: performerId || null
            });
          } else {
             const transferData = {
                id: 'trf-' + Date.now(),
                asset_id: effectiveAssetId,
                from_entity_id: currentAsset?.current_owner_entity_id,
                from_role: currentAsset?.current_owner_role,
                to_entity_id: details.newOwnerEntityId,
                to_role: details.newOwnerRole,
                transferred_by: performerId || null,
                transferred_at: new Date().toISOString(),
                note: `Đồng thời nhập kho: ${details.reason || ''}`,
                created_at: new Date().toISOString()
             };
             mockStore.addAssetOwnershipTransfer(transferData);
             await updateAsset(effectiveAssetId, {
                current_owner_entity_id: details.newOwnerEntityId,
                current_owner_role: details.newOwnerRole
             });
          }
        }
      }
        }

    const txs = mockStore.getTransactions();
    const allAssets = mockStore.getAssets();
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
          body: `Quản lý kho đã duyệt phiếu với điều chỉnh thực tế: "${notes || 'Thay đổi GCN hoặc thông số bàn giao'}". Mã chứng từ xuất/nhập: ${generatedVoucher}`,
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
        body: `Quản lý kho / Ban quản trị đã từ chối yêu cầu. Lý do: "${notes || 'Không thỏa mãn điều kiện kho'}"`,
        transaction_item_id: targetItem.id,
      });
    }
  } catch (notifErr) {
    console.warn('Could not send notification:', notifErr);
  }

  // Activity Logging with correct responsible warehouse
  const warehouseDisplayName = responsibleWarehouse?.name || 'Chưa xác định';

  if (decision === 'approved') {
    if (itemType === 'checkout' && details.reason === 'khác') {
      await logActivity({
        assetId: effectiveAssetId,
        actionType: 'Xuất khác',
        documentNo: generatedVoucher,
        description: `Xuất kho (khác) cho ${details.department || 'Ban/Bộ phận'}. Mục đích: ${details.otherReasonDetail || 'Không ghi rõ'}${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`,
        usedBy: details.department || 'Bộ phận sử dụng',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'checkin' && details.reason === 'khác') {
      await logActivity({
        assetId: effectiveAssetId,
        actionType: 'Nhập khác',
        documentNo: generatedVoucher,
        description: `Nhập kho (khác) về ${warehouseDisplayName}. Mục đích: ${details.otherReasonDetail || 'Không ghi rõ'}${hasChanges ? ' (Có điều chỉnh: ' + notes + ')' : ''}`,
        usedBy: 'BTC VMT',
        warehouseId: responsibleWarehouse?.id || null,
        notes: notes || undefined,
        performedBy: performerId,
      });
    } else if (itemType === 'checkout') {
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
 * Duyệt hàng loạt nâng cao:
 * - Hỗ trợ thêm GCN mới / bớt GCN so với danh sách ban đầu
 * - Tự động đối chiếu số lượng và tạo thông báo "Yêu cầu: N sổ — Thực nhận: M sổ"
 */
export interface BulkDecideItemPayload {
  itemId?: string;
  isNewlyAdded?: boolean;
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
    if (item.itemId && !item.isNewlyAdded && !item.itemId.startsWith('new-added-') && isUuid(item.itemId)) {
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
      const newTxItemId = generateUuid();
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
        body: `Thực duyệt: ${actualCount} sổ (Yêu cầu ban đầu: ${originalRequestedCount} sổ). Ghi chú: "${globalNotes || 'Quản lý kho đã điều chỉnh số lượng bàn giao thực tế'}". Vui lòng kiểm tra chi tiết trong phiếu.`,
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

/**
 * Lấy link scan_url (OneDrive) từ phiếu nhập kho gần nhất của GCN
 * Phục vụ hiển thị nút "📄 Xem Bản Scan" trong chi tiết GCN và lịch sử giao dịch
 */
export async function fetchLatestCheckinScanUrl(assetId: string): Promise<string | null> {
  if (!isSupabaseConfigured) {
    const txs = mockStore.getTransactions();
    for (const tx of txs) {
      if (tx.type === 'checkin' && (tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl)) {
        const hasAsset = (tx.items || []).some((it: any) => it.asset_id === assetId || it.asset?.id === assetId);
        if (hasAsset) {
          return tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl;
        }
      }
    }
    return null;
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('transaction_items')
        .select(`
          id,
          type,
          transaction_id,
          created_at,
          transactions:transaction_id (
            id,
            type,
            scan_url,
            details,
            created_at
          )
        `)
        .eq('asset_id', assetId)
        .eq('type', 'checkin')
        .order('created_at', { ascending: false })
        .limit(10),
      DEFAULT_READ_TIMEOUT
    );

    if (error) {
      console.warn('Truy vấn phiếu nhập kho của GCN:', error.message);
      return null;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        const tx: any = row.transactions;
        const url = tx?.scan_url || tx?.details?.scan_url || tx?.details?.scanUrl;
        if (url && typeof url === 'string' && url.trim()) {
          return url.trim();
        }
      }
    }
  } catch (err: any) {
    console.warn('Lỗi khi tìm link scan của phiếu nhập kho:', err?.message);
    return null;
  }

  return null;
}

/**
 * Hủy phiếu giao dịch (Void Ticket) và hoàn trả trạng thái tài sản về kho
 * Chỉ tài khoản super_admin, admin, btc_manager được phép thực hiện
 */
export async function voidTransactionItem(itemId: string, reason: string): Promise<any> {
  if (!itemId) throw new Error('Mã phiếu không hợp lệ.');
  const cleanReason = reason?.trim() || 'Hủy phiếu giao dịch test/sai';

  if (isSupabaseConfigured) {
    const { data, error } = await withTimeout(
      supabase.rpc('void_transaction_item', {
        p_item_id: itemId,
        p_reason: cleanReason,
      }),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error('Lỗi khi hủy phiếu: ' + (error.message || 'Không thể hủy phiếu'));
    }

    // Nhật ký 'Hủy phiếu' do RPC void_transaction_item ghi trực tiếp trong DB (migration 0058/0063).
    // KHÔNG gọi logActivity ở đây để tránh ghi trùng.

    return data;
  } else {
    // Demo/offline mode
    const txs = mockStore.getTransactions();
    let foundItem: any = null;
    for (const tx of txs) {
      const it = (tx.items || []).find((i: any) => i.id === itemId);
      if (it) {
        it.status = 'cancelled';
        it.notes = (it.notes ? `${it.notes} | ` : '') + `[ĐÃ HỦY: ${cleanReason}]`;
        foundItem = it;
        break;
      }
    }
    if (foundItem) {
      const assets = mockStore.getAssets();
      const a = assets.find((x: any) => x.id === foundItem.asset_id);
      if (a && (a.custody_status === 'checked_out' || a.custody_status === 'in_transit')) {
        a.custody_status = 'in_stock';
        a.expected_return_date = null;
        a.borrow_purpose = null;
        a.current_holder_dept = null;
      }
      try {
        logActivity({
          assetId: foundItem.asset_id,
          actionType: 'Hủy phiếu',
          documentNo: foundItem.voucher_code || 'Chưa có số',
          description: `HỦY PHIẾU ${foundItem.voucher_code || ''} - Lý do: ${cleanReason}`,
          warehouseId: a?.warehouse_id,
          notes: cleanReason,
        });
      } catch {}
    }
    return { success: true };
  }
}