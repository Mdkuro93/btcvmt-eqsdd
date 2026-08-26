import { supabase, isSupabaseConfigured, withTimeout } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Profile, Role } from '../types';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../lib/permissions';

export { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE };

export async function fetchProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProfiles();
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('*, regions(name), areas(name)')
        .order('created_at', { ascending: false }),
      3000
    );

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchProfiles error or timeout, using mockStore:', err);
    return mockStore.getProfiles();
  }
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

export async function updateUserStatus(userId: string, status: 'active' | 'inactive') {
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
  email: string;
  full_name: string;
  role: Role;
  region_id?: string | null;
  area_id?: string | null;
  managed_warehouse_ids?: string[] | null;
}) {
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[profileData.role] || DEFAULT_PERMISSIONS_BY_ROLE['viewer'];
  const newProfile: Profile = {
    id: 'user-' + Date.now(),
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
