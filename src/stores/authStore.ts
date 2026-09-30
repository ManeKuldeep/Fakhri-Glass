import { create } from 'zustand';
import type { Tables } from '../types/database';

/** The subset of `profiles` we keep in memory after login. */
export type UserProfile = Pick<
  Tables<'profiles'>,
  'id' | 'shop_id' | 'full_name' | 'assignment'
>;

interface AuthState {
  /** The logged-in user's profile, or null when logged out / loading. */
  profile: UserProfile | null;
  /** True while the initial session is being restored on app start. */
  isLoading: boolean;

  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isLoading: true,

  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ profile: null, isLoading: false }),
}));
