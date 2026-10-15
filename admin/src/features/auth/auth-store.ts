import { create } from 'zustand';
import type { User } from '@/types/api';

export interface StaffSession {
  accessToken: string;
  kind: 'user';
  user: User;
}

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  accessToken: string | null;
  user: User | null;
  setSession: (session: StaffSession) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => set({ status: 'authenticated', accessToken, user }),
  clear: () => set({ status: 'anonymous', accessToken: null, user: null }),
}));

export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'admin');
