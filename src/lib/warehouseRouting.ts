import { Warehouse } from '../types';

/**
 * Thống nhất 1 công thức duy nhất xác định "Kho chịu trách nhiệm" cho 1 dòng phiếu (transaction item).
 * 
 * Logic chuẩn:
 * - Với 'checkin' (Nhập sổ / Tiếp nhận luân chuyển): ưu tiên targetWarehouseId -> requested_details.targetWarehouseId -> asset.warehouse_id
 * - Với tất cả các loại khác ('checkout', 'mortgage', 'sale_update', 'split', v.v.): 
 *   ưu tiên kho vật lý đang giữ tài sản (asset.warehouse_id) -> details.targetWarehouseId -> requested_details.targetWarehouseId
 * - Tuyệt đối không fallback ngẫu nhiên sang kho đầu tiên: nếu không xác định được, trả về undefined.
 */
export function getResponsibleWarehouseId(item: any, txType?: string): string | undefined {
  if (!item) return undefined;
  const type = txType || item.type || item.transaction?.type;

  if (type === 'checkin') {
    return item.details?.targetWarehouseId || item.requested_details?.targetWarehouseId || item.asset?.warehouse_id || undefined;
  }

  return item.asset?.warehouse_id || item.details?.targetWarehouseId || item.requested_details?.targetWarehouseId || undefined;
}

/**
 * Tìm đối tượng Warehouse chịu trách nhiệm từ danh sách kho
 */
export function getResponsibleWarehouse(item: any, txType?: string, warehouses?: Warehouse[]): Warehouse | undefined {
  const whId = getResponsibleWarehouseId(item, txType);
  if (!whId || !warehouses || warehouses.length === 0) return undefined;
  return warehouses.find(w => w.id === whId);
}
