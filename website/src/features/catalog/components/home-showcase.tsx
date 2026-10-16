import { IconArrowRight, IconCheck, IconHeartFilled, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { RatingChip } from '@/components/common/star-rating';
import { Section } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudience } from '@/features/auth/auth-store';
import { useProducts } from '@/features/catalog/api';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';
import { InfiniteProductGrid } from './infinite-product-grid';
import { ProductImage, startingPrice } from './product-card';

export const WEDDING_CATEGORY = 'wedding-invitations';

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

/** Large wedding & invitations feature: story on the left, four products on the right. */
export function WeddingSpotlight() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data, isLoading } = useProducts({ category: WEDDING_CATEGORY });
  const points = t('home.weddingPoints', { returnObjects: true }) as string[];
  if (!isLoading && !data?.length) return null;
  const items = (data ?? []).slice().sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)).slice(0, 4);

  return (
    <section className="container-page py-8 sm:py-10">
      <div className="relative isolate overflow-hidden rounded-3xl bg-[#2a0a1c] text-white">
        <div className="pointer-events-none absolute -top-32 -left-20 -z-10 size-[28rem] rounded-full bg-[#d9138a]/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-40 -z-10 size-[30rem] rounded-full bg-[#f5b94a]/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />

        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-12">
          <div className="space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f5d08a] ring-1 ring-white/15">
              <IconHeartFilled className="size-3.5" /> {t('home.weddingEyebrow')}
            </p>
            <h2 className="text-3xl leading-tight font-bold text-balance sm:text-4xl">{t('home.weddingTitle')}</h2>
            <p className="max-w-md text-white/75">{t('home.weddingSubtitle')}</p>
            <ul className="grid gap-2 text-sm">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <IconCheck className="size-4 text-[#f5d08a]" /> {p}
                </li>
              ))}
            </ul>
            <Button size="lg" className="bg-white text-[#2a0a1c] hover:bg-white/90" asChild>
              <Link to={`/products?category=${WEDDING_CATEGORY}`}>
                {t('home.weddingCta')} <IconArrowRight />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-2xl bg-white/10" />)
              : items.map((p, i) => (
                  <Link
                    key={p._id}
                    to={`/products/${p.slug}`}
                    className={cn(
                      'group relative block overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none',
                      i % 2 === 1 && 'sm:translate-y-6 sm:hover:translate-y-5',
                    )}
                  >
                    <div className="aspect-[4/5] overflow-hidden">
                      <div className="size-full transition-transform duration-500 group-hover:scale-105">
                        <ProductImage product={p} />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent p-3 pt-10">
                      <p className="line-clamp-2 text-sm leading-snug font-semibold">{l(p.name)}</p>
                      <p className="mt-0.5 text-xs text-white/80">
                        <PriceTag product={p} />
                      </p>
                    </div>
                  </Link>
                ))}
          </div>
        </div>
      </div>
    </section>
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
                'group relative isolate flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                big && 'col-span-2 lg:row-span-2',
              )}
            >
              <div className={cn('relative overflow-hidden', big ? 'aspect-[4/3] lg:aspect-auto lg:flex-1' : 'aspect-[4/3]')}>
                <div className="size-full transition-transform duration-500 group-hover:scale-[1.04]">
                  <ProductImage product={p} className="size-full object-cover" />
                </div>
                {big && (
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-1 text-xs font-bold text-zinc-950">
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
      <InfiniteProductGrid sort="newest" />
    </Section>
  );
}
