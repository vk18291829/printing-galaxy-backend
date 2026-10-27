import { useTranslation } from 'react-i18next';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PriceBook, ProductUnit } from '@/types/api';

export function PriceTierTable({
  book,
  unit,
  activeUnits,
  className,
}: {
  book: PriceBook;
  unit: ProductUnit;
  activeUnits?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const tiers = [...book.tiers].sort((a, b) => a.minQty - b.minQty);
  const activeIndex = activeUnits
    ? tiers.reduce((idx, tier, i) => (activeUnits >= tier.minQty ? i : idx), 0)
    : -1;

  if (!book.enabled) return <p className="text-sm text-muted-foreground">{t('pricing.notOffered')}</p>;
  if (tiers.length === 0) return <p className="text-sm font-medium text-primary">{t('pricing.onRequest')}</p>;

  return (
    <div className={cn('overflow-hidden rounded-xl shadow-card', className)}>
      <div className="grid grid-cols-2 bg-muted/60 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span>{t('pricing.qty')}</span>
        <span className="text-right">{t('product.tiers', { unit: t(`units.${unit}`, { count: 1 }) })}</span>
      </div>
      {tiers.map((tier, i) => {
        const next = tiers[i + 1];
        const from = Math.max(tier.minQty, i === 0 ? book.minQty : tier.minQty);
        return (
          <div
            key={tier.minQty}
            className={cn(
              'grid grid-cols-2 border-t px-3 py-2 text-sm tabular-nums transition-colors',
              i === activeIndex && 'bg-primary/8 font-semibold text-primary',
            )}
          >
            <span>
              {formatNumber(from)}
              {next ? ` – ${formatNumber(next.minQty - 1)}` : t('pricing.plus')}
            </span>
            <span className="text-right">{formatINR(tier.unitPrice)}</span>
          </div>
        );
      })}
    </div>
  );
}
