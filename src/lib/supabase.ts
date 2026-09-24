import { createClient } from '@supabase/supabase-js';
import { Profile, AppUser, AppUserSession } from '../types';
import { canLookupData, checkLookupAccess } from './accessGuard';
import { mockStore } from './mockStore';

// Direct Supabase configuration with environment variables support
const FALLBACK_SUPABASE_URL = 'https://dkzfjwrrlnupdflrxxao.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremZqd3JybG51cGRmbHJ4eGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTgxNTgsImV4cCI6MjEwMzk5NDE1OH0.gaOgF8u-_rkg2qNsT2jePAFrjDyTHyXK58hZHwTGvRQ';

// Kiểm tra URL THỰC SỰ hợp lệ (đúng https://*.supabase.co), thay vì chỉ so khớp
// đúng 1 chuỗi placeholder cụ thể như "your-project" — cách cũ có thể lọt qua
// nếu container đưa vào 1 giá trị placeholder khác, gây crash toàn bộ app
// ("Invalid supabaseUrl") ngay lúc khởi động (màn hình trắng).
function isValidSupabaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('supabase.co');
  } catch {
    return false;
  }
}

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_URL = (isValidSupabaseUrl(envUrl) ? envUrl : FALLBACK_SUPABASE_URL).trim();

const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY = (
  typeof envKey === 'string' && envKey.trim().length > 20 && !envKey.includes('your-anon-key')
    ? envKey
    : FALLBACK_SUPABASE_ANON_KEY
).trim();

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Initialize Supabase Client Singleton
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'x-application-name': 'btcvmt-eqsdd',
    },
  },
});

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
 * Checks if a Supabase error is caused by a missing table, column, relation or missing schema cache.
 */
export function isSchemaMissingError(err: any): boolean {
  if (!err) return false;
  const code = err.code || err.status || '';
  const message = String(err.message || err.details || err.hint || '');
  
  if (
    code === 'PGRST205' || // Could not find table in schema cache
    code === '42P01' ||    // relation does not exist
    code === 'PGRST202' || // function not found in schema cache
    code === 'PGRST200' || // Could not embed / relation not found
    code === 'PGRST201' || // multiple relationships found
    code === 'PGRST204' || // column not found in schema cache
    code === '42703' ||    // undefined_column
    code === '42P17' ||    // infinite recursion detected in policy
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find the table') ||
    message.includes('relation') ||
    message.includes('Could not find') ||
    message.includes('infinite recursion') ||
    message.includes('foreign key relationship')
  ) {
    return true;
  }
  return false;
}

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