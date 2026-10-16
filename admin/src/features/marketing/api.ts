import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { LocalizedString } from '@/types/api';

export const BANNER_KINDS = ['hero', 'promo', 'feature', 'offer'] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];
export const BANNER_THEMES = ['blue', 'magenta', 'sunset', 'mint', 'dark'] as const;
export type BannerTheme = (typeof BANNER_THEMES)[number];

export interface BannerInput {
  kind: BannerKind;
  title: LocalizedString;
  subtitle: LocalizedString;
  ctaLabel: LocalizedString;
  link: string;
  imageUrl: string;
  theme: BannerTheme;
  badge: string;
  couponCode: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type AdminBanner = BannerInput & { _id: string; createdAt: string; updatedAt: string };

const KEY = ['admin-banners'] as const;

export function useAdminBanners() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<AdminBanner[]>('/admin/marketing/banners')).data,
  });
}

function useBannerMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }) });
}

export const useSaveBanner = () =>
  useBannerMutation(({ id, data }: { id?: string; data: BannerInput }) =>
    id ? api.put(`/admin/marketing/banners/${id}`, data) : api.post('/admin/marketing/banners', data),
  );

export const useToggleBanner = () =>
  useBannerMutation(({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/admin/marketing/banners/${id}/active`, { isActive }));

export const useDeleteBanner = () => useBannerMutation((id: string) => api.delete(`/admin/marketing/banners/${id}`));
