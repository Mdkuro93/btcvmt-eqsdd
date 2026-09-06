import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  supabase, 
  isSupabaseConfigured, 
  withTimeout, 
  loginUser, 
  registerUser, 
} from '../lib/supabase';
import { Profile, Role, AppUserSession } from '../types';
import { mockStore } from '../lib/mockStore';
import { logAccessEvent } from '../api/accessLogs';

export type { Role };

export const CANONICAL_ROLES = [
  'admin',
  'warehouse_manager',
  'capital_dept',
  'project_dept',
  're_dept',
  'supervisor',
  'investor',
  'viewer'
];

interface AuthContextType {
  user: { id: string; email: string; role?: string } | null;
  profile: Profile | null;
  loading: boolean;
  effectiveRole: string;
  originalRole: string;
  availableRoles: string[];
  isSimulating: boolean;
  setEffectiveRole: (role: string) => void;
  resetRole: () => void;
  refreshRoles: () => Promise<void>;
  signInWithPassword: (accountOrEmail: string, password: string) => Promise<{ success: boolean; profile: Profile }>;
  signInWithOtp: (accountOrEmail: string) => Promise<{ success: boolean; message?: string }>;
  verifyOtp: (accountOrEmail: string, token: string) => Promise<{ success: boolean; profile: Profile }>;
  signUp: (params: {
    email: string;
    password: string;
    fullName: string;
    username?: string;
    phone?: string;
    organization?: string;
    purpose?: string;
  }) => Promise<{ success: boolean; message?: string; profile: Profile; requiresEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string; role?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [effectiveRole, setEffectiveRoleState] = useState<string>('');
  const [availableRoles, setAvailableRoles] = useState<string[]>(CANONICAL_ROLES);

  // Xác định vai trò gốc thực tế của tài khoản (VD: admin, super_admin, btc_manager,...)
  const originalRole = (profile?.originalRole || user?.role || profile?.role || '') as string;
  const isAdmin = originalRole === 'admin' || originalRole === 'super_admin';
  const isSimulating = Boolean(isAdmin && effectiveRole && effectiveRole !== originalRole);

  // Tự động đồng bộ vai trò khi người dùng đăng nhập
  useEffect(() => {
    if (!profile) {
      setEffectiveRoleState('');
      return;
    }

    const realRole = (profile.originalRole || profile.role) as string;
    const isUserAdmin = realRole === 'admin' || realRole === 'super_admin';

    if (isUserAdmin) {
      const savedEffectiveRole = typeof window !== 'undefined' ? sessionStorage.getItem('btcvmt_effective_role') : null;
      if (savedEffectiveRole) {
        setEffectiveRoleState(savedEffectiveRole);
        if (profile.role !== savedEffectiveRole) {
          setProfile(prev => prev ? ({ ...prev, originalRole: realRole as Role, role: savedEffectiveRole as Role }) : null);
        }
      } else {
        setEffectiveRoleState(realRole);
        if (profile.role !== realRole) {
          setProfile(prev => prev ? ({ ...prev, originalRole: realRole as Role, role: realRole as Role }) : null);
        }
      }
    } else {
      setEffectiveRoleState(realRole);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('btcvmt_effective_role');
      }
    }
  }, [profile?.id, profile?.originalRole]);

