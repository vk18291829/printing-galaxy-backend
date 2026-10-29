import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartFile, CartItem } from './cart-store';

/**
 * "Order again": the earlier order's items go straight to checkout without touching the cart, so
 * what the customer has in the cart stays as it was. Kept for this tab only (survives a reload).
 */
interface ReorderState {
  /** The order being repeated, for the page links. */
  from: { id: string; number: string } | null;
  items: CartItem[];
  /** Items that had files last time: the customer uploads them again before paying. */
  needsFiles: string[];
  /** Same rule as the cart: paying again for the same items reuses the same checkout. */
  checkoutKey: string;
  start: (from: { id: string; number: string }, items: Omit<CartItem, 'id'>[], needsFiles: boolean[]) => void;
  setFiles: (id: string, files: CartFile[]) => void;
  clear: () => void;
}

export const useReorderStore = create<ReorderState>()(
  persist(
    (set) => ({
      from: null,
      items: [],
      needsFiles: [],
      checkoutKey: crypto.randomUUID(),
      start: (from, items, needsFiles) => {
        const withIds = items.map((i) => ({ ...i, id: crypto.randomUUID() }));
        set({ from, items: withIds, needsFiles: withIds.filter((_, n) => needsFiles[n]).map((i) => i.id), checkoutKey: crypto.randomUUID() });
      },
      setFiles: (id, files) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, files } : i)), checkoutKey: crypto.randomUUID() })),
      clear: () => set({ from: null, items: [], needsFiles: [], checkoutKey: crypto.randomUUID() }),
    }),
    {
      name: 'pg-reorder',
      storage: createJSONStorage(() => {
        try {
          return sessionStorage;
        } catch {
          return localStorage;
        }
      }),
    },
  ),
);
