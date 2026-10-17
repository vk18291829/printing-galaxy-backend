import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Paginated } from '@/types/api';

export interface SystemOverview {
  health: { db: 'up' | 'down'; queue: string; uptimeSeconds: number; node: string; environment: string; memoryMb: number };
  counts: { failedMessages: number; failedWebhooks: number; awaitingPayment: number; pendingRefunds: number; staleWindows: number };
  readiness: { production: boolean; errors: string[]; warnings: string[] };
}

export interface MessageLog {
  _id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'console';
  to: string;
  template: string;
  body?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  retries?: number;
  relatedOrder?: { _id: string; orderNumber: string };
  createdAt: string;
}

export interface WebhookLog {
  _id: string;
  provider: 'razorpay' | 'whatsapp';
  event: string;
  status: 'processed' | 'ignored' | 'failed' | 'duplicate';
  summary?: string;
  error?: string;
  relatedOrder?: { _id: string; orderNumber: string };
  createdAt: string;
}

export interface MoneyLog {
  _id: string;
  kind: 'payment' | 'refund';
  provider: 'razorpay' | 'cash' | 'upi_counter';
  amount: number;
  status: string;
  note?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  order?: { _id: string; orderNumber: string };
  recordedBy?: { _id: string; name: string };
  createdAt: string;
}

export function useSystemOverview() {
  return useQuery({
    queryKey: ['system', 'overview'],
    queryFn: async () => (await api.get<SystemOverview>('/admin/system/overview')).data,
    refetchInterval: 30_000,
  });
}

export function useMessageLog(params: { page: number; status?: string }) {
  return useQuery({
    queryKey: ['system', 'messages', params],
    queryFn: async () => (await api.get<Paginated<MessageLog>>('/admin/system/notifications', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useWebhookLog(page: number) {
  return useQuery({
    queryKey: ['system', 'webhooks', page],
    queryFn: async () => (await api.get<Paginated<WebhookLog>>('/admin/system/webhooks', { params: { page } })).data,
    placeholderData: keepPreviousData,
  });
}

export function useMoneyLog(params: { page: number; kind?: string }) {
  return useQuery({
    queryKey: ['system', 'payments', params],
    queryFn: async () => (await api.get<Paginated<MoneyLog>>('/admin/system/payments', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useRetryMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/system/notifications/${id}/retry`)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['system'] }),
  });
}
