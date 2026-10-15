import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  AdminInstitutionDetail,
  AdminInstitutionList,
  AuditEntry,
  Customer,
  DashboardData,
  Settings,
  StaffMember,
} from '@/types/admin';
import type { InstitutionStatus, Paginated } from '@/types/api';

// ── Dashboard ─────────────────────────────────────────────────────────────
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/admin/dashboard')).data,
    refetchInterval: 60_000,
    enabled,
  });
}

// ── Institutions ──────────────────────────────────────────────────────────
export function useInstitutions(params: { page?: number; status?: InstitutionStatus; q?: string }) {
  return useQuery({
    queryKey: ['admin-institutions', params],
    queryFn: async () => (await api.get<AdminInstitutionList>('/admin/institutions', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useInstitution(id: string) {
  return useQuery({
    queryKey: ['admin-institution', id],
    queryFn: async () => (await api.get<AdminInstitutionDetail>(`/admin/institutions/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useReviewInstitution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: InstitutionStatus; reason?: string; extraDiscountPercent?: number }) =>
      api.patch(`/admin/institutions/${id}/status`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-institutions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-institution', id] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ── Customers & staff ─────────────────────────────────────────────────────
export function useCustomers(params: { page?: number; q?: string }) {
  return useQuery({
    queryKey: ['admin-customers', params],
    queryFn: async () => (await api.get<Paginated<Customer>>('/admin/users/customers', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useToggleCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/users/customers/${id}/active`, { isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-customers'] }),
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['admin-staff'],
    queryFn: async () => (await api.get<StaffMember[]>('/admin/users/staff')).data,
  });
}

export function useSaveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      id ? api.patch(`/admin/users/staff/${id}`, data) : api.post('/admin/users/staff', data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-staff'] }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get<Settings>('/admin/settings')).data,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Settings, '_id'>) => api.put('/admin/settings', data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-settings'] }),
  });
}

// ── Audit ─────────────────────────────────────────────────────────────────
export function useAudit(params: { page?: number; entity?: string; action?: string }) {
  return useQuery({
    queryKey: ['admin-audit', params],
    queryFn: async () => (await api.get<Paginated<AuditEntry>>('/admin/audit', { params })).data,
    placeholderData: keepPreviousData,
  });
}
