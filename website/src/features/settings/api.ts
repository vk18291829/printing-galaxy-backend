import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PublicSettings } from '@/types/api';

export function usePublicSettings() {
  return useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<PublicSettings>('/settings/public')).data,
    staleTime: 10 * 60_000,
  });
}
