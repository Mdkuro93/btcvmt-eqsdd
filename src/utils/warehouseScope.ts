import { Warehouse } from '../types';

/**
 * Lọc danh sách kho hiển thị trong các bộ lọc/dropdown theo phân quyền của tài khoản.
 * - admin, super_admin, btc_manager: thấy toàn bộ kho hệ thống
 * - warehouse_manager: chỉ thấy các kho trong managed_warehouse_ids
 * - supervisor, capital_dept, project_dept, re_dept: chỉ thấy các kho trong assigned_warehouse_ids
 * - Các vai trò khác: giữ nguyên danh sách kho hoặc lọc theo assigned_warehouse_ids nếu có
 */
export function scopeWarehouses<T extends { id: string }>(
  warehouses: T[],
  profile?: {
    role?: string;
    managed_warehouse_ids?: string[] | null;
    assigned_warehouse_ids?: string[] | null;
  } | null
): T[] {
  if (!warehouses || !Array.isArray(warehouses) || warehouses.length === 0) {
    return [];
  }

  if (!profile || !profile.role) {
    return warehouses;
  }

  const role = profile.role;

  // 1. Quản trị hệ thống: toàn quyền xem tất cả kho
  if (['admin', 'super_admin', 'btc_manager'].includes(role)) {
    return warehouses;
  }

  // 2. Quản lý kho (thủ kho): giới hạn theo kho phụ trách
  if (role === 'warehouse_manager') {
    const managedIds = profile.managed_warehouse_ids || [];
    return warehouses.filter((w) => managedIds.includes(w.id));
  }

  // 3. Giám sát và các phòng ban chuyên môn: giới hạn theo kho được gán
  if (['supervisor', 'capital_dept', 'project_dept', 're_dept'].includes(role)) {
    const assignedIds = profile.assigned_warehouse_ids || [];
    return warehouses.filter((w) => assignedIds.includes(w.id));
  }

  // 4. Các vai trò khác (viewer, user, investor): nếu có assigned_warehouse_ids thì lọc theo đó
  if (profile.assigned_warehouse_ids && profile.assigned_warehouse_ids.length > 0) {
    return warehouses.filter((w) => profile.assigned_warehouse_ids!.includes(w.id));
  }

  return warehouses;
}
