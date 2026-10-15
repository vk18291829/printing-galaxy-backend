import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Category, Product, Quote } from '@/types/api';

export type ProductInput = Omit<Product, '_id' | 'category'> & {
  category: string;
  tags: string[];
  isActive: boolean;
  sortOrder: number;
};
export type CategoryInput = Omit<Category, '_id' | 'productCount'> & { sortOrder: number; isActive: boolean };

export type AdminProduct = Product & { isActive: boolean; sortOrder: number; tags: string[] };
export type AdminCategory = Category & { isActive: boolean; sortOrder: number };

const keys = {
  categories: ['admin-categories'] as const,
  products: (params: object) => ['admin-products', params] as const,
  product: (id: string) => ['admin-product', id] as const,
};

export function useAdminCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () => (await api.get<AdminCategory[]>('/admin/catalog/categories')).data,
  });
}

export function useAdminProducts(params: { category?: string; q?: string; status?: 'active' | 'inactive' } = {}) {
  return useQuery({
    queryKey: keys.products(params),
    queryFn: async () => (await api.get<AdminProduct[]>('/admin/catalog/products', { params })).data,
  });
}

export function useAdminProduct(id?: string) {
  return useQuery({
    queryKey: keys.product(id ?? ''),
    queryFn: async () => (await api.get<AdminProduct & { category: string }>(`/admin/catalog/products/${id}`)).data,
    enabled: Boolean(id),
  });
}

function useCatalogMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-product'] });
      void queryClient.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export const useSaveProduct = () =>
  useCatalogMutation(({ id, data }: { id?: string; data: ProductInput }) =>
    id ? api.put(`/admin/catalog/products/${id}`, data) : api.post('/admin/catalog/products', data),
  );

export const useToggleProduct = () =>
  useCatalogMutation(({ id, isActive }: { id: string; isActive: boolean }) =>
    api.patch(`/admin/catalog/products/${id}/active`, { isActive }),
  );

export const useDeleteProduct = () => useCatalogMutation((id: string) => api.delete(`/admin/catalog/products/${id}`));

export const useSaveCategory = () =>
  useCatalogMutation(({ id, data }: { id?: string; data: CategoryInput }) =>
    id ? api.put(`/admin/catalog/categories/${id}`, data) : api.post('/admin/catalog/categories', data),
  );

export const useDeleteCategory = () => useCatalogMutation((id: string) => api.delete(`/admin/catalog/categories/${id}`));

/** Retail quote used by the walk-in counter screen. */
export function quoteRetail(input: {
  productId: string;
  options: Record<string, string>;
  quantity?: number;
  pageCount?: number;
  copies?: number;
}) {
  // Staff tokens resolve to the retail price book on the server.
  return api.post<Quote>('/pricing/quote', input).then((r) => r.data);
}
