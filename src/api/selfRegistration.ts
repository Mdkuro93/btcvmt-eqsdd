import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface RegistrationWarehouse {
  id: string;
  name: string;
  code: string | null;
  is_central: boolean | null;
}

export interface SelfRegistrationPayload {
  username: string;
  password: string;
  fullName: string;
  phone?: string;
  organization?: string;
  purpose?: string;
  warehouseIds: string[];
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const BANNED_PASSWORDS = ['123456', '12345678', 'password123', 'password'];

/**
 * Danh sách kho cho người CHƯA đăng nhập chọn khi đăng ký (RPC list_registration_warehouses, migration 0044).
 * Không đọc thẳng bảng warehouses vì RLS không cho người chưa đăng nhập đọc.
 */
export async function fetchRegistrationWarehouses(): Promise<RegistrationWarehouse[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase nên chưa thể đăng ký tài khoản.');
  }
  const { data, error } = await supabase.rpc('list_registration_warehouses');
  if (error) {
    throw new Error(
      'Không tải được danh sách kho: ' + error.message +
      ' (nếu là lỗi "function does not exist" thì cần chạy migration 0044 trên Supabase).'
    );
  }
  return (data || []) as RegistrationWarehouse[];
}

/**
 * Tự đăng ký tài khoản tra cứu. Chỉ gọi auth.signUp MỘT lần.
 * Hồ sơ (vai trò viewer, trạng thái pending) và các yêu cầu xin quyền theo kho
 * do trigger handle_new_user tạo trong cùng một giao dịch (migration 0044).
 * Vai trò/trạng thái KHÔNG lấy từ trình duyệt.
 */
export async function registerSelfService(payload: SelfRegistrationPayload): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase nên chưa thể đăng ký tài khoản.');
  }

  const username = payload.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Tên đăng nhập gồm 3–30 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  if (payload.password.length < 8) {
    throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
  }
  if (BANNED_PASSWORDS.includes(payload.password.trim().toLowerCase())) {
    throw new Error('Mật khẩu quá dễ đoán, vui lòng chọn mật khẩu khác.');
  }
  if (!payload.fullName.trim()) {
    throw new Error('Vui lòng nhập họ và tên.');
  }
  if (!payload.warehouseIds || payload.warehouseIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một kho để xin quyền tra cứu.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: `${username}@btcvmt.vn`,
    password: payload.password,
    options: {
      data: {
        registration_source: 'self',
        username,
        full_name: payload.fullName.trim(),
        phone: payload.phone?.trim() || null,
        organization: payload.organization?.trim() || null,
        purpose: payload.purpose?.trim() || null,
        warehouse_ids: payload.warehouseIds,
      },
    },
  });

  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.');
    }
    if (msg.includes('database error')) {
      throw new Error(
        'Hệ thống không lưu được hồ sơ đăng ký. Kiểm tra tên đăng nhập/kho đã chọn, hoặc báo Quản trị viên kiểm tra migration 0044.'
      );
    }
    throw new Error(error.message || 'Đăng ký tài khoản thất bại.');
  }
  if (!data?.user) {
    throw new Error('Không nhận được thông tin tài khoản sau khi đăng ký.');
  }

  // Nếu dự án tắt "Confirm email", Supabase trả về phiên đăng nhập ngay. Đăng xuất để người dùng
  // chủ động đăng nhập lại (tài khoản chờ duyệt chỉ vào được trang "Quyền truy cập của tôi").
  if (data.session) {
    await supabase.auth.signOut().catch(() => {});
  }
}