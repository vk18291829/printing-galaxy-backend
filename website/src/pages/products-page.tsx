import { IconArrowsSort, IconLayoutGrid, IconMoodEmpty, IconSearch, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { PageNav } from '@/components/common/page-nav';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRODUCT_SORTS, useCategories, type ProductSort } from '@/features/catalog/api';
import { InfiniteProductGrid } from '@/features/catalog/components/infinite-product-grid';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const CHIP = 'flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
const CHIP_ON = 'border-foreground bg-foreground text-background';
const CHIP_OFF = 'bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground';

export default function ProductsPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? undefined;
  const sort = (PRODUCT_SORTS as string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as ProductSort) : 'popular';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300) || undefined;

  const { data: categories } = useCategories();
  const active = categories?.find((c) => c.slug === category);
  useDocumentTitle(active ? l(active.name) : t('products.title'));

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearAll = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const filtered = Boolean(category || q || sort !== 'popular');

  return (
    <div>
      {/* Header band */}
      <section className="relative overflow-hidden border-b bg-muted/30">
        <div className="pointer-events-none absolute -top-24 right-0 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="container-page relative py-8 sm:py-10">
          <PageNav
            className="mb-5"
            items={[{ label: t('nav.home'), to: '/' }, ...(active ? [{ label: t('nav.products'), to: '/products' }, { label: l(active.name) }] : [{ label: t('nav.products') }])]}
          />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
                {active ? <DynamicIcon name={active.icon} className="size-7" /> : <IconLayoutGrid className="size-7" />}
              </span>
              <div>
                <p className="eyebrow mb-1.5">{t('products.heroEyebrow')}</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{active ? l(active.name) : t('products.title')}</h1>
                <p className="mt-2 max-w-2xl text-muted-foreground">{active ? l(active.description) : t('products.subtitle')}</p>
              </div>
            </div>
            <div className="relative w-full lg:w-96">
              <IconSearch className="absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setParam('q', e.target.value.trim() || undefined);
                }}
                placeholder={t('products.searchPlaceholder')}
                className="h-12 rounded-xl bg-background pr-10 pl-10 text-base shadow-xs"
                aria-label={t('common.search')}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setParam('q');
                  }}
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t('common.clear')}
                >
                  <IconX className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* The one filter bar: categories and sort. Sticks under the header while scrolling. */}
      <div className="sticky top-16 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="container-page flex items-center gap-3 py-3">
          <div className="scrollbar-none -ml-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5 pr-8 pl-1 [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)]">
            <button type="button" onClick={() => setParam('category')} className={cn(CHIP, !category ? CHIP_ON : CHIP_OFF)} aria-pressed={!category}>
              {t('products.all')}
            </button>
            {categories?.map((c) => (
              <button
                type="button"
                key={c._id}
                onClick={() => setParam('category', c.slug)}
                className={cn(CHIP, category === c.slug ? CHIP_ON : CHIP_OFF)}
                aria-pressed={category === c.slug}
              >
                <DynamicIcon name={c.icon} className="size-4" />
                {l(c.name)}
              </button>
            ))}
          </div>
          <Select value={sort} onValueChange={(v) => setParam('sort', v === 'popular' ? undefined : v)}>
            <SelectTrigger className="h-9 w-auto shrink-0 gap-2 rounded-full" aria-label={t('products.sort')}>
              <IconArrowsSort className="size-4 text-muted-foreground" />
              <span className="hidden sm:inline">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              {PRODUCT_SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`products.sorts.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="container-page py-8">
        <InfiniteProductGrid
          key={`${category ?? 'all'}-${sort}`}
          category={category}
          q={q}
          sort={sort}
          header={(total) => (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {q ? `${t('products.resultsFor', { q })} · ` : ''}
                {t('products.count', { count: total })}
              </p>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <IconX /> {t('products.clearFilters')}
                </Button>
              )}
            </div>
          )}
          empty={
            <div className="rounded-2xl border border-dashed">
              <EmptyState icon={<IconMoodEmpty />} title={t('products.empty')} />
              {filtered && (
                <div className="flex justify-center pb-10">
                  <Button variant="outline" onClick={clearAll}>
                    <IconX /> {t('products.clearFilters')}
                  </Button>
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
