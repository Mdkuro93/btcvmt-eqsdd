import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';

export type TransferStage =
  | 'awaiting_receipt'
  | 'adjustment_proposed'
  | 'adjustment_rejected'
  | 'received'
  | 'rejected_by_receiver'
  | 'recalled';

export interface TransferSnapshot {
  certificate_no?: string;
  legal_lot_code?: string;
  area?: number | string;
  land_lot_no?: string;
  map_sheet_no?: string;
  registry_no?: string;
  registry_date?: string;
  usage_purpose?: string;
  usage_term_type?: 'fixed_date' | 'long_term';
  usage_term_date?: string;
  scan_file_url?: string;
  notes?: string;
}

export interface TransferProposal {
  changes?: Partial<TransferSnapshot>;
  discrepancy_note?: string;
  notes?: string;
  proposed_by?: string;
  proposed_at?: string;
}

export interface TransferReview {
  accepted?: boolean;
  notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface WarehouseTransferRow {
  id: string; // in_item id
  transaction_id: string;
  asset_id: string;
  type: 'checkin';
  reason: 'luân chuyển';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  voucher_code: string | null; // PN voucher code when received
  decided_by?: string | null;
  decided_at?: string | null;
  decision_notes?: string | null;
  created_at: string;
  details?: {
    transfer?: {
      stage: TransferStage;
      source_warehouse_id: string;
      target_warehouse_id: string;
      out_voucher_code?: string;
      pair_item_id?: string;
      snapshot?: TransferSnapshot;
      proposal?: TransferProposal;
      review?: TransferReview;
      received_at?: string;
      received_by?: string;
      in_voucher_code?: string;
    };
  };
  asset?: {
    id: string;
    asset_code: string;
    certificate_no: string;
    legal_lot_code?: string;
    area?: number;
    warehouse_id?: string;
    custody_status?: string;
    projects?: {
      name: string;
    } | null;
  } | null;
  transaction?: {
    id: string;
    created_by: string;
    created_at: string;
    profiles?: {
      id: string;
      full_name: string;
      email: string;
    } | null;
  } | null;
}

export interface TransferItemResult {
  asset_id: string;
  certificate_no: string;
  result: 'created' | 'error';
  message: string;
  out_item_id?: string | null;
  in_item_id?: string | null;
  out_voucher?: string | null;
}

export const STAGE_LABELS: Record<TransferStage, string> = {
  awaiting_receipt: 'Chờ kho đích nhận',
  adjustment_proposed: 'Chờ kho xuất kiểm tra điều chỉnh',
  adjustment_rejected: 'Kho xuất từ chối điều chỉnh, kho đích xử lý lại',
  received: 'Đã nhận',
  rejected_by_receiver: 'Kho đích từ chối nhận',
  recalled: 'Đã thu hồi lệnh',
};

export const STAGE_BADGE_CLASSES: Record<TransferStage, string> = {
  awaiting_receipt: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  adjustment_proposed: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  adjustment_rejected: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  rejected_by_receiver: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  recalled: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export const TRANSFER_FIELDS: { key: keyof TransferSnapshot; label: string; type: 'text' | 'number' | 'date' | 'select' }[] = [
  { key: 'area', label: 'Diện tích (m²)', type: 'number' },
  { key: 'land_lot_no', label: 'Số thửa', type: 'text' },
  { key: 'map_sheet_no', label: 'Số tờ bản đồ', type: 'text' },
  { key: 'registry_no', label: 'Số vào sổ cấp', type: 'text' },
  { key: 'registry_date', label: 'Ngày vào sổ cấp', type: 'date' },
  { key: 'usage_purpose', label: 'Mục đích sử dụng', type: 'text' },
  { key: 'usage_term_type', label: 'Loại thời hạn', type: 'select' },
  { key: 'usage_term_date', label: 'Thời hạn sử dụng', type: 'date' },
  { key: 'scan_file_url', label: 'Link bản scan', type: 'text' },
  { key: 'notes', label: 'Ghi chú', type: 'text' },
];

/**
 * Đọc danh sách phiếu nhập luân chuyển giữa các kho
 */
export async function fetchWarehouseTransfers(): Promise<WarehouseTransferRow[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const query = supabase
    .from('transaction_items')
    .select(`
      *,
      asset:assets!asset_id(
        id,
        asset_code,
        certificate_no,
        legal_lot_code,
        area,
        warehouse_id,
        custody_status,
        projects(name)
      ),
      transaction:transactions!transaction_id(
        id,
        created_by,
        created_at,
        profiles!created_by(id, full_name, email)
      )
    `)
    .eq('reason', 'luân chuyển')
    .eq('type', 'checkin')
    .order('created_at', { ascending: false })
    .limit(300);

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) {
    throw new Error('Lỗi tải danh sách luân chuyển: ' + error.message);
  }

  return (data || []) as WarehouseTransferRow[];
}

/**
 * Tạo lệnh xuất luân chuyển cho 1 hoặc nhiều GCN
 */
export async function createWarehouseTransfer(
  assetIds: string[],
  targetWarehouseId: string,
  notes?: string | null,
  scanUrl?: string | null
): Promise<TransferItemResult[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanNotes = notes ? notes.trim() : null;
  const cleanScan = scanUrl ? scanUrl.trim() : null;

  const { data, error } = await withTimeout(
    supabase.rpc('create_warehouse_transfer', {
      p_asset_ids: assetIds,
      p_target_warehouse_id: targetWarehouseId,
      p_notes: cleanNotes && cleanNotes.length > 0 ? cleanNotes : null,
      p_scan_url: cleanScan && cleanScan.length > 0 ? cleanScan : null,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row: any) => ({
    asset_id: row.r_asset_id,
    certificate_no: row.r_certificate_no,
    result: row.r_result,
    message: row.r_message,
    out_item_id: row.r_out_item_id,
    in_item_id: row.r_in_item_id,
    out_voucher: row.r_out_voucher,
  }));
}

/**
 * Kho đích xác nhận nhận GCN (hoặc gửi đề xuất điều chỉnh kèm ghi chú)
 */
export async function confirmWarehouseTransferReceipt(
  inItemId: string,
  notes?: string | null,
  proposedChanges?: Record<string, any> | null,
  discrepancyNote?: string | null
): Promise<{ stage: string; voucher_code?: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanNotes = notes ? notes.trim() : null;
  const cleanDiscrepancy = discrepancyNote ? discrepancyNote.trim() : null;

  const { data, error } = await withTimeout(
    supabase.rpc('confirm_warehouse_transfer_receipt', {
      p_in_item_id: inItemId,
      p_notes: cleanNotes && cleanNotes.length > 0 ? cleanNotes : null,
      p_proposed_changes: proposedChanges && Object.keys(proposedChanges).length > 0 ? proposedChanges : null,
      p_discrepancy_note: cleanDiscrepancy && cleanDiscrepancy.length > 0 ? cleanDiscrepancy : null,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Kho xuất (hoặc admin) kiểm tra đề xuất điều chỉnh của kho đích
 */
export async function reviewWarehouseTransferAdjustment(
  inItemId: string,
  accept: boolean,
  notes: string
): Promise<{ stage: string; voucher_code?: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanNotes = notes ? notes.trim() : '';

  const { data, error } = await withTimeout(
    supabase.rpc('review_warehouse_transfer_adjustment', {
      p_in_item_id: inItemId,
      p_accept: accept,
      p_notes: cleanNotes,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Kho đích từ chối nhận GCN luân chuyển (trả về kho xuất)
 */
export async function rejectWarehouseTransferReceipt(
  inItemId: string,
  reason: string
): Promise<{ stage: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanReason = reason ? reason.trim() : '';

  const { data, error } = await withTimeout(
    supabase.rpc('reject_warehouse_transfer_receipt', {
      p_in_item_id: inItemId,
      p_reason: cleanReason,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Kho xuất (hoặc admin) thu hồi lệnh luân chuyển khi chưa nhận
 */
export async function cancelWarehouseTransfer(
  inItemId: string,
  reason: string
): Promise<{ stage: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Tính năng này yêu cầu kết nối Supabase.');
  }

  const cleanReason = reason ? reason.trim() : '';

  const { data, error } = await withTimeout(
    supabase.rpc('cancel_warehouse_transfer', {
      p_in_item_id: inItemId,
      p_reason: cleanReason,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
