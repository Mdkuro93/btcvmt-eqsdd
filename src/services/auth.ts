import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AppUserSession, Role } from '../types';
import { mockStore } from '../lib/mockStore';

export const APP_USER_SESSION_KEY = 'app_user_session';

export interface AppUserLoginResult {
  success: boolean;
  message?: string;
  id?: string;
  username?: string;
  role?: string;
  status?: string;
  access_expires_at?: string | null;
}

export interface AppUserRegisterResult {
  success: boolean;
  message: string;
}

/**
 * 1. Đăng ký tài khoản:
 * Sử dụng supabase.auth.signUp()
 */
export async function registerUser(p_username: string, p_password: string): Promise<AppUserRegisterResult> {
  const cleanUsername = p_username.trim().toLowerCase();

  if (!cleanUsername) {
    throw new Error('Vui lòng nhập Tên đăng nhập hoặc Email.');
  }
  if (!p_password || p_password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@btcvmt.internal`;

  if (isSupabaseConfigured) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: p_password,
      options: {
        data: {
          username: cleanUsername,
          role: 'user',
          status: 'pending',
        }
      }
    });

    if (error) {
      console.error('Lỗi đăng ký tài khoản Supabase Auth:', error);
      if (error.message?.toLowerCase().includes('already registered')) {
        throw new Error('Tên đăng nhập (hoặc email) này đã tồn tại trong hệ thống.');
      }
      throw new Error(error.message || 'Đăng ký tài khoản thất bại.');
    }

    return {
      success: true,
      message: 'Đăng ký tài khoản thành công! Hồ sơ đang chờ Quản trị viên phê duyệt.',
    };
  }

  // Fallback Dev / Mock mode
  const currentAppUsers = mockStore.getAppUsers();
  const existing = currentAppUsers.find(u => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    throw new Error('Tên đăng nhập này đã tồn tại trong hệ thống.');
  }

  const newUser: AppUserSession = {
    id: `app-user-${Date.now()}`,
    username: cleanUsername,
    role: 'user',
    status: 'pending',
    access_expires_at: null,
  };

  mockStore.saveAppUsers([newUser, ...currentAppUsers]);
  return {
    success: true,
    message: 'Đăng ký tài khoản thành công! Hồ sơ đang chờ Quản trị viên phê duyệt.',
  };
}

/**
 * 2. Đăng nhập:
 * Sử dụng supabase.auth.signInWithPassword()
 */
export async function loginUser(p_username: string, p_password: string): Promise<AppUserSession> {
  const cleanUsername = p_username.trim().toLowerCase();

  if (!cleanUsername) {
    throw new Error('Vui lòng nhập Tên đăng nhập hoặc Email.');
  }
  if (!p_password) {
    throw new Error('Vui lòng nhập Mật khẩu.');
  }

  let session: AppUserSession | null = null;
  const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@btcvmt.internal`;

  if (isSupabaseConfigured) {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: p_password,
    });

    if (authError || !authData.user) {
      console.error('Lỗi đăng nhập Supabase Auth:', authError);
      throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }

    // Lấy thông tin profile để kiểm tra quyền và trạng thái
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Không thể tải thông tin hồ sơ người dùng.');
    }

    if (profile.status === 'pending') {
      await supabase.auth.signOut();
      throw new Error('Tài khoản của bạn đang chờ quản trị viên duyệt.');
    }

    if (profile.status === 'rejected') {
      await supabase.auth.signOut();
      throw new Error('Tài khoản của bạn đã bị từ chối.');
    }

    if (profile.status === 'disabled' || profile.status === 'inactive') {
      await supabase.auth.signOut();
      throw new Error('Tài khoản của bạn đã bị vô hiệu hóa.');
    }

    if (profile.access_expires_at && new Date(profile.access_expires_at) < new Date()) {
      await supabase.auth.signOut();
      throw new Error('Tài khoản của bạn đã hết hạn tra cứu.');
    }

    session = {
      id: profile.id,
      username: profile.username || cleanUsername,
      role: profile.role,
      status: profile.status,
      access_expires_at: profile.access_expires_at,
    };
  } else {
    // Fallback Dev / Mock mode
    const appUsers = mockStore.getAppUsers();
    const found = appUsers.find(u => u.username.toLowerCase() === cleanUsername);
    if (!found) {
      throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
    if (p_password !== '123456' && p_password !== 'password123') {
      throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
    session = {
      id: found.id,
      username: found.username,
      role: found.role,
      status: found.status,
      access_expires_at: found.access_expires_at,
      full_name: found.username,
    };
  }

  if (!session || !session.id) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
  }

  // Lưu thông tin trả về vào Session/LocalStorage để duy trì phiên đăng nhập
  saveAppUserSession(session);

  return session;
}
/**
 * Lưu thông tin phiên đăng nhập vào LocalStorage & SessionStorage
 */
export function saveAppUserSession(session: AppUserSession): void {
  try {
    const payload = JSON.stringify({
      id: session.id,
      username: session.username,
      role: session.role,
      status: session.status,
      access_expires_at: session.access_expires_at,
    });
    if (typeof window !== 'undefined') {
      localStorage.setItem(APP_USER_SESSION_KEY, payload);
      sessionStorage.setItem(APP_USER_SESSION_KEY, payload);
    }
  } catch (err) {
    console.warn('Lỗi khi lưu app_user_session vào LocalStorage:', err);
  }
}

/**
 * Đọc phiên đăng nhập từ LocalStorage hoặc SessionStorage
 */
