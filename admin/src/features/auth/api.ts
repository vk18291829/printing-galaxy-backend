import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';
import { useAuthStore, type StaffSession } from './auth-store';

export function useStaffLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) =>
      (await api.post<StaffSession>('/auth/staff/login', input)).data,
    onSuccess: setSession,
  });
}

export function useStaffLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: () => api.post('/auth/staff/logout'),
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}
