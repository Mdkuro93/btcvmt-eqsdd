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

/**
 * Kiểm tra quyền truy cập kho:
 * Nếu role === 'admin' (hoặc 'ADMIN', 'super_admin', 'btc_manager'), tự động trả về hasAccess = true
 * cho TẤT CẢ các kho mà không cần check bảng viewer_warehouse_access.
 */
export function checkWarehouseAccess(
  profile: { role?: string; status?: string; managed_warehouse_ids?: string[]; assigned_warehouse_ids?: string[] } | null | undefined,
  warehouseId?: string,
  viewerAccessList?: Array<{ warehouse_id: string; expires_at?: string | null }>
): { hasAccess: boolean; reason: string } {
  if (!profile) {
    return { hasAccess: false, reason: 'Chưa đăng nhập' };
  }

  const role = (profile.role || '').toLowerCase();

  // 1. Quản trị viên hệ thống có toàn quyền trên TẤT CẢ các kho mà không cần check bảng viewer_warehouse_access
  if (role === 'admin' || role === 'super_admin' || role === 'btc_manager') {
    return { hasAccess: true, reason: 'Toàn quyền (Quản trị viên)' };
  }

  // 2. Quản lý kho: toàn quyền trên các kho mình phụ trách / được phân công
  if (role === 'warehouse_manager') {
    if (!warehouseId) {
      return { hasAccess: true, reason: 'Quản lý kho' };
    }
    const managed = profile.managed_warehouse_ids || [];
    const assigned = profile.assigned_warehouse_ids || [];
    const has = managed.includes(warehouseId) || assigned.includes(warehouseId);
    return {
      hasAccess: has,
      reason: has ? 'Kho phụ trách' : 'Không thuộc kho được phân công quản lý',
    };
  }

  // 3. Các phòng ban nghiệp vụ nội bộ
  if (['capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'quan_ly', 'supervisor'].includes(role)) {
    if (!warehouseId) {
      return { hasAccess: true, reason: 'Nghiệp vụ nội bộ' };
    }
    const assigned = profile.assigned_warehouse_ids || [];
    if (assigned.length === 0 || assigned.includes(warehouseId)) {
      return { hasAccess: true, reason: 'Kho được phân công nghiệp vụ' };
    }
  }

  // 4. Người dùng tra cứu (viewer/user): kiểm tra danh sách quyền được cấp (viewer_warehouse_access)
  if (warehouseId && viewerAccessList && viewerAccessList.length > 0) {
    const acc = viewerAccessList.find(a => a.warehouse_id === warehouseId);
    if (acc) {
      if (!acc.expires_at) {
        return { hasAccess: true, reason: 'Đang có quyền — không thời hạn' };
      }
      const exp = new Date(acc.expires_at).getTime();
      if (!isNaN(exp) && exp > Date.now()) {
        return { hasAccess: true, reason: 'Đang có quyền truy cập' };
      }
      return { hasAccess: false, reason: 'Quyền truy cập kho đã hết hạn' };
    }
  }

  return { hasAccess: false, reason: 'Chưa có quyền truy cập kho này' };
}

/**
 * Hàm kiểm tra nhanh quyền truy cập kho (trả về boolean):
 * Nếu role === 'admin' (hoặc 'ADMIN'), tự động trả về true cho TẤT CẢ các kho.
 */
export function hasWarehouseAccess(
  profile: { role?: string; status?: string; managed_warehouse_ids?: string[]; assigned_warehouse_ids?: string[] } | null | undefined,
  warehouseId?: string,
  viewerAccessList?: Array<{ warehouse_id: string; expires_at?: string | null }>
): boolean {
  return checkWarehouseAccess(profile, warehouseId, viewerAccessList).hasAccess;
}

