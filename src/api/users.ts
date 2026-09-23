import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Profile, Role } from '../types';
import { 
  ALL_PERMISSIONS, 
  DEFAULT_PERMISSIONS_BY_ROLE, 
  getEffectivePermissions, 
  isCustomizedPermissions, 
  hasPermission 
} from '../lib/permissions';

export { 
  ALL_PERMISSIONS, 
  DEFAULT_PERMISSIONS_BY_ROLE, 
  getEffectivePermissions, 
  isCustomizedPermissions, 
  hasPermission 
};

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
        DEFAULT_READ_TIMEOUT
      );

      if (error) {
        if (isSchemaMissingError(error)) {
          console.warn('Bảng profiles hoặc quan hệ regions/areas chưa có trên Supabase, dùng mockStore:', error.message);
          baseProfiles = mockStore.getProfiles();
        } else {
          console.warn('Lỗi khi tải danh sách profiles từ Supabase:', error);
          baseProfiles = mockStore.getProfiles();
        }
      } else {
        baseProfiles = data || [];
      }
    } catch (err: any) {
      if (isSchemaMissingError(err)) {
        baseProfiles = mockStore.getProfiles();
      } else {
        console.warn('Lỗi fetchProfiles, fallback sang mockStore:', err);
        baseProfiles = mockStore.getProfiles();
      }
    }
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
  const updatePayload: any = {
    status: 'approved' as const,
    access_expires_at: accessExpiresAt,
  };

  if (!isSupabaseConfigured) {
    const profiles = mockStore.getProfiles();
    const currentProfile = profiles.find(p => p.id === userId);
    if (currentProfile) {
      if (!currentProfile.organization || !currentProfile.purpose || !currentProfile.phone) {
        const requests = mockStore.getAccessRequests();
        const matchingReq = requests.find(r => r.email?.toLowerCase() === currentProfile.email?.toLowerCase());
        if (matchingReq) {
          if (!currentProfile.organization && matchingReq.organization) {
            updatePayload.organization = matchingReq.organization;
          }
          if (!currentProfile.purpose && matchingReq.purpose) {
            updatePayload.purpose = matchingReq.purpose;
          }
          if (!currentProfile.phone && matchingReq.phone) {
            updatePayload.phone = matchingReq.phone;
          }
        }
      }
    }
    const updated = profiles.map(p => p.id === userId ? { ...p, ...updatePayload } : p);
    mockStore.saveProfiles(updated);
    return mockStore.getProfiles().find(p => p.id === userId);
  }

  // Supabase flow:
  // Auto-sync organization, purpose, phone from access_requests if not already set on profile
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('email, organization, purpose, phone')
      .eq('id', userId)
      .maybeSingle();

    if (prof?.email && (!prof.organization || !prof.purpose || !prof.phone)) {
      const { data: req } = await supabase
        .from('access_requests')
        .select('organization, purpose, phone')
        .ilike('email', prof.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (req) {
        if (!prof.organization && req.organization) {
          updatePayload.organization = req.organization;
        }
        if (!prof.purpose && req.purpose) {
          updatePayload.purpose = req.purpose;
        }
        if (!prof.phone && req.phone) {
          updatePayload.phone = req.phone;
        }
      }
    }
  } catch (syncErr) {
    console.warn('Không thể tự động đồng bộ đơn vị/mục đích từ đơn đăng ký:', syncErr);
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

  if (error) {
    throw new Error('Lỗi phê duyệt tài khoản: ' + error.message);
  }

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
  purpose?: string | null;
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
      purpose: profileData.purpose?.trim() || null,
      created_at: new Date().toISOString(),
    };

    const current = mockStore.getProfiles();
    mockStore.saveProfiles([newProfile, ...current]);
    return newProfile;
  }

  // 1. Thử dùng Edge Function để tạo user an toàn
  const cleanEmail = profileData.email.trim().toLowerCase();
  const derivedUsername = profileData.username?.trim().toLowerCase() || cleanEmail.split('@')[0];
  const finalStatus = profileData.status || (profileData.role === 'user' ? 'approved' : 'active');
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[profileData.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'];

  if (!profileData.password || !profileData.password.trim()) {
    throw new Error('Vui lòng nhập mật khẩu cho tài khoản mới.');
  }

  if (profileData.password.trim().length < 6) {
    throw new Error('Mật khẩu tài khoản phải có tối thiểu 6 ký tự.');
  }

  if (profileData.password.trim() === '123456' || profileData.password.trim() === 'password123') {
    throw new Error('Không được sử dụng mật khẩu mặc định hoặc quá đơn giản.');
  }

  // Luồng tạo tài khoản bắt buộc 100% phải đi qua Edge Function 'admin-create-user'
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: {
      email: cleanEmail,
      password: profileData.password.trim(),
      full_name: profileData.full_name.trim(),
      username: derivedUsername,
      role: profileData.role,
      permissions,
      status: finalStatus,
      phone: profileData.phone?.trim() || null,
      organization: profileData.organization?.trim() || null,
      purpose: profileData.purpose?.trim() || null,
      region_id: profileData.region_id || null,
      area_id: profileData.area_id || null,
      managed_warehouse_ids: profileData.managed_warehouse_ids || null,
      assigned_warehouse_ids: profileData.assigned_warehouse_ids || null,
      owner_entity_ids: profileData.owner_entity_ids || null,
      access_expires_at: profileData.access_expires_at || null,
    }
  });

  if (error) {
    throw new Error(`Lỗi gọi Edge Function tạo tài khoản: ${error.message || 'Không thể kết nối đến dịch vụ tạo tài khoản'}`);
  }

  if (data && !data.success) {
    throw new Error(data.message || 'Không thể tạo tài khoản');
  }

  if (!data?.profile) {
    throw new Error('Không nhận được dữ liệu hồ sơ người dùng sau khi tạo tài khoản.');
  }

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
    purpose?: string | null;
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

