import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PublicSettings } from '@/types/api';

const SHOP_KEY = 'pg-shop';

/** Last known shop details, for the offline page and banner. */
export function cachedShop(): Partial<PublicSettings['shop']> | null {
  try {
    return JSON.parse(localStorage.getItem(SHOP_KEY) ?? 'null') as Partial<PublicSettings['shop']> | null;
  } catch {
    return null;
  }
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => {
      const data = (await api.get<PublicSettings>('/settings/public')).data;
      try {
        const { name, address, phone, hours } = data.shop;
        localStorage.setItem(SHOP_KEY, JSON.stringify({ name, address, phone, hours }));
      } catch {
        // Storage unavailable (private mode); the offline note just shows less.
      }
      return data;
    },
    staleTime: 10 * 60_000,
  });
}
