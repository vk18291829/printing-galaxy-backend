import { IconBolt, IconMoodEmpty, IconReceipt2, IconSearch, IconTruckDelivery, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { PageNav } from '@/components/common/page-nav';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useProducts } from '@/features/catalog/api';
import { RangeRails } from '@/features/catalog/components/range-rails';
import { PRODUCT_GRID } from '@/features/catalog/components/infinite-product-grid';
import { ProductCard } from '@/features/catalog/components/product-card';
import { categoryHome, NOT_INDIVIDUAL, SCHOOL_CATEGORIES } from '@/features/catalog/sections';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Category, Product } from '@/types/api';

const EXCLUDE = NOT_INDIVIDUAL.join(',');
const sectionId = (slug: string) => `cat-${slug}`;

/** One print colour per category, in order: cyan, magenta, yellow, orange. */
const TINTS = [
  { tile: 'border-[#c4eafc] bg-[#e9f7fe] hover:border-brand-cyan', icon: 'bg-white text-brand-cyan', badge: 'bg-brand-cyan/10 text-brand-cyan' },
  { tile: 'border-[#fcd0e2] bg-[#feedf4] hover:border-brand-magenta', icon: 'bg-white text-brand-magenta', badge: 'bg-brand-magenta/10 text-brand-magenta' },
  { tile: 'border-[#fde0ad] bg-[#fff5e4] hover:border-brand-amber', icon: 'bg-white text-amber-600', badge: 'bg-brand-yellow/15 text-amber-600' },
  { tile: 'border-[#d2ddef] bg-[#edf2fa] hover:border-primary', icon: 'bg-white text-primary', badge: 'bg-primary/10 text-primary' },
];

function scrollToCategory(slug: string) {
  document.getElementById(sectionId(slug))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** The category row currently under the sticky bar, for highlighting its pill. */
function useActiveSection(slugs: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = slugs.map((s) => document.getElementById(sectionId(s))).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('cat-', ''));
      },
      // A band just below the sticky bars.
      { rootMargin: '-140px 0px -55% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [slugs]);
  return active;
}

