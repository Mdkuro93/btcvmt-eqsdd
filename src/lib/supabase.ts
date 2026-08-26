import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder.supabase.co') &&
  supabaseUrl.startsWith('https://')
);

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Timeout wrapper for Supabase queries.
 * Rejects if the promise takes longer than `timeoutMs` (default 3000ms / 3 seconds).
 * This ensures the application never hangs and immediately falls back to mockStore.
 */
export async function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  timeoutMs: number = 3000,
  fallbackMsg: string = 'Supabase request exceeded 3000ms timeout'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(fallbackMsg));
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
 * Safe Supabase query executor with automatic 3s timeout and fallback function.
 */
export async function safeSupabaseQuery<T>(
  queryPromise: PromiseLike<{ data: T | null; error: any; count?: number | null }>,
  fallbackFn: () => T | Promise<T>,
  timeoutMs: number = 3000
): Promise<{ data: T; count?: number }> {
  if (!isSupabaseConfigured) {
    const fallbackData = await fallbackFn();
    return { data: fallbackData };
  }

  try {
    const res = await withTimeout(queryPromise, timeoutMs);
    if (res.error) throw res.error;
    return {
      data: res.data as T,
      count: res.count !== undefined && res.count !== null ? res.count : undefined,
    };
  } catch (err) {
    console.warn(`Supabase query failed or timed out (${timeoutMs}ms), falling back to mockStore:`, err);
    const fallbackData = await fallbackFn();
    return { data: fallbackData };
  }
}
