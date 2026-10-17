import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, idempotent } from '@/lib/api-client';
import type { AdminOrder, AdminOrderList } from '@/types/admin';
import type { Address, OrderStatus } from '@/types/api';

export interface OrderListParams {
  page?: number;
  status?: OrderStatus;
  q?: string;
  audience?: 'retail' | 'institution';
  paymentStatus?: string;
  active?: boolean;
}

export const orderKeys = {
  all: ['admin-orders'] as const,
  list: (p: OrderListParams) => ['admin-orders', 'list', p] as const,
  detail: (id: string) => ['admin-orders', 'detail', id] as const,
};

export function useAdminOrders(params: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: async () => (await api.get<AdminOrderList>('/admin/orders', { params: { limit: 20, ...params } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => (await api.get<AdminOrder>(`/admin/orders/${id}`)).data,
    enabled: Boolean(id),
  });
}

function useOrderMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useChangeStatus = (id: string) =>
  useOrderMutation((input: { status: OrderStatus; note?: string; notify?: boolean; override?: boolean; refund?: boolean }) =>
    api.patch(`/admin/orders/${id}/status`, input),
  );

/** Counter pickup with the customer's code; `key` makes a repeated tap harmless. */
export const useHandover = (id: string) =>
  useOrderMutation(({ key, ...input }: { key: string; code?: string; overrideReason?: string; amountCollected?: number; provider?: 'cash' | 'upi_counter'; note?: string }) =>
    api.post(`/admin/orders/${id}/handover`, input, idempotent(key)),
  );

export const useRefund = (id: string) =>
  useOrderMutation(({ key, ...input }: { key: string; amount?: number; reason: string; method: 'original' | 'cash' }) =>
    api.post(`/admin/orders/${id}/refunds`, input, idempotent(key)),
  );

export const useAssignOrder = (id: string) =>
  useOrderMutation((input: { assignedTo?: string | null; deliveryPerson?: string | null }) =>
    api.patch(`/admin/orders/${id}/assign`, input),
  );

export const useSaveNote = (id: string) =>
  useOrderMutation((internalNote: string) => api.patch(`/admin/orders/${id}/note`, { internalNote }));

export const useQuoteOrder = (id: string) =>
  useOrderMutation((input: { items: { itemId: string; lineTotal: number }[]; note?: string }) =>
    api.patch(`/admin/orders/${id}/quote`, input),
  );

export const useRecordPayment = (id: string) =>
  useOrderMutation(({ key, ...input }: { key: string; amount: number; provider: 'cash' | 'upi_counter'; note?: string }) =>
    api.post(`/admin/orders/${id}/payments`, input, idempotent(key)),
  );

export const useDeleteOrder = (id: string) => useOrderMutation(() => api.delete(`/admin/orders/${id}`));

/** Uploads the proof file to storage, then attaches it to the order item. */
export const useSendProof = (orderId: string) =>
  useOrderMutation(async ({ itemId, file, message }: { itemId: string; file: File; message?: string }) => {
    const { data: presign } = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>(
      '/uploads/presign',
      { fileName: file.name, mimeType: file.type || 'application/pdf', size: file.size, purpose: 'proof' },
    );
    await axios.put(presign.uploadUrl, file, { headers: presign.headers });
    await api.post(`/uploads/${presign.fileId}/complete`);
    return api.post(`/admin/orders/${orderId}/items/${itemId}/proofs`, { fileId: presign.fileId, message });
  });

export interface WalkInInput {
  customer: { name: string; phone: string };
  items: { productId: string; options: Record<string, string>; quantity?: number; pageCount?: number; copies?: number; notes?: string; fileIds: string[] }[];
  fulfilment: { method: 'pickup' | 'delivery'; address?: Address };
  amountPaid: number;
  paymentProvider: 'cash' | 'upi_counter';
  internalNote?: string;
}

export function useCreateWalkIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...input }: WalkInInput & { key: string }) =>
      (await api.post<AdminOrder>('/admin/orders/walk-in', input, idempotent(key))).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export async function openFile(fileId: string) {
  const { data } = await api.get<{ url: string }>(`/uploads/${fileId}/url`);
  window.open(data.url, '_blank', 'noopener');
}
