import { IconArrowRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Rail } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { sectionOf, useProducts } from '@/features/catalog/api';
import { BUSINESS_CATEGORIES, SCHOOL_CATEGORIES, WEDDING_CATEGORIES } from '@/features/catalog/sections';
import type { Product } from '@/types/api';
import { ProductCard } from './product-card';

const MAX = 8;
type Range = 'business' | 'wedding' | 'school';

function rangeOf(product: Product): Range | null {
  const slug = product.category.slug;
  if (BUSINESS_CATEGORIES.includes(slug)) return 'business';
  if (WEDDING_CATEGORIES.includes(slug)) return 'wedding';
  if (SCHOOL_CATEGORIES.includes(slug) || sectionOf(product) === 'institution') return 'school';
  return null;
}

function RangeRail({ title, subtitle, to, items }: { title: string; subtitle: string; to: string; items: Product[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section className="border-t py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link to={to}>
            {t('common.viewAll')} <IconArrowRight />
          </Link>
        </Button>
      </div>
      <Rail label={title} itemClassName="w-[72%] min-[480px]:w-[46%] md:w-[31%] lg:w-[calc(25%-9px)]">
        {items.slice(0, MAX).map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </Rail>
    </section>
  );
}

/**
 * The shop's other ranges: business printing, wedding & invitations, and school & college
 * solutions. Shown after all products on the Products page, and at the end of a product page,
 * where the range of the product being viewed is left out (its products are listed above it).
 */
export function RangeRails({ product }: { product?: Product }) {
  const { t } = useTranslation();
  const current = product ? rangeOf(product) : null;
  const [works, banners, stationery] = [
    useProducts({ category: BUSINESS_CATEGORIES[0] }),
    useProducts({ category: BUSINESS_CATEGORIES[1] }),
    useProducts({ category: BUSINESS_CATEGORIES[2] }),
  ];
  const wedding = useProducts({ category: WEDDING_CATEGORIES[0] });
  const school = useProducts({ section: 'institution', category: SCHOOL_CATEGORIES[0] });
  const other = (list: Product[] | undefined) => (list ?? []).filter((p) => p._id !== product?._id);

  return (
    <>
      {current !== 'business' && (
        <RangeRail
          title={t('nav.businessPrinting')}
          subtitle={t('product.rangeBusiness')}
          to="/business-printing"
          items={other([...(works.data ?? []), ...(banners.data ?? []), ...(stationery.data ?? [])])}
        />
      )}
      {current !== 'wedding' && (
        <RangeRail title={t('nav.weddingCards')} subtitle={t('product.rangeWedding')} to="/wedding-cards" items={other(wedding.data)} />
      )}
      {current !== 'school' && (
        <RangeRail title={t('nav.schoolSolutions')} subtitle={t('product.rangeSchool')} to="/institutions" items={other(school.data)} />
      )}
    </>
  );
}
