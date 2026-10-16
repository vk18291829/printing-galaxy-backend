import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LocalizedString, ProductUnit, ProductWorkflow } from '@/types/api';

export interface CartFile {
  id: string;
  name: string;
  size: number;
  pageCount?: number;
}

export interface CartItem {
  id: string;
  productId: string;
  slug: string;
  name: LocalizedString;
  icon: string;
  /** Cover image of the product, if it has one. */
  image?: string;
  unit: ProductUnit;
  workflow: ProductWorkflow;
  options: Record<string, string>;
  optionLabels: { label: LocalizedString; value: LocalizedString }[];
  quantity?: number;
  pageCount?: number;
  copies?: number;
  notes?: string;
  files: CartFile[];
  /** Price shown when added; the server re-prices at checkout. */
  estimate: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'id'>) => void;
  update: (id: string, patch: Partial<CartItem>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items, { ...item, id: crypto.randomUUID() }] })),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'pg-cart',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
    },
  ),
);

export const useCartCount = () => useCartStore((s) => s.items.length);
