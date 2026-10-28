import { IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { RatingChip } from '@/components/common/star-rating';
import { Section } from '@/components/common/section';
import { useAudience } from '@/features/auth/auth-store';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';
import { InfiniteProductGrid } from './infinite-product-grid';
import { ProductImage, startingPrice } from './product-card';

/** Wedding products are kept off the home page for now; they stay on the Products page. */
export const HOME_HIDDEN_CATEGORY = 'wedding-invitations';

function PriceTag({ product }: { product: Product }) {
  const { t } = useTranslation();
  const price = startingPrice(product, useAudience());
  return price === null ? (
    <span>{t('product.quoteRequired')}</span>
  ) : (
    <span>
      {t('common.from')} <span className="font-semibold tabular-nums">{formatINR(price)}</span>
    </span>
  );
}

/** Bento grid of bestsellers: one large tile, the rest smaller. */
export function Highlights({ products }: { products: Product[] }) {
  const { t } = useTranslation();
  const l = useLocalized();
  if (products.length === 0) return null;
  // One 2×2 tile plus eight small ones fills a four-column grid with no gaps.
  const items = products.slice(0, 9);

  return (
    <Section title={t('home.highlightsTitle')} subtitle={t('home.highlightsSubtitle')} viewAll="/products">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:auto-rows-fr lg:grid-cols-4">
        {items.map((p, i) => {
          const big = i === 0;
          return (
            <Link
              key={p._id}
              to={`/products/${p.slug}`}
              className={cn(
                'group relative isolate flex flex-col overflow-hidden rounded-2xl shadow-card bg-card transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                big && 'col-span-2 lg:row-span-2',
              )}
            >
              <div className={cn('relative overflow-hidden', big ? 'aspect-[4/3] lg:aspect-auto lg:flex-1' : 'aspect-[4/3]')}>
                <div className="size-full transition-transform duration-500 group-hover:scale-[1.04]">
                  <ProductImage product={p} className="size-full object-cover" />
                </div>
                {big && (
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-1 text-xs font-bold text-brand-navy">
                    <IconSparkles className="size-3.5" /> {t('home.eyebrowFeatured')}
                  </span>
                )}
              </div>
              <div className={cn('space-y-1 p-3 sm:p-4', big && 'sm:p-5')}>
                <p className={cn('line-clamp-2 leading-snug font-semibold', big ? 'text-lg sm:text-xl' : 'text-sm')}>{l(p.name)}</p>
                {big && <p className="line-clamp-2 text-sm text-muted-foreground">{l(p.shortDescription)}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <PriceTag product={p} />
                  {p.rating && p.rating.count > 0 && <RatingChip average={p.rating.average} count={p.rating.count} />}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/** Last home section: the whole catalogue, loading more as the visitor scrolls. */
export function ExploreEverything() {
  const { t } = useTranslation();
  return (
    <Section title={t('home.exploreTitle')} subtitle={t('home.exploreSubtitle')} viewAll="/products" className="pt-14">
      <InfiniteProductGrid sort="newest" excludeCategory={HOME_HIDDEN_CATEGORY} />
    </Section>
  );
}
