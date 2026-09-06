import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Profile, Role } from '../types';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../lib/permissions';

export { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE };

export async function fetchProfiles(): Promise<Profile[]> {
  let baseProfiles: Profile[] = [];

  if (!isSupabaseConfigured) {
    baseProfiles = mockStore.getProfiles();
  } else {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('*, regions(name), areas(name)')
        .order('created_at', { ascending: false }),
      DEFAULT_READ_TIMEOUT
    );

    if (error) throw error;
    baseProfiles = data || [];
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

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ role, permissions })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, role, permissions } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function updateUserPermissions(userId: string, permissions: string[]) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, permissions } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ permissions })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, permissions } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function updateUserStatus(userId: string, status: 'active' | 'inactive' | 'disabled' | 'pending' | 'approved' | 'rejected') {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ status })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

/**
 * Phê duyệt tài khoản và thiết lập Thời gian tra cứu tạm thời:
 * Cập nhật status = 'approved' và gán giá trị cho access_expires_at.
 */
export async function approveUserProfile(userId: string, accessExpiresAt: string, reviewerId?: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'approved' as const,
    access_expires_at: accessExpiresAt,
  };

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

/**
 * Gia hạn thời gian tra cứu tạm thời cho tài khoản đã duyệt
 */
export async function extendUserAccess(userId: string, newExpiresAt: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'approved' as const,
    access_expires_at: newExpiresAt,
  };

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

/**
 * Từ chối tài khoản chờ duyệt
 */
export async function rejectUserProfile(userId: string, reason?: string): Promise<Profile | undefined> {
  const updatePayload = {
    status: 'rejected' as const,
  };

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
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
  assigned_warehouse_ids?: string[] | null;
  owner_entity_ids?: string[] | null;
  phone?: string | null;
  organization?: string | null;
}): Promise<Profile> {
  if (!isSupabaseConfigured) {
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
      assigned_warehouse_ids: profileData.assigned_warehouse_ids || null,
      owner_entity_ids: profileData.owner_entity_ids || null,
      permissions,
      status: finalStatus,
      access_expires_at: profileData.access_expires_at || null,
      phone: profileData.phone?.trim() || null,
      organization: profileData.organization?.trim() || null,
      created_at: new Date().toISOString(),
    };

    const current = mockStore.getProfiles();
    mockStore.saveProfiles([newProfile, ...current]);
    return newProfile;
  }

  // 1. Dùng Edge Function để tạo user an toàn mà không làm mất session admin
  const cleanEmail = profileData.email.trim().toLowerCase();
  const derivedUsername = profileData.username?.trim().toLowerCase() || cleanEmail.split('@')[0];
  const finalStatus = profileData.status || (profileData.role === 'user' ? 'approved' : 'active');
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[profileData.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'];

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: {
      email: cleanEmail,
      password: profileData.password, // Mật khẩu do admin nhập
      full_name: profileData.full_name.trim(),
      username: derivedUsername,
      role: profileData.role,
      permissions,
      status: finalStatus,
      phone: profileData.phone?.trim() || null,
      organization: profileData.organization?.trim() || null,
      region_id: profileData.region_id || null,
      area_id: profileData.area_id || null,
      managed_warehouse_ids: profileData.managed_warehouse_ids || null,
      assigned_warehouse_ids: profileData.assigned_warehouse_ids || null,
      owner_entity_ids: profileData.owner_entity_ids || null,
      access_expires_at: profileData.access_expires_at || null,
    }
  });

  if (error) {
    throw new Error(`Lỗi gọi Edge Function: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(data?.message || 'Không thể tạo tài khoản');
  }

  // Nếu user profile được tạo thành công
  return data.profile as Profile;
}

export async function updateUserManagedWarehouses(userId: string, managedWarehouseIds: string[] | null) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, managed_warehouse_ids: managedWarehouseIds } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ managed_warehouse_ids: managedWarehouseIds })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, managed_warehouse_ids: managedWarehouseIds } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function updateUserAssignedWarehouses(userId: string, assignedWarehouseIds: string[] | null) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, assigned_warehouse_ids: assignedWarehouseIds } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ assigned_warehouse_ids: assignedWarehouseIds })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, assigned_warehouse_ids: assignedWarehouseIds } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function updateUserOwnerEntities(userId: string, ownerEntityIds: string[] | null) {
  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, owner_entity_ids: ownerEntityIds } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update({ owner_entity_ids: ownerEntityIds })
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, owner_entity_ids: ownerEntityIds } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function updateUserDirect(
  userId: string,
  updates: {
    full_name?: string;
    role?: Role;
    status?: 'active' | 'inactive' | 'disabled' | 'pending' | 'approved' | 'rejected';
    phone?: string | null;
    organization?: string | null;
    access_expires_at?: string | null;
    managed_warehouse_ids?: string[] | null;
    assigned_warehouse_ids?: string[] | null;
    owner_entity_ids?: string[] | null;
    permissions?: string[] | null;
  }
): Promise<Profile> {
  const permissions = updates.permissions || (updates.role ? DEFAULT_PERMISSIONS_BY_ROLE[updates.role] : undefined);
  const payload: any = { ...updates };
  if (permissions) {
    payload.permissions = permissions;
  }

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...payload } : p);
    mockStore.saveProfiles(updated);
    const result = updated.find(p => p.id === userId);
    if (!result) throw new Error('Không tìm thấy người dùng');
    return result;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const profiles = mockStore.getProfiles();
    const updated = profiles.map(p => p.id === userId ? { ...p, ...payload } : p);
    mockStore.saveProfiles(updated);
  } catch {}

  return data;
}

export async function createProfile(profileData: {
  username?: string;
  email: string;
  full_name: string;
  role: Role;
  region_id?: string | null;
  area_id?: string | null;
  managed_warehouse_ids?: string[] | null;
  assigned_warehouse_ids?: string[] | null;
  owner_entity_ids?: string[] | null;
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
    assigned_warehouse_ids: profileData.assigned_warehouse_ids || null,
    owner_entity_ids: profileData.owner_entity_ids || null,
    permissions,
    status: 'active',
  };

  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles([newProfile, ...current]);
    return newProfile;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .insert([newProfile])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles([data, ...current]);
  } catch {}

  return data;
}

export async function deleteProfile(userId: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles(current.filter(p => p.id !== userId));
    return;
  }

  const { error } = await withTimeout(
    supabase.from('profiles').delete().eq('id', userId),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw error;

  try {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles(current.filter(p => p.id !== userId));
  } catch {}
}
