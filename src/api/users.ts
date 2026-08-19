import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Profile, Role } from '../types';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../lib/permissions';

export { ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE };

export async function fetchProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProfiles();
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, regions(name), areas(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchProfiles error, using mockStore:', err);
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
    const { data, error } = await supabase
      .from('profiles')
      .update({ role, permissions })
      .eq('id', userId)
      .select()
      .single();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase updateUserRole error, updating in mockStore:', err);
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
    const { data, error } = await supabase
      .from('profiles')
      .update({ permissions })
      .eq('id', userId)
      .select()
      .single();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase updateUserPermissions error, updating in mockStore:', err);
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
    const { data, error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', status)
      .select()
      .single();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase updateUserStatus error, updating in mockStore:', err);
  }

  const profiles = mockStore.getProfiles();
  const updated = profiles.map(p => p.id === userId ? { ...p, status } : p);
  mockStore.saveProfiles(updated);
  return mockStore.getProfiles().find(p => p.id === userId);
}
