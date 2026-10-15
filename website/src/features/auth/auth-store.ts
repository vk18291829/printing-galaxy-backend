import { create } from 'zustand';
import type { Audience, Principal, SessionResponse } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  principal: Principal | null;
  setSession: (session: SessionResponse) => void;
  setPrincipal: (principal: Principal) => void;
  clear: () => void;
}

// The access token lives only in memory; the refresh token is an httpOnly cookie.
export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  principal: null,
  setSession: ({ accessToken, ...principal }) =>
    set({ status: 'authenticated', accessToken, principal: principal as Principal }),
  setPrincipal: (principal) => set({ principal }),
  clear: () => set({ status: 'anonymous', accessToken: null, principal: null }),
}));

/** The price book that applies to the current visitor. */
export function useAudience(): Audience {
  return useAuthStore((s) =>
    s.principal?.kind === 'institution' && s.principal.institution.status === 'approved'
      ? 'institution'
      : 'retail',
  );
}

export function useDisplayName() {
  return useAuthStore((s) => {
    if (!s.principal) return '';
    return s.principal.kind === 'institution'
      ? s.principal.institution.name
      : s.principal.user.name || s.principal.user.phone || '';
  });
}