/**
 * Gọi một Edge Function quản trị (chạy với Service Role Key phía server).
 * Lấy thông báo lỗi thật từ máy chủ thay vì thông báo chung chung của supabase-js.
 */
async function invokeAdminFunction(name: string, body: Record<string, unknown>): Promise<void> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke(name, { body }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    let message = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json();
        if (payload?.message) message = payload.message;
      }
    } catch {}
    throw new Error(message);
  }

  if (!data?.success) {
    throw new Error(data?.message || 'Thao tác không thành công');
  }
}

/**
 * Xóa hẳn tài khoản (cả profiles lẫn auth.users) qua Edge Function admin-delete-user.
 * (Giữ tên deleteProfile để không phải sửa nơi gọi.)
 */
export async function deleteProfile(userId: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles(current.filter(p => p.id !== userId));
    return;
  }

  await invokeAdminFunction('admin-delete-user', { userId });

  try {
    const current = mockStore.getProfiles();
    mockStore.saveProfiles(current.filter(p => p.id !== userId));
  } catch {}
}

/**
 * Người dùng tự đổi mật khẩu của chính mình
 */
export async function changeCurrentUserPassword(newPassword: string): Promise<void> {
  if (!newPassword || newPassword.trim().length < 6) {
    throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
  }

  if (!isSupabaseConfigured) {
    return;
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(`Đổi mật khẩu thất bại: ${error.message}`);
  }
}

/**
 * Quản trị viên / Ban tài chính đặt lại mật khẩu cho tài khoản người dùng
 */
export async function adminResetUserPassword(userId: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.trim().length < 6) {
    throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
  }

  if (!isSupabaseConfigured) {
    mockStore.updateAppUserPassword(userId, newPassword);
    return;
  }

  // Chỉ đi qua Edge Function (Service Role Key phía server). Lỗi được báo thẳng, KHÔNG rơi sang đường khác.
  await invokeAdminFunction('admin-reset-password', { userId, newPassword: newPassword.trim() });
}