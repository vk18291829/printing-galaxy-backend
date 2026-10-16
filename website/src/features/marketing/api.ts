import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { BannerGroups } from '@/types/api';

const EMPTY: BannerGroups = { hero: [], promo: [], feature: [], offer: [] };

/** Live banners for every placement. An unreachable API just hides them. */
export function useBanners() {
  const query = useQuery({
    queryKey: ['banners'],
    queryFn: async () => ({ ...EMPTY, ...(await api.get<Partial<BannerGroups>>('/marketing/banners')).data }),
    staleTime: 5 * 60_000,
  });
  return { ...query, banners: query.data ?? EMPTY };
}
