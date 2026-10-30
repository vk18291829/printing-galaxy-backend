import { useTranslation } from 'react-i18next';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PriceBook } from '@/types/api';

/**
 * The quantity price bands right under the quantity picker: the band the order is in is lit, and
 * tapping a band sets the quantity to its start (when the quantity is a plain count).
 */
export function QuantityPrices({ book, unit, units, onPick }: { book: PriceBook; unit: string; units?: number; onPick?: (qty: number) => void }) {
  const { t } = useTranslation();
  const tiers = [...book.tiers].sort((a, b) => a.minQty - b.minQty);
  if (tiers.length < 2) return null;
  const base = tiers[0]!.unitPrice;
  const active = units ? tiers.reduce((idx, tier, i) => (units >= tier.minQty ? i : idx), 0) : 0;
  const unitName = (count: number) => t(`units.${unit}`, { count });

  return (
    <section>
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">{t('product.priceByQuantity')}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiers.map((tier, i) => {
          const from = i === 0 ? Math.max(tier.minQty, book.minQty) : tier.minQty;
          const next = tiers[i + 1];
          const save = Math.round((1 - tier.unitPrice / base) * 100);
          const on = i === active;
          const body = (
            <>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {next ? `${formatNumber(from)}–${formatNumber(next.minQty - 1)}` : `${formatNumber(from)}+`} {unitName(2)}
              </span>
              <span className="mt-0.5 block text-lg font-bold text-foreground tabular-nums">
                {formatINR(tier.unitPrice)}
                <span className="text-xs font-normal text-muted-foreground"> / {unitName(1)}</span>
              </span>
              <span className={cn('block text-xs font-semibold', save > 0 ? 'text-success' : 'text-muted-foreground')}>
                {save > 0 ? t('product.savePct', { pct: save }) : t('product.basePrice')}
              </span>
            </>
          );
          const style = cn(
            'rounded-xl border p-3 text-left transition-colors',
            on ? 'border-primary bg-primary/6 ring-2 ring-primary/15' : 'bg-card',
            onPick && !on && 'hover:border-primary/40',
          );
          return onPick ? (
            <button key={tier.minQty} type="button" aria-pressed={on} onClick={() => onPick(from)} className={style}>
              {body}
            </button>
          ) : (
            <div key={tier.minQty} className={style}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
