import { IconArrowRight, IconClock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Badge } from '@/components/ui/badge';
import { useAudience } from '@/features/auth/auth-store';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';

/** Rotating CMYK accent on the icon only, so the grid has rhythm without loud colour blocks. */
const TINTS = [
  'text-brand-blue dark:text-brand-sky',
  'text-brand-magenta',
  'text-amber-600 dark:text-brand-yellow',
  'text-brand-cyan',
];

export function startingPrice(product: Product, audience: 'retail' | 'institution') {
  const book = product.pricing[audience].enabled ? product.pricing[audience] : product.pricing.retail;
  if (!book.enabled || book.tiers.length === 0) return null;
  return Math.min(...book.tiers.map((t) => t.unitPrice));
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const audience = useAudience();
  const book = product.pricing[audience].enabled ? product.pricing[audience] : product.pricing.retail;
  const price = startingPrice(product, audience);
  const retailOff = !product.pricing.retail.enabled;

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/25"
    >
      <div className={cn('relative flex h-32 items-center justify-center border-b bg-muted/40', TINTS[index % TINTS.length])}>
        <div className="absolute inset-0 bg-grid" />
        <div className="relative grid size-14 place-items-center rounded-xl border bg-background shadow-xs transition-transform duration-300 group-hover:-translate-y-0.5">
          <DynamicIcon name={product.icon} className="size-7" stroke={1.5} />
        </div>
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {retailOff ? (
            <Badge variant="secondary" className="bg-background/80 backdrop-blur">{t('products.institutionOnly')}</Badge>
          ) : (
            product.pricing.institution.enabled && (
              <Badge variant="secondary" className="bg-background/80 backdrop-blur">{t('products.bulk')}</Badge>
            )
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="leading-snug font-semibold">{l(product.name)}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{l(product.shortDescription)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            {price !== null ? (
              <p className="text-sm">
                <span className="text-xs text-muted-foreground">{t('common.from')} </span>
                <span className="text-lg font-bold">{formatINR(price)}</span>
                <span className="text-xs text-muted-foreground"> / {t(`units.${product.unit}`, { count: 1 })}</span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {book.minQty > 1 && (
                <span>{t('common.minOrder', { count: book.minQty, unit: t(`units.${product.unit}`, { count: book.minQty }) })} · </span>
              )}
              <IconClock className="size-3" />
              {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
            </p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <IconArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
