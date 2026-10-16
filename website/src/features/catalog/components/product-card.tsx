import { IconArrowRight, IconClock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { SafeImage } from '@/components/common/safe-image';
import { RatingChip } from '@/components/common/star-rating';
import { Badge } from '@/components/ui/badge';
import { useAudience } from '@/features/auth/auth-store';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { Product } from '@/types/api';

export function startingPrice(product: Product, audience: 'retail' | 'institution') {
  const book = product.pricing[audience].enabled ? product.pricing[audience] : product.pricing.retail;
  if (!book.enabled || book.tiers.length === 0) return null;
  return Math.min(...book.tiers.map((t) => t.unitPrice));
}

/** Product image, or the product icon on a quiet tile when no photo has been added yet. */
export function ProductImage({ product, className }: { product: Pick<Product, 'images' | 'icon' | 'name'>; className?: string }) {
  const l = useLocalized();
  return (
    <SafeImage
      src={product.images?.[0]}
      alt={l(product.name)}
      loading="lazy"
      className={className ?? 'size-full object-cover'}
      fallback={
        <div className="grid size-full place-items-center bg-muted text-primary">
          <DynamicIcon name={product.icon} className="size-10" stroke={1.5} />
        </div>
      }
    />
  );
}

export function ProductCard({ product }: { product: Product; index?: number }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const audience = useAudience();
  const book = product.pricing[audience].enabled ? product.pricing[audience] : product.pricing.retail;
  const price = startingPrice(product, audience);
  const retailOff = !product.pricing.retail.enabled;

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative aspect-4/3 overflow-hidden border-b">
        <div className="size-full transition-transform duration-500 group-hover:scale-[1.03]">
          <ProductImage product={product} />
        </div>
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {retailOff ? (
            <Badge variant="secondary" className="bg-background/90 backdrop-blur">{t('products.institutionOnly')}</Badge>
          ) : (
            product.pricing.institution.enabled && (
              <Badge variant="secondary" className="bg-background/90 backdrop-blur">{t('products.bulk')}</Badge>
            )
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start gap-2">
          <DynamicIcon name={product.icon} className="mt-0.5 size-4 shrink-0 text-primary" />
          <h3 className="leading-snug font-semibold">{l(product.name)}</h3>
        </div>
        {product.rating && product.rating.count > 0 && <RatingChip average={product.rating.average} count={product.rating.count} />}
        <p className="line-clamp-2 text-sm text-muted-foreground">{l(product.shortDescription)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            {price !== null ? (
              <p className="text-sm">
                <span className="text-xs text-muted-foreground">{t('common.from')} </span>
                <span className="text-lg font-semibold tabular-nums">{formatINR(price)}</span>
                <span className="text-xs text-muted-foreground"> / {t(`units.${product.unit}`, { count: 1 })}</span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</p>
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {book.minQty > 1 && (
                <span>{t('common.minOrder', { count: book.minQty, unit: t(`units.${product.unit}`, { count: book.minQty }) })} ·</span>
              )}
              <IconClock className="size-3" />
              {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
            </p>
          </div>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
            <IconArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