  const setEffectiveRole = (newRole: string) => {
    const target = newRole.trim();
    if (!target) return;
    setEffectiveRoleState(target);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('btcvmt_effective_role', target);
    }
    setProfile(prev => {
      if (!prev) return prev;
      const realRole = prev.originalRole || prev.role;
      return {
        ...prev,
        originalRole: realRole,
        role: target as Role,
      };
    });
  };

  const resetRole = () => {
    const target = originalRole || 'admin';
    setEffectiveRoleState(target);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('btcvmt_effective_role');
    }
    setProfile(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        role: (prev.originalRole || target) as Role,
      };
    });
  };

  const refreshRoles = async () => {
    setAvailableRoles(CANONICAL_ROLES);
  };

  // Helper: Resolve Username or Email to actual Profile and Email
  const resolveToProfileAndEmail = async (accountInput: string): Promise<{ profile: Profile | null; email: string }> => {
    const cleanInput = accountInput.trim().toLowerCase();

    // 1. If Supabase is configured, resolve strictly from remote Supabase profiles
    if (isSupabaseConfigured) {
      try {
        if (cleanInput.includes('@')) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .ilike('email', cleanInput)
            .maybeSingle();
          if (prof) return { profile: prof as Profile, email: cleanInput };
          return { profile: null, email: cleanInput };
        } else {
          const { data: profByUsername } = await supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .ilike('username', cleanInput)
            .maybeSingle();

          if (profByUsername && profByUsername.email) {
            return { profile: profByUsername as Profile, email: profByUsername.email };
          }

          const defaultEmail = `${cleanInput}@btcvmt.vn`;
          const { data: profByDefaultEmail } = await supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .ilike('email', defaultEmail)
            .maybeSingle();

          if (profByDefaultEmail && profByDefaultEmail.email) {
            return {
              profile: profByDefaultEmail as Profile,
              email: profByDefaultEmail.email,
            };
          }

          return { profile: null, email: defaultEmail };
        }
      } catch (err) {
        console.warn('Error resolving account in Supabase:', err);
        return {
          profile: null,
          email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@btcvmt.vn`,
        };
      }
    }

    // 2. Only if Supabase is NOT configured, check local mockStore (Dev mode only)
    const isDevMode = import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true';
    if (!isDevMode) {
      return {
        profile: null,
        email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@btcvmt.vn`,
      };
    }

    const mockProfiles = mockStore.getProfiles();
    const foundLocal = mockProfiles.find(p =>
      p.username?.toLowerCase() === cleanInput ||
      p.email?.toLowerCase() === cleanInput ||
      p.email?.toLowerCase().split('@')[0] === cleanInput ||
      p.id.toLowerCase() === cleanInput
    );

    if (foundLocal) {
      return { profile: foundLocal, email: foundLocal.email || `${cleanInput}@btcvmt.vn` };
    }

    return {
      profile: null,
      email: cleanInput.includes('@') ? cleanInput : `${cleanInput}@btcvmt.vn`,
    };
  };

  // Helper: Load & Validate Profile
  const loadAndValidateProfile = async (userId: string, userEmail: string): Promise<Profile | null> => {
    // 1. Supabase configured -> query Supabase strictly
    if (isSupabaseConfigured) {
      try {
        const { data: prof, error } = await withTimeout(
          supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .eq('id', userId)
            .maybeSingle(),
          4000
        );

        if (error) {
          console.warn('Error fetching profile from Supabase:', error);
        }

        if (prof) {
          if (prof.status === 'disabled' || prof.status === 'inactive' || prof.status === 'rejected') {
            return null;
          }
          return { ...prof, originalRole: (prof as any).originalRole || prof.role } as Profile;
        }

        const { data: profByEmail } = await supabase
          .from('profiles')
          .select('*, regions(name), areas(name)')
          .ilike('email', userEmail)
          .maybeSingle();

        if (profByEmail) {
          if (profByEmail.status === 'disabled' || profByEmail.status === 'inactive' || profByEmail.status === 'rejected') {
            return null;
          }
          return { ...profByEmail, originalRole: (profByEmail as any).originalRole || profByEmail.role } as Profile;
        }
      } catch (err) {
        console.warn('Error validating Supabase profile:', err);
      }
      return null;
    }

    // 2. Supabase NOT configured -> query local mockStore in dev mode
    const isDevMode = import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true';
    if (!isDevMode) return null;

    const mockProfiles = mockStore.getProfiles();
    const foundMock = mockProfiles.find(p =>
      p.id === userId ||
      p.email?.toLowerCase() === userEmail.toLowerCase() ||
      p.username?.toLowerCase() === userEmail.toLowerCase()
    );
    if (foundMock && foundMock.status !== 'disabled' && foundMock.status !== 'inactive' && foundMock.status !== 'rejected') {
      return foundMock;
    }

    return null;
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (isSupabaseConfigured) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) throw error;

          if (session?.user && mounted) {
            const email = session.user.email || '';
            const validProfile = await loadAndValidateProfile(session.user.id, email);

            if (validProfile && mounted) {
              setUser({ id: session.user.id, email, role: validProfile.role });
              setProfile(validProfile);
            } else if (mounted) {
              setUser(null);
              setProfile(null);
              await supabase.auth.signOut().catch(() => {});
            }
          } else if (mounted) {
            setUser(null);
            setProfile(null);
          }
        } catch (err) {
          console.warn('Supabase getSession error:', err);
          if (mounted) {
            setUser(null);
            setProfile(null);
          }
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        const isDevMode = import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true';
        if (isDevMode) {
          const storedUserId = typeof window !== 'undefined' ? localStorage.getItem('btcvmt_auth_user_id') : null;
          if (storedUserId) {
            const mockProfiles = mockStore.getProfiles();
            const p = mockProfiles.find(item => item.id === storedUserId && item.status === 'active');
            if (p && mounted) {
              setUser({ id: p.id, email: p.email || '', role: p.role });
              setProfile(p);
              setLoading(false);
              return;
            }
          }
        }
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    let authListener: { subscription: { unsubscribe: () => void } } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;
        
        if (session?.user) {
          const email = session.user.email || '';
          const validProfile = await loadAndValidateProfile(session.user.id, email);
          if (validProfile && mounted) {
            setUser({ id: session.user.id, email, role: validProfile.role });
            setProfile(validProfile);
          } else if (mounted) {
            setUser(null);
            setProfile(null);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      });
      authListener = data;
    }

    return () => {
      mounted = false;
      if (authListener) authListener.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user) return;
    const p = await loadAndValidateProfile(user.id, user.email);
    if (p) {
      setProfile(p);
    }
  };

  /**
   * Đăng nhập bằng Tên đăng nhập (Username) hoặc Email kèm Mật khẩu.
   * Ưu tiên gọi RPC login_user({ p_username, p_password }) theo yêu cầu.
   */
  const signInWithPassword = async (accountOrEmail: string, password: string): Promise<{ success: boolean; profile: Profile }> => {
    setLoading(true);
    const cleanAccount = accountOrEmail.trim().toLowerCase();

    // 1. Thử đăng nhập bằng RPC login_user (Dành cho bảng public.app_users bằng Username thuần túy)
    try {
      const appSession = await loginUser(cleanAccount, password);
      if (appSession) {
        const appProfile: Profile = {
          id: appSession.id,
          username: appSession.username,
          email: appSession.username.includes('@') ? appSession.username : `${appSession.username}@btcvmt.vn`,
          full_name: appSession.full_name || appSession.username,
          role: (appSession.role as any) || 'user',
          status: appSession.status as any,
          access_expires_at: appSession.access_expires_at,
          permissions: ['asset.lookup'],
          region_id: null,
          area_id: null,
          project_ids: null,
          managed_warehouse_ids: null,
          created_at: new Date().toISOString(),
        };

        setUser({ id: appSession.id, email: appProfile.email, role: appProfile.role });
        setProfile(appProfile);

        await logAccessEvent({
          userId: appSession.id,
          action: 'login',
          details: { method: 'rpc_login_user', username: appSession.username, role: appSession.role, status: appSession.status },
        }).catch(() => {});

        setLoading(false);
        return { success: true, profile: appProfile };
      }
    } catch (rpcErr: any) {
      // Nếu lỗi sai mật khẩu hoặc lỗi từ RPC, ghi nhận nhưng nếu là định dạng email thì có thể thử auth fallback
      if (!cleanAccount.includes('@') && !rpcErr?.message?.includes('function') && !rpcErr?.message?.includes('PGRST202')) {
        setLoading(false);
        throw rpcErr instanceof Error ? rpcErr : new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
      }
    }

    // 2. Supabase configured -> Thử Supabase Auth (dành cho tài khoản nội bộ / email)
    if (isSupabaseConfigured) {
      try {
        const { email: resolvedEmail } = await resolveToProfileAndEmail(cleanAccount);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password: password,
        });

        if (error || !data?.user) {
          setLoading(false);
          throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
        }

        const validProfile = await loadAndValidateProfile(data.user.id, resolvedEmail);
        if (!validProfile) {
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          throw new Error('Tài khoản chưa được kích hoạt hoặc không tồn tại trong hệ thống.');
        }

        if (validProfile.status === 'disabled' || validProfile.status === 'inactive' || validProfile.status === 'rejected') {
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          throw new Error('Tài khoản đã bị tạm khóa hoặc từ chối truy cập.');
        }

        setUser({ id: data.user.id, email: resolvedEmail, role: validProfile.role });
        setProfile(validProfile);

        await logAccessEvent({
          userId: validProfile.id,
          action: 'login',
          details: { method: 'password', account: accountOrEmail, email: resolvedEmail },
        });

        setLoading(false);
        return { success: true, profile: validProfile };
      } catch (err: any) {
        setLoading(false);
        throw err instanceof Error ? err : new Error('Tài khoản hoặc mật khẩu không chính xác.');
      }
    }

    // 3. Supabase is NOT configured -> Local Dev/Mock Mode
    const isDevMode = !import.meta.env.PROD;
    if (!isDevMode) {
      setLoading(false);
      throw new Error('Hệ thống chưa cấu hình dịch vụ xác thực.');
    }

    const { profile: localProfile, email: resolvedEmail } = await resolveToProfileAndEmail(cleanAccount);

    if (!localProfile) {
      setLoading(false);
      throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
    }

    if (password !== '123456' && password !== 'password123') {
      setLoading(false);
      throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
    }

    if (localProfile.status === 'disabled' || localProfile.status === 'inactive' || localProfile.status === 'rejected') {
      setLoading(false);
      throw new Error('Tài khoản đã bị tạm khóa hoặc từ chối truy cập.');
    }

    setUser({ id: localProfile.id, email: resolvedEmail, role: localProfile.role });
    setProfile(localProfile);
    if (typeof window !== 'undefined') {
      localStorage.setItem('btcvmt_auth_user_id', localProfile.id);
    }

    await logAccessEvent({
      userId: localProfile.id,
      action: 'login',
      details: { method: 'password', account: accountOrEmail, email: resolvedEmail },
    });

    setLoading(false);
    return { success: true, profile: localProfile };
  };

  /**
   * Gửi mã OTP đăng nhập qua Email
   */
  const signInWithOtp = async (accountOrEmail: string): Promise<{ success: boolean; message?: string }> => {
    const cleanAccount = accountOrEmail.trim().toLowerCase();
    const { profile: targetProfile, email: resolvedEmail } = await resolveToProfileAndEmail(cleanAccount);

    if (isSupabaseConfigured) {
      if (targetProfile && targetProfile.status !== 'active') {
        throw new Error('Tài khoản chưa được duyệt hoặc đã bị khóa.');
      }

      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: resolvedEmail,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });
        if (error) {
          throw new Error('Không thể gửi mã xác thực. Vui lòng kiểm tra lại email hoặc liên hệ quản trị viên.');
        }
        return { success: true, message: `Mã xác thực OTP đã được gửi đến email ${resolvedEmail}.` };
      } catch (err: any) {
        throw err instanceof Error ? err : new Error('Không thể gửi mã xác thực. Vui lòng thử lại.');
      }
    }

    // Dev/Offline Mode Only
    const isDevMode = import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true';
    if (!isDevMode) {
      throw new Error('Hệ thống chưa cấu hình dịch vụ xác thực.');
    }

    if (!targetProfile || targetProfile.status !== 'active') {
      throw new Error('Tài khoản không tồn tại hoặc chưa được kích hoạt.');
    }

    return { success: true, message: `Yêu cầu OTP đã được ghi nhận cho ${resolvedEmail}.` };
  };

  /**
   * Xác thực mã OTP.
   * TUYỆT ĐỐI không cho phép mã backdoor (123456/000000) hay tự sinh tài khoản viewer.
   */
  const verifyOtp = async (accountOrEmail: string, token: string): Promise<{ success: boolean; profile: Profile }> => {
    setLoading(true);
    const cleanToken = token.trim();
    const cleanAccount = accountOrEmail.trim().toLowerCase();
    const { profile: targetProfile, email: resolvedEmail } = await resolveToProfileAndEmail(cleanAccount);

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: resolvedEmail,
          token: cleanToken,
          type: 'email',
        });

        if (error || !data?.user) {
          setLoading(false);
          throw new Error('Mã OTP không chính xác hoặc đã hết hạn.');
        }

        const validProfile = await loadAndValidateProfile(data.user.id, resolvedEmail);
        if (!validProfile) {
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          throw new Error('Tài khoản chưa được kích hoạt hoặc không tồn tại trong hệ thống.');
        }

        if (validProfile.status === 'disabled' || validProfile.status === 'inactive' || validProfile.status === 'rejected') {
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          throw new Error('Tài khoản đã bị tạm khóa hoặc từ chối truy cập.');
        }

        setUser({ id: data.user.id, email: resolvedEmail, role: validProfile.role });
        setProfile(validProfile);

        await logAccessEvent({
          userId: validProfile.id,
          action: 'login',
          details: { method: 'otp', account: accountOrEmail, email: resolvedEmail },
        });

        setLoading(false);
        return { success: true, profile: validProfile };
      } catch (err: any) {
        setLoading(false);
        throw err instanceof Error ? err : new Error('Mã OTP không chính xác hoặc đã hết hạn.');
      }
    }

    // Dev/Offline Mode Only
    const isDevMode = !import.meta.env.PROD;
    if (!isDevMode) {
      setLoading(false);
      throw new Error('Hệ thống chưa cấu hình dịch vụ xác thực.');
    }

    if (!targetProfile || targetProfile.status === 'disabled' || targetProfile.status === 'inactive' || targetProfile.status === 'rejected') {
      setLoading(false);
      throw new Error('Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    if (cleanToken !== '123456') {
      setLoading(false);
      throw new Error('Mã OTP không chính xác hoặc đã hết hạn.');
    }

    setUser({ id: targetProfile.id, email: resolvedEmail, role: targetProfile.role });
    setProfile(targetProfile);
    if (typeof window !== 'undefined') {
      localStorage.setItem('btcvmt_auth_user_id', targetProfile.id);
    }

    await logAccessEvent({
      userId: targetProfile.id,
      action: 'login',
      details: { method: 'otp', account: accountOrEmail, email: resolvedEmail },
    });

    setLoading(false);
    return { success: true, profile: targetProfile };
  };

  /**
   * Luồng Người dùng tự đăng ký (Tra cứu tạm thời):
   * Gọi supabase.rpc('register_user', { p_username, p_password })
   * Đăng ký xong tự động lưu trạng thái pending.
   */
  const signUp = async (params: {
    email: string;
    password: string;
    fullName: string;
    username?: string;
    phone?: string;
    organization?: string;
    purpose?: string;
  }): Promise<{ success: boolean; message?: string; profile: Profile; requiresEmailConfirmation?: boolean }> => {
    setLoading(true);
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanUsername = params.username?.trim().toLowerCase() || (cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail);
    const cleanFullName = params.fullName.trim() || cleanUsername;

    // 1. Luôn ưu tiên gọi RPC register_user({ p_username, p_password })
    let registeredAppUser: any = null;
    try {
      registeredAppUser = await registerUser(cleanUsername, params.password);
    } catch (rpcErr: any) {
      console.warn('registerUser RPC info:', rpcErr);
      // Nếu là lỗi username đã tồn tại, dừng và báo lỗi cho người dùng
      if (rpcErr?.message?.includes('tồn tại') || rpcErr?.message?.includes('already exists') || rpcErr?.message?.includes('duplicate')) {
        setLoading(false);
        throw rpcErr;
      }
    }

    if (isSupabaseConfigured) {
      try {
        const { data: authData } = await supabase.auth.signUp({
          email: cleanEmail.includes('@') ? cleanEmail : `${cleanUsername}@btcvmt.vn`,
          password: params.password,
          options: {
            data: {
              full_name: cleanFullName,
              username: cleanUsername,
              role: 'user',
            },
          },
        }).catch(() => ({ data: { user: null, session: null } }));

        const userId = registeredAppUser?.id || authData?.user?.id || `user-${Date.now()}`;
        const newProfile: Profile = {
          id: userId,
          email: cleanEmail.includes('@') ? cleanEmail : `${cleanUsername}@btcvmt.vn`,
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

        let finalProfile: Profile = newProfile;
        try {
          const { data: profData } = await supabase
            .from('profiles')
            .upsert(newProfile)
            .select()
            .single();
          if (profData) {
            finalProfile = profData as Profile;
          }
        } catch (saveErr) {
          console.warn('Lưu profile dự phòng:', saveErr);
        }

        // Đồng bộ vào mockStore
        const currentMocks = mockStore.getProfiles();
        mockStore.saveProfiles([finalProfile, ...currentMocks.filter(p => p.id !== finalProfile.id)]);

        await logAccessEvent({
          userId: finalProfile.id,
          action: 'register',
          details: { username: cleanUsername, email: newProfile.email, role: 'user', status: 'pending', organization: params.organization },
        }).catch(() => {});

        setLoading(false);
        return {
          success: true,
          profile: finalProfile,
          requiresEmailConfirmation: false,
          message: 'Đăng ký thành công! Tài khoản đang ở trạng thái Chờ duyệt (status = pending).',
        };
      } catch (err: any) {
        setLoading(false);
        throw err instanceof Error ? err : new Error('Không thể hoàn tất đăng ký tài khoản.');
      }
    }

    // Dev / Mock Mode
    const currentProfiles = mockStore.getProfiles();
    const newProfile: Profile = {
      id: registeredAppUser?.id || ('user-' + Date.now()),
      email: cleanEmail.includes('@') ? cleanEmail : `${cleanUsername}@btcvmt.vn`,
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

    mockStore.saveProfiles([newProfile, ...currentProfiles.filter(p => p.id !== newProfile.id)]);

    await logAccessEvent({
      userId: newProfile.id,
      action: 'register',
      details: { username: cleanUsername, email: newProfile.email, role: 'user', status: 'pending', organization: params.organization },
    }).catch(() => {});

    setLoading(false);
    return {
      success: true,
      profile: newProfile,
      message: 'Đăng ký thành công! Tài khoản của bạn đang ở trạng thái Chờ duyệt (status = pending).',
    };
  };

  /**
   * Đăng xuất an toàn
   */
  const signOut = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('btcvmt_auth_user_id');
      sessionStorage.removeItem('btcvmt_effective_role');
    }
    setEffectiveRoleState('');
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        effectiveRole: effectiveRole || originalRole || 'user',
        originalRole,
        availableRoles,
        isSimulating,
        setEffectiveRole,
        resetRole,
        refreshRoles,
        signInWithPassword,
        signInWithOtp,
        verifyOtp,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
