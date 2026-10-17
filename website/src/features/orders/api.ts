import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Address, Order, Paginated } from '@/types/api';

export interface CreateOrderInput {
  items: {
    productId: string;
    options: Record<string, string>;
    quantity?: number;
    pageCount?: number;
    copies?: number;
    notes?: string;
    fileIds: string[];
  }[];
  fulfilment: { method: 'pickup' | 'delivery'; address?: Address };
  paymentMethod: 'online' | 'counter';
  customerNote?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface RazorpayOrderResponse {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  prefill: { name?: string; contact?: string; email?: string };
}

export const orderKeys = {
  all: ['orders'] as const,
  list: (page: number) => ['orders', 'list', page] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export function useMyOrders(page = 1, enabled = true) {
  return useQuery({
    queryKey: orderKeys.list(page),
    queryFn: async () => (await api.get<Paginated<Order>>('/orders', { params: { page, limit: 10 } })).data,
    enabled,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: Boolean(id),
    // Keep the timeline fresh while the order is in progress.
    refetchInterval: (q) =>
      q.state.data && !['delivered', 'picked_up', 'cancelled'].includes(q.state.data.status) ? 30_000 : false,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    // The key stays the same for one checkout, so a retried request returns the same order.
    mutationFn: async ({ idempotencyKey, ...input }: CreateOrderInput & { idempotencyKey: string }) =>
      (await api.post<Order>('/orders', input, { headers: { 'Idempotency-Key': idempotencyKey } })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useCancelOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => (await api.post<Order>(`/orders/${id}/cancel`, { reason })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useProofResponse(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; decision: 'approved' | 'changes_requested'; comment?: string }) =>
      (await api.post<Order>(`/orders/${orderId}/items/${input.itemId}/proof`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export const paymentsApi = {
  createRazorpayOrder: (orderId: string) =>
    api.post<RazorpayOrderResponse>('/payments/razorpay/order', { orderId }).then((r) => r.data),
  verify: (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post('/payments/razorpay/verify', payload).then((r) => r.data),
};
