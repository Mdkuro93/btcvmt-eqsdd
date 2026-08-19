import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, Role } from '../types';
import { DEFAULT_PERMISSIONS_BY_ROLE } from '../api/users';

export type { Role };

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, role?: Role) => Promise<void>;
  signOut: () => Promise<void>;
  updateRole: (newRole: Role) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_DEMO_PROFILE: Profile = {
  id: DEMO_USER_ID,
  email: 'admin@btcvmt.vn',
  full_name: 'Quản trị viên (BTC VMT)',
  role: 'btc_manager',
  region_id: null,
  area_id: null,
  project_ids: null,
  permissions: DEFAULT_PERMISSIONS_BY_ROLE['btc_manager'],
  status: 'active',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>({
    id: DEMO_USER_ID,
    email: 'admin@btcvmt.vn',
  });
  const [profile, setProfile] = useState<Profile | null>(DEFAULT_DEMO_PROFILE);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const authUser = { id: session.user.id, email: session.user.email || '' };
          setUser(authUser);
          
          // Try fetching profile from Supabase
          const { data: prof } = await supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .eq('id', session.user.id)
            .single();

          if (prof) {
            setProfile(prof as Profile);
          } else {
            // fallback profile for logged in user
            setProfile({
              id: session.user.id,
              email: session.user.email || '',
              full_name: session.user.user_metadata?.full_name || session.user.email,
              role: 'btc_manager',
              region_id: null,
              area_id: null,
              project_ids: null,
              permissions: DEFAULT_PERMISSIONS_BY_ROLE['btc_manager'],
              status: 'active',
            });
          }
        }
      } catch (err) {
        console.warn('Supabase auth session check failed, using active demo session:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || '' });
        const { data: prof } = await supabase
          .from('profiles')
          .select('*, regions(name), areas(name)')
          .eq('id', session.user.id)
          .single();

        if (prof) {
          setProfile(prof as Profile);
        }
      } else {
        // Keep demo user logged in if no active Supabase session
        setUser({ id: DEMO_USER_ID, email: 'admin@btcvmt.vn' });
        setProfile((prev) => prev || DEFAULT_DEMO_PROFILE);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, role: Role = 'btc_manager') => {
    setLoading(true);
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: 'password123',
        });

        if (!error && data.user) {
          setUser({ id: data.user.id, email: data.user.email || email });
          const { data: prof } = await supabase
            .from('profiles')
            .select('*, regions(name), areas(name)')
            .eq('id', data.user.id)
            .single();

          if (prof) {
            setProfile(prof as Profile);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Supabase login skipped, using direct role sign-in:', e);
      }
    }

    // Direct role sign-in fallback
    const roleNames: Record<Role, string> = {
      btc_manager: 'Quản trị viên (BTC VMT)',
      capital_dept: 'Chuyên viên Ban Nguồn Vốn',
      project_dept: 'Chuyên viên Ban DAĐT',
      re_dept: 'Chuyên viên Ban KD BĐS',
      viewer: 'Người xem tra cứu',
      super_admin: 'Quản trị viên cấp cao',
      admin: 'Quản trị hệ thống',
    };

    const newProfile: Profile = {
      id: DEMO_USER_ID,
      email: email,
      full_name: roleNames[role] || email,
      role: role,
      region_id: null,
      area_id: null,
      project_ids: null,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[role],
      status: 'active',
    };

    setUser({ id: DEMO_USER_ID, email });
    setProfile(newProfile);
    setLoading(false);
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    // Switch to viewer or clear
    setUser({ id: DEMO_USER_ID, email: 'viewer@btcvmt.vn' });
    setProfile({
      id: DEMO_USER_ID,
      email: 'viewer@btcvmt.vn',
      full_name: 'Khách Tra Cứu',
      role: 'viewer',
      region_id: null,
      area_id: null,
      project_ids: null,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE['viewer'],
      status: 'active',
    });
  };

  const updateRole = async (newRole: Role) => {
    if (!profile) return;
    const updated: Profile = {
      ...profile,
      role: newRole,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[newRole],
    };
    setProfile(updated);

    if (isSupabaseConfigured && user && user.id !== DEMO_USER_ID) {
      try {
        await supabase
          .from('profiles')
          .update({ role: newRole, permissions: DEFAULT_PERMISSIONS_BY_ROLE[newRole] })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Could not persist role update to Supabase:', err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, updateRole }}>
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
