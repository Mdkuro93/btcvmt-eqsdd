import { supabase, isSupabaseConfigured, withTimeout, fetchAppUsers, approveAppUser, rejectAppUser } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Profile, Role } from '../types';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../lib/permissions';

export { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE };

export async function fetchProfiles(): Promise<Profile[]> {
  let baseProfiles: Profile[] = [];

  if (!isSupabaseConfigured) {
    baseProfiles = mockStore.getProfiles();
  } else {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('*, regions(name), areas(name)')
          .order('created_at', { ascending: false }),
        3000
      );

      if (error) throw error;
      baseProfiles = data || [];
    } catch (err) {
      console.warn('Supabase fetchProfiles error or timeout, using mockStore:', err);
      baseProfiles = mockStore.getProfiles();
    }
  }

  // Tích hợp danh sách người dùng từ bảng public.app_users (RPC register_user / login_user)
  try {
    const appUsers = await fetchAppUsers();
    if (appUsers && appUsers.length > 0) {
      const profileMap = new Map<string, Profile>();
      baseProfiles.forEach(p => {
        if (p.id) profileMap.set(p.id, p);
        if (p.username) profileMap.set(p.username.toLowerCase(), p);
      });

      appUsers.forEach(au => {
        const existingById = profileMap.get(au.id);
        const existingByName = profileMap.get(au.username.toLowerCase());
        const existing = existingById || existingByName;

        if (existing) {
          // Cập nhật trạng thái và thời hạn tra cứu mới nhất từ bảng app_users
          existing.status = au.status as any;
          existing.access_expires_at = au.access_expires_at;
          existing.role = (au.role as any) || existing.role;
        } else {
          // Thêm người dùng từ bảng app_users vào danh sách quản trị
          const newProf: Profile = {
            id: au.id,
            username: au.username,
            email: au.username.includes('@') ? au.username : `${au.username}@btcvmt.vn`,
            full_name: au.full_name || au.username,
            role: (au.role as any) || 'user',
            status: au.status as any,
            access_expires_at: au.access_expires_at,
            permissions: ['asset.lookup'],
            region_id: null,
            area_id: null,
            project_ids: null,
            managed_warehouse_ids: null,
            created_at: au.created_at,
          };
          baseProfiles.unshift(newProf);
          profileMap.set(au.id, newProf);
        }
      });
    }
  } catch (appUserErr) {
    console.warn('fetchAppUsers integration notice:', appUserErr);
  }

  return baseProfiles;
}

export async function updateUserRole(userId: string, role: Role) {
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[role];
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, role, permissions } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update({ role, permissions })
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase updateUserRole error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, role, permissions } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

export async function updateUserPermissions(userId: string, permissions: string[]) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, permissions } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update({ permissions })
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase updateUserPermissions error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, permissions } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

