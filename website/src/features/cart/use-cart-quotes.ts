import { useQueries } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/auth-store';
import { fetchQuote } from '@/features/catalog/api';
import type { CartItem } from './cart-store';

/** Re-prices every cart line with the current account's price book. */
export function useCartQuotes(items: CartItem[]) {
  const principalKey = useAuthStore((s) =>
    s.principal ? (s.principal.kind === 'user' ? s.principal.user._id : s.principal.institution._id) : 'guest',
  );
  const results = useQueries({
    queries: items.map((item) => {
      const input = {
        productId: item.productId,
        options: item.options,
        quantity: item.quantity,
        pageCount: item.pageCount,
        copies: item.copies,
      };
      return {
        queryKey: ['quote', principalKey, input],
        queryFn: () => fetchQuote(input),
        staleTime: 30_000,
      };
    }),
  });

  const lines = items.map((item, i) => {
    const quote = results[i]?.data;
    return { item, quote, amount: quote?.subtotal ?? item.estimate, loading: results[i]?.isLoading ?? false };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const invalid = lines.some((l) => l.quote && !l.quote.valid);
  const hasQuoteItems = lines.some((l) => l.item.workflow === 'quote');
  const loading = results.some((r) => r.isLoading);
  return { lines, subtotal, invalid, hasQuoteItems, loading };
}
