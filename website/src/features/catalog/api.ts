import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAudience, useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import type { Audience, Category, Product, Quote } from '@/types/api';

export interface QuoteInput {
  productId: string;
  options: Record<string, string>;
  quantity?: number;
  pageCount?: number;
  copies?: number;
}

export const catalogKeys = {
  categories: ['categories'] as const,
  products: (params: object) => ['products', params] as const,
  product: (slug: string) => ['product', slug] as const,
  quote: (input: QuoteInput, principal: string) => ['quote', principal, input] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
    staleTime: 5 * 60_000,
  });
}

export function useProducts(params: { category?: string; audience?: Audience; featured?: boolean; q?: string } = {}) {
  return useQuery({
    queryKey: catalogKeys.products(params),
    queryFn: async () => (await api.get<Product[]>('/products', { params })).data,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: async () => (await api.get<Product>(`/products/${slug}`)).data,
    enabled: Boolean(slug),
  });
}

export function fetchQuote(input: QuoteInput) {
  return api.post<Quote>('/pricing/quote', input).then((r) => r.data);
}

/** Live server-side quote. Keyed by the signed-in principal because audience changes the price. */
export function useQuote(input: QuoteInput | null) {
  const principalId = useAuthStore((s) =>
    s.principal ? `${s.principal.kind}:${s.principal.kind === 'user' ? s.principal.user._id : s.principal.institution._id}` : 'guest',
  );
  return useQuery({
    queryKey: catalogKeys.quote(input ?? ({} as QuoteInput), principalId),
    queryFn: () => fetchQuote(input!),
    enabled: Boolean(input?.productId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export type ProductSort = 'popular' | 'newest' | 'price-asc' | 'price-desc' | 'rating';
export const PRODUCT_SORTS: ProductSort[] = ['popular', 'newest', 'price-asc', 'price-desc', 'rating'];

interface BrowsePage {
  items: Product[];
  total: number;
  page: number;
  pages: number;
}

/** Paged product list for infinite scroll; prices are sorted by the visitor's own price book. */
export function useBrowseProducts(params: { category?: string; q?: string; sort?: ProductSort; limit?: number }) {
  const audience = useAudience();
  return useInfiniteQuery({
    queryKey: ['products-browse', audience, params],
    queryFn: async ({ pageParam }) =>
      (await api.get<BrowsePage>('/products/browse', { params: { ...params, audience, page: pageParam, limit: params.limit ?? 12 } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
