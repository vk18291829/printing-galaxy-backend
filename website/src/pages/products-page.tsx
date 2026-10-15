import { IconSearch, IconMoodEmpty } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useProducts } from '@/features/catalog/api';
import { ProductCard } from '@/features/catalog/components/product-card';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function ProductsPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? undefined;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300) || undefined;

  const { data: categories } = useCategories();
  const { data: products, isLoading, error, refetch, isFetching } = useProducts({ category, q });
  const active = categories?.find((c) => c.slug === category);
  useDocumentTitle(active ? l(active.name) : t('products.title'));

  const selectCategory = (slug?: string) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug);
    else next.delete('category');
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{active ? l(active.name) : t('products.title')}</h1>
          <p className="mt-2 text-muted-foreground">{active ? l(active.description) : t('products.subtitle')}</p>
        </div>
        <div className="relative w-full md:w-72">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('products.searchPlaceholder')}
            className="pl-9"
            aria-label={t('common.search')}
          />
        </div>
      </div>

      <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <button
          onClick={() => selectCategory()}
          className={cn(
            'shrink-0 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors',
            !category ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
          )}
        >
          {t('products.all')}
        </button>
        {categories?.map((c) => (
          <button
            key={c._id}
            onClick={() => selectCategory(c.slug)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              category === c.slug ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
            )}
          >
            <DynamicIcon name={c.icon} className="size-4" />
            {l(c.name)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : products?.length ? (
        <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', isFetching && 'opacity-70')}>
          {products.map((p, i) => (
            <ProductCard key={p._id} product={p} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<IconMoodEmpty />} title={t('products.empty')} />
      )}
    </div>
  );
}
