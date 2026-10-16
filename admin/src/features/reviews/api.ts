import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { LocalizedString, Paginated } from '@/types/api';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface AdminReview {
  _id: string;
  product: { _id: string; name: LocalizedString; slug: string; images: string[]; icon: string } | null;
  author: { id: string; kind: 'user' | 'institution' };
  authorName: string;
  rating: number;
  title?: string;
  comment?: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  featured: boolean;
  reply?: { text?: string; at?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ReviewList extends Paginated<AdminReview> {
  stats: Record<ReviewStatus, number> & { averageRating: number };
}

export interface ReviewParams {
  page: number;
  status?: ReviewStatus;
  rating?: number;
  q?: string;
}

export function useAdminReviews(params: ReviewParams) {
  return useQuery({
    queryKey: ['admin-reviews', params],
    queryFn: async () => (await api.get<ReviewList>('/admin/reviews', { params })).data,
    placeholderData: keepPreviousData,
  });
}

function useReviewMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });
}

export const useUpdateReview = () =>
  useReviewMutation(({ id, ...body }: { id: string; status?: ReviewStatus; featured?: boolean; reply?: string }) =>
    api.patch(`/admin/reviews/${id}`, body),
  );

export const useDeleteReview = () => useReviewMutation((id: string) => api.delete(`/admin/reviews/${id}`));