function matches(p: Product, needle: string) {
  return [p.name.en, p.name.hi, p.shortDescription?.en, p.shortDescription?.hi, ...(p.tags ?? [])].some((v) => v?.toLowerCase().includes(needle));
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  useDocumentTitle(t('seo.productsTitle'), { description: t('seo.productsDesc') });

  const { data: allCategories } = useCategories();
  const { data: products, isLoading, error, refetch } = useProducts({ excludeCategory: EXCLUDE });
  const categories = useMemo(() => allCategories?.filter((c) => ![...NOT_INDIVIDUAL, ...SCHOOL_CATEGORIES].includes(c.slug)) ?? [], [allCategories]);

  // Rows in catalogue order, each with every product of that category (search narrows them).
  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = needle ? (products ?? []).filter((p) => matches(p, needle)) : (products ?? []);
    return categories
      .map((c, i) => ({ category: c, tint: TINTS[i % TINTS.length]!, items: list.filter((p) => p.category.slug === c.slug) }))
      .filter((r) => r.items.length > 0);
  }, [categories, products, needle]);
  const slugs = useMemo(() => rows.map((r) => r.category.slug), [rows]);
  const active = useActiveSection(slugs);
  const found = rows.reduce((n, r) => n + r.items.length, 0);

  // Old links like /products?category=photo-printing land on that row.
  const linked = params.get('category');
  useEffect(() => {
    if (linked && slugs.includes(linked)) requestAnimationFrame(() => scrollToCategory(linked));
  }, [linked, slugs]);

  const setQuery = (value: string) => {
    setSearch(value);
    const next = new URLSearchParams(params);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    next.delete('category');
    setParams(next, { replace: true });
  };

  // Old links (banners, bookmarks) to business, wedding or school ranges go to their own page.
  if (linked && [...NOT_INDIVIDUAL, ...SCHOOL_CATEGORIES].includes(linked)) return <Navigate to={categoryHome(linked)} replace />;

  const trust = [
    { icon: IconBolt, label: t('products.trust1') },
    { icon: IconReceipt2, label: t('products.trust2') },
    { icon: IconTruckDelivery, label: t('products.trust3') },
  ];

  return (
    <div>
      {/* One compact band: what this page is, and a search. The category chips below jump to each row. */}
      <section className="border-b bg-muted">
        <div className="container-page grid gap-6 py-7 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end lg:gap-12">
          <div>
            <PageNav className="mb-4" items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.products') }]} />
            <p className="eyebrow mb-3">{t('products.heroEyebrow')}</p>
            <h1 className="text-[1.9rem] leading-tight font-extrabold tracking-tight text-brand-navy sm:text-4xl lg:text-[2.6rem]">
              {t('products.heroLead')} <span className="text-logo-gradient">{t('products.heroHighlight')}</span>
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground sm:text-lg">{t('products.subtitle')}</p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-brand-navy/80">
              {trust.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-1.5">
                  <Icon className="size-4 text-primary" /> {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <IconSearch className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="product-search"
              // The header search icon opens this page at #search with the cursor here.
              autoFocus={location.hash === '#search'}
              value={search}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              aria-label={t('common.search')}
              className="h-13 w-full rounded-xl border bg-card pr-12 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('common.clear')}
              >
                <IconX className="size-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Sticky jump bar: one pill per category row, lit for the row on screen. */}
      {rows.length > 1 && (
        <div className="sticky top-16 z-30 border-b bg-background/90 backdrop-blur-xl lg:top-[72px]">
          <nav className="container-page scrollbar-none flex gap-2 overflow-x-auto py-3" aria-label={t('products.browseCategories')}>
            {rows.map(({ category: c, items }) => (
              <button
                key={c._id}
                type="button"
                onClick={() => scrollToCategory(c.slug)}
                aria-current={active === c.slug ? 'true' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2 rounded-full bg-muted px-4 text-sm font-semibold transition-colors',
                  active === c.slug ? 'border-brand-navy bg-brand-navy text-white' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <DynamicIcon name={c.icon} className="size-4" />
                {l(c.name)}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active === c.slug ? 'bg-white/20' : 'bg-muted')}>{/* While searching, how many match in this category. */}{items.length}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="container-page section-y space-y-14 pt-8 sm:pt-10 lg:space-y-16">
        {needle && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t('products.resultsFor', { q: search.trim() })} · {t('products.count', { count: found })}
            <button type="button" onClick={() => setQuery('')} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 font-medium hover:text-foreground">
              <IconX className="size-3.5" /> {t('products.clearFilters')}
            </button>
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-60" />
            <div className={PRODUCT_GRID}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed">
            <EmptyState icon={<IconMoodEmpty />} title={t('products.empty')} />
            {needle && (
              <div className="flex justify-center pb-10">
                <Button variant="outline" onClick={() => setQuery('')}>
                  <IconX /> {t('products.clearFilters')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          rows.map(({ category, tint, items }) => <CategoryRow key={category._id} category={category} badge={tint.badge} items={items} />)
        )}
      </div>

      {/* After all products: the shop's other ranges. Hidden while searching, so results stay in focus. */}
      {!needle && !isLoading && !error && (
        <div className="container-page">
          <RangeRails />
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category, badge, items }: { category: Category; badge: string; items: Product[] }) {
  const l = useLocalized();
  return (
    <section id={sectionId(category.slug)} className="scroll-mt-36 lg:scroll-mt-40" aria-labelledby={`${sectionId(category.slug)}-title`}>
      <div className="mb-5 flex items-center gap-3.5 border-b pb-4">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', badge)}>
          <DynamicIcon name={category.icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${sectionId(category.slug)}-title`} className="flex flex-wrap items-center gap-2 text-xl font-bold text-brand-navy sm:text-2xl">
            {l(category.name)}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground tabular-nums">{items.length}</span>
          </h2>
          {l(category.description) && <p className="mt-0.5 text-sm text-muted-foreground">{l(category.description)}</p>}
        </div>
      </div>
      <div className={PRODUCT_GRID}>
        {items.map((p) => (
          <ProductCard key={p._id} product={p} section="retail" />
        ))}
      </div>
    </section>
  );
}
