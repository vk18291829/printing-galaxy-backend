import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  BulkJobDetail,
  BulkJobListItem,
  BulkStatus,
  DeliveryOrder,
  Material,
  MovementReason,
  ReportData,
  StockMovement,
} from '@/types/admin';
import type { Paginated } from '@/types/api';

// ── Inventory ───────────────────────────────────────────────────────────────
export function useMaterials() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () => (await api.get<Material[]>('/admin/inventory')).data,
  });
}

export function useMovements(materialId: string | null) {
  return useQuery({
    queryKey: ['inventory', materialId, 'movements'],
    queryFn: async () => (await api.get<StockMovement[]>(`/admin/inventory/${materialId}/movements`)).data,
    enabled: Boolean(materialId),
  });
}

function useInventoryMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export type MaterialInput = Omit<Material, '_id' | 'low' | 'updatedAt' | 'quantity' | 'isActive'> & { quantity?: number; isActive?: boolean };

export const useSaveMaterial = () =>
  useInventoryMutation(({ id, data }: { id?: string; data: MaterialInput }) =>
    id ? api.patch(`/admin/inventory/${id}`, data) : api.post('/admin/inventory', data),
  );

export const useArchiveMaterial = () => useInventoryMutation((id: string) => api.delete(`/admin/inventory/${id}`));

export const useRecordMovement = () =>
  useInventoryMutation(({ id, ...body }: { id: string; quantity: number; reason: MovementReason; note?: string }) =>
    api.post(`/admin/inventory/${id}/movements`, body),
  );

// ── Reports ─────────────────────────────────────────────────────────────────
export type ReportType = 'sales' | 'products' | 'pending-payments' | 'institutions' | 'staff';
export interface ReportParams {
  from?: string;
  to?: string;
  groupBy?: 'day' | 'month';
}

export function useReport(type: ReportType, params: ReportParams) {
  return useQuery({
    queryKey: ['report', type, params],
    queryFn: async () => (await api.get<ReportData>(`/admin/reports/${type}`, { params })).data,
    placeholderData: keepPreviousData,
  });
}

// ── Bulk jobs ───────────────────────────────────────────────────────────────
export function useBulkJobs(params: { page?: number; status?: BulkStatus }) {
  return useQuery({
    queryKey: ['bulk-jobs', params],
    queryFn: async () => (await api.get<Paginated<BulkJobListItem>>('/admin/bulk-jobs', { params })).data,
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((j) => ['queued', 'validating', 'generating'].includes(j.status)) ? 3000 : 30_000,
  });
}

export function useBulkJob(id: string) {
  return useQuery({
    queryKey: ['bulk-jobs', 'detail', id],
    queryFn: async () => (await api.get<BulkJobDetail>(`/admin/bulk-jobs/${id}`)).data,
    refetchInterval: (q) => (q.state.data && ['queued', 'validating', 'generating'].includes(q.state.data.status) ? 2000 : false),
  });
}

export function useRerunBulkJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: 'validate' | 'generate') => api.post(`/admin/bulk-jobs/${id}/rerun`, { step }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] }),
  });
}

// ── Deliveries (rider view) ─────────────────────────────────────────────────
export function useDeliveries() {
  return useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => (await api.get<{ active: DeliveryOrder[]; doneToday: DeliveryOrder[] }>('/delivery')).data,
    refetchInterval: 60_000,
  });
}

function useDeliveryMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['deliveries'] }) });
}

export const useStartDelivery = () => useDeliveryMutation((id: string) => api.post(`/delivery/${id}/start`));

export const useCompleteDelivery = () =>
  useDeliveryMutation(({ id, ...body }: { id: string; cashCollected: number; provider: 'cash' | 'upi_counter'; note?: string }) =>
    api.post(`/delivery/${id}/delivered`, body),
  );

export const useFailDelivery = () =>
  useDeliveryMutation(({ id, note }: { id: string; note: string }) => api.post(`/delivery/${id}/failed`, { note }));
