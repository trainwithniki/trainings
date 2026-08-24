import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const adaptiveStorage = {
  getItem(key: string) {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    const remember = window.localStorage.getItem('trainings-remember-login') === '1';
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    other.removeItem(key);
    target.setItem(key, value);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabaseConfigured = Boolean(url && publishableKey && !url.includes('YOUR_PROJECT'));

export const supabase = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: adaptiveStorage,
      },
    })
  : null;

export type ProfileRole = 'owner' | 'admin' | 'editor';
export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  active: boolean;
  created_at: string;
};

export type UserInvite = {
  id: string;
  email: string;
  display_name: string | null;
  role: Exclude<ProfileRole, 'owner'>;
  accepted_at: string | null;
  created_at: string;
};
