import { createClient } from '@supabase/supabase-js';
import { Profile, AppUser, AppUserSession } from '../types';
import { canLookupData, checkLookupAccess } from './accessGuard';
import { mockStore } from './mockStore';

// Direct Supabase configuration to prevent ERR_NAME_NOT_RESOLVED
const SUPABASE_URL = 'https://dkzfjwrrlnupdflrxxao.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremZqd3JybG51cGRmbHJ4eGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTgxNTgsImV4cCI6MjEwMzk5NDE1OH0.gaOgF8u-_rkg2qNsT2jePAFrjDyTHyXK58hZHwTGvRQ';

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;
export const isSupabaseConfigured = true;

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const APP_USER_SESSION_KEY = 'app_user_session';

/**
 * Lưu thông tin phiên đăng nhập app_user vào SessionStorage và LocalStorage
 */
export function saveAppUserSession(session: AppUserSession): void {
  try {
    const serialized = JSON.stringify(session);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(APP_USER_SESSION_KEY, serialized);
      localStorage.setItem(APP_USER_SESSION_KEY, serialized);
    }
  } catch (err) {
    console.warn('Lỗi khi lưu session app_user:', err);
  }
}

/**
 * Đọc phiên đăng nhập app_user từ SessionStorage hoặc LocalStorage
 */
export function getStoredAppUserSession(): AppUserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(APP_USER_SESSION_KEY) || localStorage.getItem(APP_USER_SESSION_KEY);
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
 * Xóa thông tin phiên đăng nhập app_user
 */
export function clearAppUserSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(APP_USER_SESSION_KEY);
    localStorage.removeItem(APP_USER_SESSION_KEY);
  } catch (err) {
    console.warn('Lỗi xóa session app_user:', err);
  }
}

/**
 * Đăng ký tài khoản người dùng thuần bằng Tên đăng nhập (Username)
 * Gọi supabase.rpc('register_user', { p_username, p_password }).
 * Đăng ký xong tự động lưu trạng thái pending.
 */
export async function registerUser(p_username: string, p_password: string): Promise<AppUser> {
  const cleanUsername = p_username.trim().toLowerCase();
  if (!cleanUsername) {
    throw new Error('Vui lòng nhập Tên đăng nhập.');
  }
  if (!p_password || p_password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('register_user', {
        p_username: cleanUsername,
        p_password,
      });

      if (error) {
        throw new Error(error.message || 'Không thể đăng ký tài khoản qua RPC register_user.');
      }

      const res = Array.isArray(data) ? data[0] : data;
      const registeredUser: AppUser = {
        id: res?.id || `user-${Date.now()}`,
        username: res?.username || cleanUsername,
        role: res?.role || 'user',
        status: res?.status || 'pending',
        access_expires_at: res?.access_expires_at || null,
        created_at: res?.created_at || new Date().toISOString(),
      };

      // Đồng bộ vào mockStore local để dev/admin test
      try {
        const users = mockStore.getAppUsers();
        if (!users.some(u => u.username === cleanUsername)) {
          mockStore.saveAppUsers([registeredUser, ...users]);
        }
      } catch {}

      return registeredUser;
    } catch (err: any) {
      // Nếu RPC bị lỗi hàm không tồn tại hoặc lỗi mạng, cung cấp fallback thông minh
      if (err?.message?.includes('function') || err?.code === 'PGRST202') {
        console.warn('RPC register_user chưa được tạo trong Supabase, thử chèn trực tiếp bảng app_users:', err);
        const { data: insertData, error: insertError } = await supabase
          .from('app_users')
          .insert({
            username: cleanUsername,
            password: p_password,
            role: 'user',
            status: 'pending',
            access_expires_at: null,
          })
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message || 'Lỗi khi tạo tài khoản vào bảng app_users.');
        }

        return insertData as AppUser;
      }
      throw err instanceof Error ? err : new Error('Không thể đăng ký tài khoản.');
    }
  }

  // Chế độ Dev/Local Mock
  return mockStore.registerAppUser(cleanUsername, p_password);
}

/**
 * Đăng nhập bằng Tên đăng nhập thuần túy (Username)
 * Gọi supabase.rpc('login_user', { p_username, p_password }).
 * Lưu thông tin trả về (id, username, role, status, access_expires_at) vào Session/LocalStorage.
 */
