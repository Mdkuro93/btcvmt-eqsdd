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
  warehouse_manager: [
    'asset.view',
    'asset.lookup',
    'asset.create',
    'asset.edit',
    'request.approve',
    'access.view',
    'access.approve',
    'report.view',
    'import.excel'
  ],
  capital_dept: [
    'asset.view',
    'asset.lookup',
    'request.borrow',
    'request.return',
    'request.mortgage',
    'request.unmortgage'
  ],
  project_dept: [
    'asset.view',
    'asset.lookup',
    'request.borrow',
    'request.return',
    'request.split'
  ],
  re_dept: [
    'asset.view',
    'asset.lookup',
    'request.borrow',
    'request.return',
    'request.sell'
  ],
  investor: [
    'asset.view',
    'asset.lookup',
    'request.borrow',
    'request.return'
  ],
  supervisor: [
    'asset.view',
    'asset.lookup',
    'report.view',
    'access.view'
  ],
  chuyen_vien: [
    'asset.view',
    'asset.lookup',
    'request.borrow',
    'request.return',
    'request.mortgage',
    'request.unmortgage',
    'request.split',
    'request.sell'
  ],
  quan_ly: ALL_PERMISSIONS.map(p => p.key),
  viewer: ['asset.lookup'],
  user: ['asset.lookup'],
  nguoi_dung: ['asset.lookup'],
};

/**
 * Lấy danh sách quyền hiệu lực của tài khoản (Effective Permissions):
 * - Nếu là super_admin / admin / btc_manager: luôn hưởng toàn bộ quyền hệ thống.
 * - Nếu tài khoản có permissions tùy biến (mảng không rỗng): trả về mảng quyền tùy biến đó.
 * - Nếu permissions là null, undefined hoặc rỗng: tự động lấy toàn bộ quyền mặc định theo vai trò (DEFAULT_PERMISSIONS_BY_ROLE).
 */
export function getEffectivePermissions(profile: { role?: string; permissions?: string[] | null } | null | undefined): string[] {
  if (!profile || !profile.role) return [];
  if (['super_admin', 'admin', 'btc_manager'].includes(profile.role)) {
    return ALL_PERMISSIONS.map(p => p.key);
  }
  if (profile.permissions && Array.isArray(profile.permissions) && profile.permissions.length > 0) {
    return profile.permissions;
  }
  return DEFAULT_PERMISSIONS_BY_ROLE[profile.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'] || [];
}

/**
 * Kiểm tra xem tài khoản này có đang bị tùy biến riêng quyền hạn hay đang theo mặc định của vai trò
 */
export function isCustomizedPermissions(profile: { role?: string; permissions?: string[] | null } | null | undefined): boolean {
  if (!profile || !profile.role) return false;
  if (['super_admin', 'admin', 'btc_manager'].includes(profile.role)) return false;
  return Boolean(profile.permissions && Array.isArray(profile.permissions) && profile.permissions.length > 0);
}

/**
 * Kiểm tra quyền cụ thể của người dùng
 */
export function hasPermission(profile: { role?: string; permissions?: string[] | null } | null | undefined, permKey: string): boolean {
  return getEffectivePermissions(profile).includes(permKey);
}

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

