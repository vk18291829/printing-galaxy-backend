import { IconArrowRight, IconClock } from '@tabler/icons-react';
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
        <div className="grid size-full place-items-center bg-muted text-primary">
          <DynamicIcon name={product.icon} className="size-10" stroke={1.5} />
        </div>
      }
    />
  );
}

/** "from ₹80 / card" and the lead time, for everyday (individual) products. */
function PriceAndLeadTime({ product }: { product: Product }) {
  const { t } = useTranslation();
  const audience = useAudience();
  const book = offerBook(product, audience);
  const price = startingPrice(product, audience);
  return (
    <div className="min-w-0">
      {price !== null ? (
        <p className="text-sm">
          <span className="text-xs text-muted-foreground">{t('common.from')} </span>
          <span className="text-lg font-bold text-brand-navy tabular-nums">{formatINR(price)}</span>
          <span className="text-xs text-muted-foreground"> / {t(`units.${product.unit}`, { count: 1 })}</span>
        </p>
      ) : (
        <p className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</p>
      )}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        {book.minQty > 1 && <span>{t('common.minOrder', { count: book.minQty, unit: t(`units.${product.unit}`, { count: book.minQty }) })} ·</span>}
        <IconClock className="size-3" />
        {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
      </p>
    </div>
  );
}

/** `section` forces the card style (e.g. the Institutions page); otherwise it follows the product's category. */
export function ProductCard({ product, section }: { product: Product; index?: number; section?: Section }) {
  const { t } = useTranslation();
  const l = useLocalized();

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group @container flex h-full flex-col overflow-hidden rounded-xl shadow-card bg-card transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative aspect-4/3 overflow-hidden border-b bg-muted">
        <div className="size-full transition-transform duration-500 group-hover:scale-[1.03]">
          <ProductImage product={product} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start gap-2">
          <DynamicIcon name={product.icon} className="mt-0.5 size-4 shrink-0 text-primary" />
          <h3 className="text-base leading-snug font-semibold text-brand-navy sm:text-[17px]">{l(product.name)}</h3>
        </div>
        {product.rating && product.rating.count > 0 && <RatingChip average={product.rating.average} count={product.rating.count} />}
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{l(product.shortDescription)}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {/* School products: quantity offers only, no price-from or delivery time. */}
          {(section ?? sectionOf(product)) === 'institution' ? <OfferChips product={product} className="min-w-0" /> : <PriceAndLeadTime product={product} />}
          {/* Label shows once the card is wide enough; narrow two-column phones get the arrow alone. */}
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-sm font-semibold text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
            <span className="hidden @[15rem]:inline">{t('products.order')}</span>
            <IconArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