export async function loginUser(p_username: string, p_password: string): Promise<AppUserSession> {
  const cleanUsername = p_username.trim().toLowerCase();
  if (!cleanUsername) {
    throw new Error('Vui lòng nhập Tên đăng nhập.');
  }
  if (!p_password) {
    throw new Error('Vui lòng nhập Mật khẩu.');
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_username: cleanUsername,
        p_password,
      });

      if (error) {
        throw new Error(error.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }

      const res = Array.isArray(data) ? data[0] : data;
      if (!res || !res.id) {
        throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
      }

      const sessionData: AppUserSession = {
        id: String(res.id),
        username: res.username || cleanUsername,
        role: res.role || 'user',
        status: res.status || 'pending',
        access_expires_at: res.access_expires_at || null,
        full_name: res.full_name || res.username || cleanUsername,
      };

      // Lưu vào Session/LocalStorage theo đúng yêu cầu
      saveAppUserSession(sessionData);

      return sessionData;
    } catch (err: any) {
      // Nếu RPC login_user chưa được tạo, thử select trực tiếp từ bảng app_users
      if (err?.message?.includes('function') || err?.code === 'PGRST202') {
        console.warn('RPC login_user chưa sẵn sàng, thử kiểm tra bảng app_users:', err);
        const { data: userData, error: userError } = await supabase
          .from('app_users')
          .select('id, username, role, status, access_expires_at, password')
          .eq('username', cleanUsername)
          .maybeSingle();

        if (userError || !userData) {
          throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
        }

        if (userData.password && userData.password !== p_password) {
          throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
        }

        const sessionData: AppUserSession = {
          id: String(userData.id),
          username: userData.username,
          role: userData.role || 'user',
          status: userData.status || 'pending',
          access_expires_at: userData.access_expires_at || null,
          full_name: userData.username,
        };

        saveAppUserSession(sessionData);
        return sessionData;
      }
      throw err instanceof Error ? err : new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
  }

  // Chế độ Dev/Local Mock
  const user = mockStore.loginAppUser(cleanUsername, p_password);
  if (!user) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
  }

  const sessionData: AppUserSession = {
    id: String(user.id),
    username: user.username,
    role: user.role,
    status: user.status,
    access_expires_at: user.access_expires_at,
    full_name: user.full_name || user.username,
  };

  saveAppUserSession(sessionData);
  return sessionData;
}

/**
 * Lấy danh sách tài khoản từ bảng app_users (dành cho Admin Dashboard)
 */
export async function fetchAppUsers(filters?: { status?: string }): Promise<AppUser[]> {
  if (isSupabaseConfigured) {
    let query = supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) {
      throw new Error(error.message || 'Lỗi lấy danh sách app_users từ Supabase.');
    }
    return (data as AppUser[]) || [];
  }

  let users = mockStore.getAppUsers();
  if (filters?.status) {
    users = users.filter(u => u.status === filters.status);
  }
  return users;
}

/**
 * Admin phê duyệt tài khoản app_users và thiết lập ngày hết hạn tra cứu
 */
export async function approveAppUser(userId: string, accessExpiresAt: string): Promise<{ success: boolean; data?: any }> {
  if (isSupabaseConfigured) {
    const { data, error } = await withTimeout(
      supabase
        .from('app_users')
        .update({
          status: 'approved',
          access_expires_at: accessExpiresAt,
        })
        .eq('id', userId)
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error(error.message || 'Lỗi khi cập nhật app_users trên Supabase.');
    }

    // Cập nhật cả mockStore để đồng bộ ngay lập tức trên UI
    try {
      mockStore.approveAppUser(userId, accessExpiresAt);
    } catch {}

    return { success: true, data: data || { id: userId, status: 'approved', access_expires_at: accessExpiresAt } };
  }

  const updated = mockStore.approveAppUser(userId, accessExpiresAt);
  return { success: true, data: updated };
}

/**
 * Admin từ chối tài khoản app_users
 */
export async function rejectAppUser(userId: string): Promise<{ success: boolean; data?: any }> {
  if (isSupabaseConfigured) {
    const { data, error } = await withTimeout(
      supabase
        .from('app_users')
        .update({
          status: 'rejected',
        })
        .eq('id', userId)
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      throw new Error(error.message || 'Lỗi khi từ chối app_users trên Supabase.');
    }

    try {
      mockStore.rejectAppUser(userId);
    } catch {}
    return { success: true, data };
  }

  const updated = mockStore.rejectAppUser(userId);
  return { success: true, data: updated };
}

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  username?: string;
  phone?: string;
  organization?: string;
  purpose?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

/**
 * Lấy thông tin profile từ bảng 'profiles' theo userId
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, regions(name), areas(name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Lỗi truy vấn getProfile:', error);
      return null;
    }
    return (data as Profile) || null;
  } catch (err) {
    console.warn('Lỗi ngoại lệ khi gọi getProfile:', err);
    return null;
  }
}

/**
 * Lấy thông tin profile theo email
 */
export async function fetchProfileByEmail(email: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, regions(name), areas(name)')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (error) {
      console.warn('Lỗi truy vấn fetchProfileByEmail:', error);
      return null;
    }
    return (data as Profile) || null;
  } catch (err) {
    console.warn('Lỗi ngoại lệ fetchProfileByEmail:', err);
    return null;
  }
}

/**
 * Hàm Đăng ký tài khoản (Auth signUp)
 * Tạo tài khoản trong Supabase Auth và tự động tạo bản ghi trong bảng `profiles`
 * với vai trò role = 'user', trạng thái status = 'pending', access_expires_at = null.
 */
