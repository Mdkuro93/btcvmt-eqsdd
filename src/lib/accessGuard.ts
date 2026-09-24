import { Profile } from '../types';

export interface LookupAccessResult {
  allowed: boolean;
  status: 'approved' | 'pending' | 'expired' | 'unauthorized' | 'rejected' | 'disabled' | 'inactive';
  message: string;
  expiresAt?: string | null;
  remainingMs?: number;
  remainingText?: string;
}

/**
 * Kiểm tra quyền tra cứu dữ liệu theo quy định:
 * Chỉ cho phép truy cập nếu status == 'approved' VÀ access_expires_at vẫn còn hạn (lớn hơn thời gian hiện tại).
 * Đồng thời cho phép các tài khoản quản trị/nội bộ (admin, warehouse_manager,...) có status == 'active' hoặc 'approved'.
 *
 * @param profile Thông tin người dùng hiện tại
 * @returns boolean - true nếu có quyền tra cứu dữ liệu, false nếu không đủ điều kiện
 */
export function canLookupData(profile: Profile | null): boolean {
  if (!profile) return false;

  // 1. Tài khoản Quản trị & Nội bộ có quyền xem/quản lý
  const internalRoles = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'investor', 'supervisor', 'quan_ly', 'chuyen_vien'];
  if (internalRoles.includes(profile.role)) {
    return profile.status === 'active' || profile.status === 'approved';
  }

  // 2. Tài khoản tra cứu (viewer): 'active' (do DB đặt khi duyệt) hoặc 'approved' (cũ) đều là đã được duyệt.
  //    Hạn thực tế được RLS áp theo từng kho (viewer_warehouse_access.expires_at).
  if (profile.status !== 'approved' && profile.status !== 'active') {
    return false;
  }

  // Nếu access_expires_at là null hoặc rỗng -> coi như chưa hết hạn / vô thời hạn
  if (!profile.access_expires_at) {
    return true;
  }

  const expireTime = new Date(profile.access_expires_at).getTime();
  if (isNaN(expireTime)) {
    return true;
  }

  return expireTime > Date.now();
}

/**
 * Bí danh cho hàm canLookupData (Guard/Middleware checker)
 */
export const canAccessLookup = canLookupData;

/**
 * Hàm kiểm tra chi tiết quyền tra cứu dữ liệu (Middleware / Guard Helper)
 * Trả về thông tin trạng thái, lý do và thời gian còn lại (nếu có).
 */
export function checkLookupAccess(profile: Profile | null): LookupAccessResult {
  if (!profile) {
    return {
      allowed: false,
      status: 'unauthorized',
      message: 'Vui lòng đăng nhập để sử dụng tính năng tra cứu dữ liệu.',
    };
  }

  // 1. Kiểm tra tài khoản nội bộ / quản trị viên
  const internalRoles = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'investor', 'supervisor', 'quan_ly', 'chuyen_vien'];
  if (internalRoles.includes(profile.role)) {
    if (profile.status === 'active' || profile.status === 'approved') {
      return {
        allowed: true,
        status: 'approved',
        message: 'Tài khoản nội bộ có đầy đủ quyền tra cứu dữ liệu.',
      };
    }
    return {
      allowed: false,
      status: profile.status as any,
      message: `Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu`,
    };
  }

  // 2. Kiểm tra tài khoản người dùng tra cứu:
  // Điều kiện: status 'active' (hoặc 'approved' cũ). Hạn tra cứu thực tế nằm ở từng kho (RLS),
  // access_expires_at chỉ còn là hạn chung tùy chọn.
  if (profile.status !== 'approved' && profile.status !== 'active') {
    return {
      allowed: false,
      status: (profile.status as any) || 'pending',
      message: 'Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu',
    };
  }

  // Nếu access_expires_at là null -> Được phép tra cứu vô thời hạn
  if (!profile.access_expires_at) {
    return {
      allowed: true,
      status: 'approved',
      remainingText: 'theo hạn từng kho (xem mục "Quyền truy cập của tôi")',
      message: 'Tài khoản đã được phê duyệt và được phép tra cứu dữ liệu của các kho được cấp quyền.',
    };
  }

  const expireTime = new Date(profile.access_expires_at).getTime();
  const now = Date.now();

  if (isNaN(expireTime) || expireTime <= now) {
    return {
      allowed: false,
      status: 'expired',
      expiresAt: profile.access_expires_at,
      message: 'Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu',
    };
  }

  const remainingMs = expireTime - now;
  const remainingText = formatRemainingDuration(remainingMs);

  return {
    allowed: true,
    status: 'approved',
    expiresAt: profile.access_expires_at,
    remainingMs,
    remainingText,
    message: `Quyền tra cứu còn hiệu lực trong ${remainingText} (đến ${new Date(profile.access_expires_at).toLocaleString('vi-VN')}).`,
  };
}

/**
 * Định dạng thời lượng còn lại thành văn bản dễ đọc tiếng Việt
 */
export function formatRemainingDuration(ms: number): string {
  if (ms <= 0) return 'Đã hết hạn';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} ngày ${hours} giờ`;
  }
  if (hours > 0) {
    return `${hours} giờ ${minutes} phút`;
  }
  return `${Math.max(1, minutes)} phút`;
}

/**
 * Kiểm tra xem thời gian hết hạn đã qua chưa
 */
export function isAccessExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return isNaN(t) || t <= Date.now();
}