export function getStoredAppUserSession(): AppUserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(APP_USER_SESSION_KEY) || sessionStorage.getItem(APP_USER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.username) {
      return parsed as AppUserSession;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Xóa thông tin phiên làm việc khi Đăng xuất
 */
export function clearAppUserSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(APP_USER_SESSION_KEY);
    sessionStorage.removeItem(APP_USER_SESSION_KEY);
  }
}

/**
 * Kiểm tra điều kiện Tra cứu:
 * Điều kiện: status === 'approved' VÀ (access_expires_at chưa hết hạn hoặc null).
 * Nếu thỏa mãn: Cho phép sử dụng chức năng tra cứu dữ liệu.
 * Nếu chưa thỏa mãn: Hiển thị thông báo "Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu".
 */
export function checkUserLookupAccess(session: AppUserSession | null | { status?: string; role?: string; access_expires_at?: string | null }): {
  allowed: boolean;
  message: string;
  remainingText?: string;
  isExpired?: boolean;
} {
  if (!session) {
    return {
      allowed: false,
      message: 'Vui lòng đăng nhập để tra cứu dữ liệu.',
    };
  }

  // Tài khoản đặc quyền (Quản trị viên, Thủ kho, Ban TC...)
  const privilegedRoles = ['admin', 'super_admin', 'btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept'];
  if (session.role && privilegedRoles.includes(session.role)) {
    if (session.status === 'active' || session.status === 'approved') {
      return { allowed: true, message: 'Được phép tra cứu dữ liệu.' };
    }
  }

  // 1. Kiểm tra status: Phải là 'approved'
  if (session.status !== 'approved') {
    return {
      allowed: false,
      message: 'Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu',
    };
  }

  // 2. Kiểm tra access_expires_at: Chưa hết hạn hoặc null (null là không giới hạn hạn)
  if (session.access_expires_at) {
    const expireTime = new Date(session.access_expires_at).getTime();
    if (isNaN(expireTime) || expireTime <= Date.now()) {
      return {
        allowed: false,
        isExpired: true,
        message: 'Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu',
      };
    }

    const remainingMs = expireTime - Date.now();
    const totalMinutes = Math.floor(remainingMs / (1000 * 60));
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const remainingText = days > 0 ? `${days} ngày ${hours} giờ` : `${totalHours} giờ ${totalMinutes % 60} phút`;

    return {
      allowed: true,
      remainingText,
      message: 'Được phép tra cứu dữ liệu.',
    };
  }

  // access_expires_at là null -> Cho phép tra cứu không giới hạn
  return {
    allowed: true,
    remainingText: 'Không giới hạn',
    message: 'Được phép tra cứu dữ liệu.',
  };
}

/**
 * Lấy toàn bộ danh sách tài khoản từ bảng app_users bằng query:
 * supabase.from('app_users').select('*')
 */
export async function fetchAllAppUsers(): Promise<AppUserSession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Lỗi query supabase.from("app_users").select("*"):', error);
        return [];
      }
      return (data || []) as AppUserSession[];
    } catch (err) {
      console.warn('Lỗi kết nối khi lấy danh sách app_users:', err);
      return [];
    }
  }

  return mockStore.getAppUsers();
}

/**
 * Lấy danh sách người dùng pending trong bảng app_users
 */
export async function fetchPendingAppUsers(): Promise<AppUserSession[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, role, status, access_expires_at, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Lỗi tải danh sách app_users pending:', error);
        return [];
      }
      return (data || []) as AppUserSession[];
    } catch (err) {
      console.warn('Lỗi kết nối khi tải app_users pending:', err);
      return [];
    }
  }

  const mockUsers = mockStore.getAppUsers();
  return mockUsers.filter(u => u.status === 'pending');
}

/**
 * Phê duyệt người dùng: Cập nhật status = 'approved' và thiết lập ngày hết hạn access_expires_at
 */
export async function approveAppUser(userId: string, accessExpiresAt: string | null): Promise<boolean> {
  if (isSupabaseConfigured) {
    // Thử gọi hàm RPC approve_user nếu database có hỗ trợ
    try {
      const { error: rpcError } = await supabase.rpc('approve_user', {
        p_user_id: userId,
        p_access_expires_at: accessExpiresAt,
      });
      if (!rpcError) return true;
    } catch {
      // Bỏ qua lỗi và cập nhật trực tiếp bảng app_users
    }

    const { error } = await supabase
      .from('app_users')
      .update({
        status: 'approved',
        access_expires_at: accessExpiresAt,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || 'Không thể cập nhật trạng thái phê duyệt.');
    }
    return true;
  }

  // Mock fallback
  const mockUsers = mockStore.getAppUsers();
  const updated = mockUsers.map(u => 
    u.id === userId 
      ? { ...u, status: 'approved' as const, access_expires_at: accessExpiresAt } 
      : u
  );
  mockStore.saveAppUsers(updated);
  return true;
}

/**
 * Từ chối người dùng: Cập nhật status = 'rejected' và xóa ngày hết hạn
 */
export async function rejectAppUser(userId: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('app_users')
      .update({
        status: 'rejected',
        access_expires_at: null,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || 'Không thể từ chối tài khoản.');
    }
    return true;
  }

  // Mock fallback
  const mockUsers = mockStore.getAppUsers();
  const updated = mockUsers.map(u => 
    u.id === userId 
      ? { ...u, status: 'rejected' as const, access_expires_at: null } 
      : u
  );
  mockStore.saveAppUsers(updated);
  return true;
}
