import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/auth-store';
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
