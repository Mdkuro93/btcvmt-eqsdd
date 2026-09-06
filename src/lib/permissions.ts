import { Role } from '../types';

export const ALL_PERMISSIONS = [
  { key: 'asset.view', label: 'Xem danh mục GCN' },
  { key: 'asset.lookup', label: 'Tra cứu tình trạng GCN' },
  { key: 'asset.create', label: 'Thêm mới GCN' },
  { key: 'asset.edit', label: 'Sửa GCN' },
  { key: 'request.borrow', label: 'Gửi YC Mượn/Xuất' },
  { key: 'request.return', label: 'Gửi YC Nhập trả' },
  { key: 'request.mortgage', label: 'Gửi YC Thế chấp' },
  { key: 'request.unmortgage', label: 'Gửi YC Giải chấp' },
  { key: 'request.sell', label: 'Gửi YC Xuất bán' },
  { key: 'request.split', label: 'Gửi YC Tách sổ' },
  { key: 'request.approve', label: 'Duyệt / Từ chối Yêu cầu kho' },
  { key: 'access.view', label: 'Xem yêu cầu truy cập kho' },
  { key: 'access.approve', label: 'Duyệt cấp quyền truy cập kho' },
  { key: 'report.view', label: 'Xem Báo cáo & Thống kê tài chính' },
  { key: 'import.excel', label: 'Import Excel' },
  { key: 'admin.manage', label: 'Quản trị hệ thống' },
];

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  super_admin: ALL_PERMISSIONS.map(p => p.key),
  admin: ALL_PERMISSIONS.map(p => p.key),
  btc_manager: ALL_PERMISSIONS.map(p => p.key),
  warehouse_manager: ['asset.view', 'asset.lookup', 'request.approve', 'access.view', 'access.approve', 'report.view'],
  capital_dept: ['asset.view', 'request.borrow', 'request.return', 'request.mortgage', 'request.unmortgage'],
  project_dept: ['asset.view', 'request.borrow', 'request.return', 'request.split'],
  re_dept: ['asset.view', 'request.borrow', 'request.return', 'request.sell'],
  chuyen_vien: ['asset.view', 'request.borrow', 'request.return', 'request.mortgage', 'request.unmortgage', 'request.split', 'request.sell'],
  supervisor: ['report.view', 'access.view'],
  investor: ['asset.view', 'asset.checkout', 'asset.checkin'],
  viewer: ['asset.lookup'],
};

/**
 * Kiểm tra quyền thực hiện chuyển nhượng sở hữu GCN:
 * - Admin/Quản trị viên (super_admin, admin, btc_manager hoặc có quyền 'admin.manage')
 * - Quản lý kho (warehouse_manager) nhưng CHỈ ĐƯỢC PHÉP TRONG ĐÚNG KHO PHỤ TRÁCH
 */
export function canTransferAsset(profile: any, asset: any): boolean {
  if (!profile || profile.status !== 'active' || !asset) return false;
  if (['super_admin', 'admin', 'btc_manager'].includes(profile.role)) return true;
  if (profile.permissions?.includes('admin.manage')) return true;

  if (profile.role === 'warehouse_manager') {
    if (!asset.warehouse_id) return false;
    const whIds = [
      ...(profile.managed_warehouse_ids || []),
      ...(profile.assigned_warehouse_ids || []),
    ];
    return whIds.includes(asset.warehouse_id);
  }

  return false;
}

/**
 * Kiểm tra quyền thực hiện chuyển nhượng hàng loạt:
 * - Tất cả các GCN được chọn phải nằm trong phạm vi phụ trách của user
 */
export function canBulkTransferAssets(profile: any, selectedAssets: any[]): boolean {
  if (!profile || profile.status !== 'active' || !selectedAssets || selectedAssets.length === 0) return false;
  if (['super_admin', 'admin', 'btc_manager'].includes(profile.role)) return true;
  if (profile.permissions?.includes('admin.manage')) return true;

  if (profile.role === 'warehouse_manager') {
    const whIds = [
      ...(profile.managed_warehouse_ids || []),
      ...(profile.assigned_warehouse_ids || []),
    ];
    return selectedAssets.every(a => a.warehouse_id && whIds.includes(a.warehouse_id));
  }

  return false;
}

