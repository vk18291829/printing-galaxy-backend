import { IconArrowRight, IconClock, IconSchool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { SafeImage } from '@/components/common/safe-image';
import { RatingChip } from '@/components/common/star-rating';
import { useAudience } from '@/features/auth/auth-store';
import { sectionOf, type Section } from '@/features/catalog/api';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Audience, Product } from '@/types/api';

/** The price book a visitor is quoted from: their own, or the catalogue's when theirs is closed. */
function offerBook(product: Product, audience: Audience) {
  return product.pricing[audience].enabled ? product.pricing[audience] : product.pricing[sectionOf(product)];
}

export function startingPrice(product: Product, audience: Audience) {
  const book = offerBook(product, audience);
  if (!book.enabled || book.tiers.length === 0) return null;
  return Math.min(...book.tiers.map((t) => t.unitPrice));
}

/** Quantity offers ("50+ ₹25 · 200+ ₹20"), the best one highlighted. */
export function OfferChips({ product, className }: { product: Product; className?: string }) {
  const { t } = useTranslation();
  const book = offerBook(product, useAudience());
  if (!book.enabled || book.tiers.length === 0) return <p className={cn('text-sm font-semibold text-primary', className)}>{t('product.quoteRequired')}</p>;
  const tiers = [...book.tiers].sort((a, b) => a.minQty - b.minQty);
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {tiers.map((tier, i) => (
        <span
          key={tier.minQty}
          className={cn(
            'inline-flex items-baseline gap-1 rounded-lg shadow-card px-2 py-1 text-xs tabular-nums',
            i === tiers.length - 1 && tiers.length > 1 && 'border-success/40 bg-success/8',
          )}
        >
          <span className="text-muted-foreground">{formatNumber(Math.max(tier.minQty, i === 0 ? book.minQty : tier.minQty))}+</span>
          <span className="font-bold">{formatINR(tier.unitPrice)}</span>
        </span>
      ))}
    </div>
  );
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
        <div className="grid size-full place-items-center text-primary">
          <DynamicIcon name={product.icon} className="size-10" stroke={1.5} />
        </div>
      }
    />
  );
}

/**
 * Product card: the picture leads, then the name, one line about it and "from ₹199 / card". The
 * whole card is the link (no repeated button on every card); a small arrow shows it opens.
 * School products add their minimum order (they are bought in bulk).
 */
export function ProductCard({ product, section }: { product: Product; index?: number; section?: Section }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const audience = useAudience();
  const book = offerBook(product, audience);
  const price = startingPrice(product, audience);
  const forSchools = (section ?? sectionOf(product)) === 'institution';
  // Individuals and guests only see what schools can order: no price, no cart.
  const showcase = forSchools && audience !== 'institution';
  const unit = t(`units.${product.unit}`, { count: 1 });

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[border-color] duration-200 hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative aspect-4/3 overflow-hidden border-b border-border bg-linear-to-b from-[#f3f7fd] to-[#e8effa]">
        <div className="size-full transition-transform duration-500 group-hover:scale-[1.04]">
          <ProductImage product={product} />
        </div>
        {!forSchools && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur">
            <IconClock className="size-3" />
            {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <h3 className="line-clamp-1 text-[15px] leading-snug font-bold text-foreground sm:text-base">{l(product.name)}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{l(product.shortDescription)}</p>
        {product.rating && product.rating.count > 0 && <RatingChip average={product.rating.average} count={product.rating.count} className="mt-1.5" />}

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {showcase ? (
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
              <IconSchool className="size-3.5" /> {t('products.forSchools')}
            </p>
          ) : (
            <div className="min-w-0">
              {price !== null ? (
                <p className="flex flex-wrap items-baseline gap-x-1">
                  <span className="text-xs text-muted-foreground">{t('products.startingAt')}</span>
                  <span className="text-lg font-extrabold text-foreground tabular-nums">{formatINR(price)}</span>
                  <span className="text-xs text-muted-foreground">/ {unit}</span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</p>
              )}
              {forSchools && book.minQty > 1 && (
                <p className="text-xs text-muted-foreground">{t('common.minOrder', { count: book.minQty, unit: t(`units.${product.unit}`, { count: book.minQty }) })}</p>
              )}
            </div>
          )}
          {/* The whole card opens the product; this only shows that it does. */}
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
          >
            <IconArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
