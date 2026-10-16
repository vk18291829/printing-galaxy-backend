import { IconArrowRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Rail } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/features/catalog/api';
import { useLocalized } from '@/lib/i18n';
import type { Product } from '@/types/api';
import { ProductCard } from './product-card';

/** Other products from the same category, shown under the product details. */
export function RelatedProducts({ product }: { product: Product }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data } = useProducts({ category: product.category.slug });
  const items = (data ?? []).filter((p) => p._id !== product._id);
  if (items.length === 0) return null;

  return (
    <section className="border-t py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('product.relatedTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('product.relatedSubtitle', { category: l(product.category.name) })}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link to={`/products?category=${product.category.slug}`}>
            {t('common.viewAll')} <IconArrowRight />
          </Link>
        </Button>
      </div>
      <Rail label={t('product.relatedTitle')} itemClassName="w-[72%] min-[480px]:w-[46%] md:w-[31%] lg:w-[calc(25%-9px)]">
        {items.map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </Rail>
    </section>
  );
}
