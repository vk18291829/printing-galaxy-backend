import { IconCircleCheck, IconMoodEmpty } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrowseProducts, type ProductSort, type Section } from '@/features/catalog/api';
import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';
import { ProductCard } from './product-card';

export const PRODUCT_GRID = 'grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

/**
 * Product grid that loads the next page as the visitor nears the bottom. A "Load more" button
 * stays as a fallback for keyboard users and when the observer is unavailable.
 */
export function InfiniteProductGrid({
  category,
  section,
  excludeCategory,
  q,
  sort = 'popular',
  empty,
  header,
}: {
  category?: string;
  section?: Section;
  excludeCategory?: string;
  q?: string;
  sort?: ProductSort;
  empty?: ReactNode;
  /** Rendered above the grid with the total once known (e.g. "24 products"). */
  header?: (total: number, shown: number) => ReactNode;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error, refetch, isPlaceholderData } = useBrowseProducts({ category, section, excludeCategory, q, sort });
  const products = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const sentinel = useInView<HTMLDivElement>(() => void fetchNextPage(), {
    enabled: Boolean(hasNextPage) && !isFetchingNextPage,
    resetKey: data?.pages.length,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading) {
    return (
      <div className={PRODUCT_GRID}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    );
  }
  if (products.length === 0) return <>{empty ?? <EmptyState icon={<IconMoodEmpty />} title={t('products.empty')} />}</>;

  return (
    <div>
      {header?.(total, products.length)}
      <div className={cn(PRODUCT_GRID, isPlaceholderData && isFetching && 'opacity-60 transition-opacity')}>
        {products.map((p) => (
          <ProductCard key={p._id} product={p} section={section} />
        ))}
        {isFetchingNextPage && Array.from({ length: 4 }).map((_, i) => <Skeleton key={`s${i}`} className="h-80 rounded-xl" />)}
      </div>

      <div ref={sentinel} className="flex min-h-20 items-center justify-center py-8" aria-live="polite">
        {hasNextPage ? (
          isFetchingNextPage ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> {t('products.loadingMore')}
            </span>
          ) : (
            <Button variant="outline" onClick={() => void fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          )
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconCircleCheck className="size-4 text-success" /> {t('products.endOfList')} · {t('products.showing', { shown: products.length, total })}
          </span>
        )}
      </div>
    </div>
  );
}
