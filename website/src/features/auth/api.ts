import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import i18n from '@/lib/i18n';
import type { Address, InstitutionType, Principal, SessionResponse } from '@/types/api';
import { useAuthStore } from './auth-store';

export interface OtpRequestResponse {
  expiresInSeconds: number;
  resendInSeconds: number;
  devCode?: string;
}

export interface InstitutionRegisterInput {
  name: string;
  type: InstitutionType;
  contactName: string;
  designation?: string;
  email: string;
  phone: string;
  password: string;
  address: Address;
  gstin?: string;
  size?: number;
}

export const authApi = {
  /** Email or mobile number, whichever the server signs customers in with. */
  // `lang` makes codes, the welcome email and later emails arrive in the visitor's language.
  requestOtp: (target: { email?: string; phone?: string }) =>
    api.post<OtpRequestResponse>('/auth/otp/request', { ...target, lang: i18n.language }).then((r) => r.data),
  verifyOtp: (input: { email?: string; phone?: string; code: string; name?: string }) =>
    api.post<SessionResponse & { isNew: boolean }>('/auth/otp/verify', { ...input, lang: i18n.language }).then((r) => r.data),
  institutionLogin: (input: { email: string; password: string }) =>
    api.post<SessionResponse>('/auth/institution/login', input).then((r) => r.data),
  institutionRegister: (input: InstitutionRegisterInput) =>
    api.post<SessionResponse>('/auth/institution/register', { ...input, lang: i18n.language }).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<Principal>('/auth/me').then((r) => r.data),
  updateAccount: (input: Record<string, unknown>) => api.patch<Principal>('/account', input).then((r) => r.data),
};

/** Invalidates price quotes because the audience may have changed with the session. */
function useOnSession() {
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();
  return (session: SessionResponse) => {
    setSession(session);
    void queryClient.invalidateQueries({ queryKey: ['quote'] });
  };
}

export function useVerifyOtp() {
  const onSession = useOnSession();
  return useMutation({ mutationFn: authApi.verifyOtp, onSuccess: onSession });
}

export function useInstitutionLogin() {
  const onSession = useOnSession();
  return useMutation({ mutationFn: authApi.institutionLogin, onSuccess: onSession });
}

export function useInstitutionRegister() {
  const onSession = useOnSession();
  return useMutation({ mutationFn: authApi.institutionRegister, onSuccess: onSession });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clear();
      queryClient.removeQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['quote'] });
    },
  });
}

export function useUpdateAccount() {
  const setPrincipal = useAuthStore((s) => s.setPrincipal);
  return useMutation({ mutationFn: authApi.updateAccount, onSuccess: setPrincipal });
}
