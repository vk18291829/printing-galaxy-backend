import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import type { OrderStatus } from '@/types/api';

export type Update =
  | { id: string; kind: 'order'; status: OrderStatus; orderId: string; orderNumber: string; at: string }
  | { id: string; kind: 'refund'; amount: number; done: boolean; orderId: string; orderNumber: string; at: string }
  | { id: string; kind: 'offer'; title?: string; text: string; at: string };

export interface UpdatesResponse {
  items: Update[];
  unread: number;
  seenAt: string | null;
}

const KEY = ['updates'] as const;

/** Order progress, refunds and offers for the signed-in account; polled for the header bell. */
export function useUpdates() {
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<UpdatesResponse>('/account/updates')).data,
    enabled: signedIn,
    refetchInterval: 60_000,
  });
}

export function useMarkUpdatesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/account/updates/seen'),
    onSuccess: () => queryClient.setQueryData<UpdatesResponse>(KEY, (d) => (d ? { ...d, unread: 0 } : d)),
  });
}
