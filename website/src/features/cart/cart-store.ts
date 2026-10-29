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
  /**
   * One checkout per cart content: paying again for the same cart (after closing the payment window
   * or leaving the page) reuses the same order instead of creating and charging a second one.
   * Any change to the items starts a new checkout.
   */
  checkoutKey: string;
  add: (item: Omit<CartItem, 'id'>) => void;
  update: (id: string, patch: Partial<CartItem>) => void;
  remove: (id: string) => void;
  /** Puts a removed item back where it was (Undo). */
  restore: (item: CartItem, index: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      checkoutKey: crypto.randomUUID(),
      add: (item) => set((s) => ({ items: [...s.items, { ...item, id: crypto.randomUUID() }], checkoutKey: crypto.randomUUID() })),
      update: (id, patch) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), checkoutKey: crypto.randomUUID() })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), checkoutKey: crypto.randomUUID() })),
      restore: (item, index) =>
        set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items.slice(0, index), item, ...s.items.slice(index)], checkoutKey: crypto.randomUUID() })),
      clear: () => set({ items: [], checkoutKey: crypto.randomUUID() }),
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
