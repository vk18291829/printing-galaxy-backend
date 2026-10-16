import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import type { ProductReviews, ReviewHighlight } from '@/types/api';

export function useProductReviews(slug: string) {
  // Keyed by principal so "your review" refreshes after signing in or out.
  const principal = useAuthStore((s) => s.principal?.kind ?? 'guest');
  return useQuery({
    queryKey: ['reviews', slug, principal],
    queryFn: async () => (await api.get<ProductReviews>(`/products/${slug}/reviews`)).data,
    enabled: Boolean(slug),
  });
}

export function useSubmitReview(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; title: string; comment: string }) => api.post(`/products/${slug}/reviews`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reviews', slug] }),
  });
}

export function useReviewHighlights() {
  return useQuery({
    queryKey: ['review-highlights'],
    queryFn: async () => (await api.get<ReviewHighlight[]>('/reviews/highlights')).data,
    staleTime: 10 * 60_000,
  });
}
