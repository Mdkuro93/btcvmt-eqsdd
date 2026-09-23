import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export interface AssetDeletionResult {
  deleted: number;
  /** Tổng hợp các dữ liệu liên quan đã bị xóa kèm theo (lấy từ kết quả của hàm DB) */
  removed: {
    transaction_items: number;
    transactions: number;
    collaterals: number;
    ownership_transfers: number;
    inventory_audit_items: number;
    activity_logs_unlinked: number;
  };
}

const emptyRemoved = (): AssetDeletionResult['removed'] => ({
  transaction_items: 0,
  transactions: 0,
  collaterals: 0,
  ownership_transfers: 0,
  inventory_audit_items: 0,
  activity_logs_unlinked: 0,
});

/**
 * Xóa GCN dành riêng cho admin / super_admin (hàm DB admin_delete_assets, migration 0035).
 * - Bắt buộc có lý do (>= 10 ký tự).
 * - Tất cả hoặc không gì cả: 1 GCN vi phạm điều kiện thì cả lô bị hoàn tác.
 * - Toàn bộ dữ liệu bị xóa được lưu vết trong bảng deletion_audit.
 * Lỗi nghiệp vụ (đang thế chấp, là sổ mẹ/sổ con, còn phiếu chờ duyệt...) do DB trả về bằng tiếng Việt.
 */
export async function adminDeleteAssets(ids: string[], reason: string): Promise<AssetDeletionResult> {
  const cleanReason = reason.trim();
  if (ids.length === 0) {
    throw new Error('Chưa chọn GCN nào để xóa.');
  }
  if (cleanReason.length < 10) {
    throw new Error('Vui lòng nhập lý do xóa (ít nhất 10 ký tự).');
  }

  if (!isSupabaseConfigured) {
    mockStore.deleteAssets(ids);
    return { deleted: ids.length, removed: emptyRemoved() };
  }

  const { data, error } = await withTimeout(
    supabase.rpc('admin_delete_assets', { p_asset_ids: ids, p_reason: cleanReason }),
    DEFAULT_WRITE_TIMEOUT * 3
  );

  if (error) {
    // Thông báo do hàm DB tự viết bằng tiếng Việt, hiển thị nguyên văn
    throw new Error(error.message);
  }

  const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
  const removed = emptyRemoved();
  for (const item of items) {
    const r = item?.removed || {};
    (Object.keys(removed) as Array<keyof typeof removed>).forEach(k => {
      removed[k] += Number(r[k] || 0);
    });
  }

  return { deleted: Number((data as any)?.deleted ?? ids.length), removed };
}