export async function signUp(params: SignUpParams): Promise<{
  user: any;
  session: any;
  profile: Profile | null;
  requiresEmailConfirmation?: boolean;
}> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanFullName = params.fullName.trim();
  const cleanUsername = params.username?.trim().toLowerCase() || cleanEmail.split('@')[0];

  if (!isSupabaseConfigured) {
    throw new Error('Chưa cấu hình Supabase URL hoặc Anon Key trong file .env.local.');
  }

  // 1. Đăng ký tài khoản Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password: params.password,
    options: {
      data: {
        full_name: cleanFullName,
        username: cleanUsername,
        phone: params.phone?.trim() || null,
        organization: params.organization?.trim() || null,
        purpose: params.purpose?.trim() || null,
        role: 'user',
      },
    },
  });

  if (authError) {
    throw new Error(authError.message || 'Không thể đăng ký tài khoản trên Supabase.');
  }

  if (!authData.user) {
    throw new Error('Không nhận được thông tin người dùng sau khi đăng ký.');
  }

  // 2. Tạo bản ghi ban đầu trong bảng 'profiles'
  // Theo quy định: role = 'user', status = 'pending', access_expires_at = null
  const newProfileRecord: Profile = {
    id: authData.user.id,
    email: cleanEmail,
    username: cleanUsername,
    full_name: cleanFullName,
    role: 'user',
    status: 'pending',
    access_expires_at: null,
    permissions: ['asset.lookup'],
    region_id: null,
    area_id: null,
    project_ids: null,
    managed_warehouse_ids: null,
    phone: params.phone?.trim() || null,
    organization: params.organization?.trim() || null,
    purpose: params.purpose?.trim() || null,
    created_at: new Date().toISOString(),
  };

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .upsert(newProfileRecord)
    .select()
    .single();

  if (profileError) {
    console.warn('Cảnh báo: Không thể lưu profile vào bảng profiles:', profileError);
  }

  return {
    user: authData.user,
    session: authData.session,
    profile: (profileData as Profile) || newProfileRecord,
    requiresEmailConfirmation: !authData.session,
  };
}

/**
 * Hàm Đăng nhập bằng Email và Mật khẩu (Auth signIn)
 * Xác thực thông qua Supabase Auth và tự động lấy thông tin từ bảng `profiles`.
 */
export async function signIn(params: SignInParams): Promise<{
  user: any;
  session: any;
  profile: Profile | null;
}> {
  if (!isSupabaseConfigured) {
    throw new Error('Chưa cấu hình Supabase URL hoặc Anon Key trong file .env.local.');
  }

  const cleanEmail = params.email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: params.password,
  });

  if (error) {
    throw new Error(error.message || 'Email hoặc mật khẩu không chính xác.');
  }

  if (!data.user) {
    throw new Error('Không tìm thấy tài khoản người dùng.');
  }

  // Lấy thông tin từ bảng profiles
  let profile = await getProfile(data.user.id);
  if (!profile) {
    profile = await fetchProfileByEmail(cleanEmail);
  }

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

/**
 * Hàm Đăng xuất tài khoản (Auth signOut)
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Lỗi khi đăng xuất Supabase:', error);
    }
  }
}

// Re-export Access Guard Functions for convenience
export { canLookupData, checkLookupAccess };
export const canAccessLookup = canLookupData;

/**
 * Test Supabase connection and table availability
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string; error?: any }> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      message: 'Chưa cấu hình VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong biến môi trường.',
    };
  }

  try {
    const { error } = await supabase.from('assets').select('id', { head: true, count: 'exact' });
    if (error) {
      return {
        ok: false,
        message: `Lỗi kết nối bảng assets: ${error.message} (${error.code || 'UNKNOWN'})`,
        error,
      };
    }
    return {
      ok: true,
      message: 'Kết nối Supabase thành công.',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Không thể kết nối đến Supabase: ${err?.message || 'Lỗi mạng hoặc URL không hợp lệ'}`,
      error: err,
    };
  }
}

export const DEFAULT_READ_TIMEOUT = 5000;
export const DEFAULT_WRITE_TIMEOUT = 8000;

/**
 * Timeout wrapper for Supabase queries.
 * Rejects if the promise takes longer than `timeoutMs`.
 * Default timeout is 5000ms for reads and 8000ms for write operations.
 */
export async function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  timeoutMs: number = DEFAULT_READ_TIMEOUT,
  fallbackMsg?: string
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(fallbackMsg || `Quá thời gian phản hồi từ Supabase (Timeout ${timeoutMs / 1000}s)`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result as T;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Safe Supabase query executor with timeout.
 * mockStore fallback is ONLY used when isSupabaseConfigured === false.
 * When isSupabaseConfigured === true, any error or timeout is thrown immediately.
 */
export async function safeSupabaseQuery<T>(
  queryPromise: PromiseLike<{ data: T | null; error: any; count?: number | null }>,
  fallbackFn: () => T | Promise<T>,
  timeoutMs: number = DEFAULT_READ_TIMEOUT
): Promise<{ data: T; count?: number }> {
  if (!isSupabaseConfigured) {
    const fallbackData = await fallbackFn();
    return { data: fallbackData };
  }

  const res = await withTimeout(queryPromise, timeoutMs);
  if (res.error) throw res.error;
  return {
    data: res.data as T,
    count: res.count !== undefined && res.count !== null ? res.count : undefined,
  };
}