export async function updateUserStatus(userId: string, status: 'active' | 'inactive' | 'disabled' | 'pending' | 'approved' | 'rejected') {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update({ status })
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const profiles = mockStore.getProfiles();
      const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
      mockStore.saveProfiles(updated);
      return data;
    }
  } catch (err) {
    console.warn('Supabase updateUserStatus error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

/**
 * Phê duyệt tài khoản và thiết lập Thời gian tra cứu tạm thời:
 * Cập nhật status = 'approved' và gán giá trị cho access_expires_at.
 * Đồng bộ cả bảng profiles và public.app_users (RPC approve_user).
 */
export async function approveUserProfile(userId: string, accessExpiresAt: string, reviewerId?: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'approved' as const,
    access_expires_at: accessExpiresAt,
  };

  // Đồng bộ sang bảng public.app_users
  try {
    await approveAppUser(userId, accessExpiresAt);
  } catch (err) {
    console.warn('Lỗi đồng bộ approveAppUser:', err);
  }

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const profiles = mockStore.getProfiles();
      const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
      mockStore.saveProfiles(updated);
      return data;
    }
  } catch (err) {
    console.warn('Supabase approveUserProfile error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

/**
 * Gia hạn thời gian tra cứu tạm thời cho tài khoản đã duyệt
 */
export async function extendUserAccess(userId: string, newExpiresAt: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'approved' as const,
    access_expires_at: newExpiresAt,
  };

  // Đồng bộ sang bảng public.app_users
  try {
    await approveAppUser(userId, newExpiresAt);
  } catch (err) {
    console.warn('Lỗi đồng bộ extendUserAccess sang app_users:', err);
  }

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const profiles = mockStore.getProfiles();
      const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
      mockStore.saveProfiles(updated);
      return data;
    }
  } catch (err) {
    console.warn('Supabase extendUserAccess error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

/**
 * Từ chối tài khoản chờ duyệt
 */
export async function rejectUserProfile(userId: string, reason?: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'rejected' as const,
  };

  // Đồng bộ sang bảng public.app_users
  try {
    await rejectAppUser(userId);
  } catch (err) {
    console.warn('Lỗi đồng bộ rejectAppUser:', err);
  }

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const profiles = mockStore.getProfiles();
      const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
      mockStore.saveProfiles(updated);
      return data;
    }
  } catch (err) {
    console.warn('Supabase rejectUserProfile error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

/**
 * Admin chủ động tạo mới tài khoản trực tiếp (được kích hoạt ngay không cần qua bước chờ duyệt)
 */
export async function createUserDirect(profileData: {
  username?: string;
  email: string;
  password?: string;
  full_name: string;
  role: Role;
  status?: 'active' | 'approved';
  access_expires_at?: string | null;
  region_id?: string | null;
  area_id?: string | null;
  managed_warehouse_ids?: string[] | null;
  phone?: string | null;
  organization?: string | null;
}): Promise<Profile> {
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[profileData.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'];
  const derivedUsername = profileData.username?.trim().toLowerCase() || profileData.email.split('@')[0].toLowerCase();
  
  // Xác định trạng thái kích hoạt ngay: nếu role 'user' có hạn dùng thì gán 'approved', còn lại 'active'
  const finalStatus: 'active' | 'approved' = profileData.status || (profileData.role === 'user' ? 'approved' : 'active');
  const cleanEmail = profileData.email.trim().toLowerCase();

  const newProfile: Profile = {
    id: 'user-' + Date.now(),
    username: derivedUsername,
    email: cleanEmail,
    full_name: profileData.full_name.trim(),
    role: profileData.role,
    region_id: profileData.region_id || null,
    area_id: profileData.area_id || null,
    project_ids: null,
    managed_warehouse_ids: profileData.managed_warehouse_ids || null,
    permissions,
    status: finalStatus,
    access_expires_at: profileData.access_expires_at || null,
    phone: profileData.phone?.trim() || null,
    organization: profileData.organization?.trim() || null,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles([newProfile, ...current]);
    return newProfile;
  }

  try {
    // 1. Thử tạo tài khoản auth trong Supabase nếu có mật khẩu
    let authUserId: string | null = null;
    if (profileData.password) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: profileData.password,
          options: {
            data: {
              full_name: profileData.full_name,
              username: derivedUsername,
              role: profileData.role,
            }
          }
        });
        if (!authError && authData.user?.id) {
          authUserId = authData.user.id;
          newProfile.id = authUserId;
        }
      } catch (authErr) {
        console.warn('Could not create Supabase auth user, proceeding with profiles row:', authErr);
      }
    }

    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .insert([newProfile])
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const current = mockStore.getProfiles();
      mockStore.saveProfiles([data, ...current]);
      return data;
    }
  } catch (err) {
    console.warn('Supabase createUserDirect error or timeout, fallback to mockStore:', err);
  }

  const current = mockStore.getProfiles();
  mockStore.saveProfiles([newProfile, ...current]);
  return newProfile;
}

export async function updateUserManagedWarehouses(userId: string, managedWarehouseIds: string[] | null) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, managed_warehouse_ids: managedWarehouseIds } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .update({ managed_warehouse_ids: managedWarehouseIds })
        .eq('id', userId)
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const profiles = mockStore.getProfiles();
      const updated = profiles.map(p => p.id === userId ? { ...p, managed_warehouse_ids: managedWarehouseIds } : p);
      mockStore.saveProfiles(updated);
      return data;
    }
  } catch (err) {
    console.warn('Supabase updateUserManagedWarehouses error or timeout, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, managed_warehouse_ids: managedWarehouseIds } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}

export async function createProfile(profileData: {
  username?: string;
  email: string;
  full_name: string;
  role: Role;
  region_id?: string | null;
  area_id?: string | null;
  managed_warehouse_ids?: string[] | null;
}) {
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[profileData.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'];
  const derivedUsername = profileData.username?.trim().toLowerCase() || profileData.email.split('@')[0].toLowerCase();
  
  const newProfile: Profile = {
    id: 'user-' + Date.now(),
    username: derivedUsername,
    email: profileData.email,
    full_name: profileData.full_name,
    role: profileData.role,
    region_id: profileData.region_id || null,
    area_id: profileData.area_id || null,
    project_ids: null,
    managed_warehouse_ids: profileData.managed_warehouse_ids || null,
    permissions,
    status: 'active',
  };

  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles([newProfile, ...current]);
    return newProfile;
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .insert([newProfile])
        .select()
        .single(),
      3000
    );

    if (!error && data) {
      const current = mockStore.getProfiles();
      mockStore.saveProfiles([data, ...current]);
      return data;
    }
  } catch (err) {
    console.warn('Supabase createProfile error or timeout, fallback to mockStore:', err);
  }

  const current = mockStore.getProfiles();
  mockStore.saveProfiles([newProfile, ...current]);
  return newProfile;
}

export async function deleteProfile(userId: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles(current.filter(p => p.id !== userId));
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase.from('profiles').delete().eq('id', userId),
      3000
    );
    if (error) throw error;
  } catch (err) {
    console.warn('Supabase deleteProfile error or timeout, removing from mockStore:', err);
  }
  const current = mockStore.getProfiles();
  mockStore.saveProfiles(current.filter(p => p.id !== userId));
}
