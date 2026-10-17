import { IconArrowRight, IconBuildingCommunity, IconCheck, IconInfoCircle, IconUser } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAudience } from '@/features/auth/auth-store';
import { useCategories, useProducts } from '@/features/catalog/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Audience, Product } from '@/types/api';

function TierChips({ product, audience }: { product: Product; audience: Audience }) {
  const { t } = useTranslation();
  const book = product.pricing[audience];
  if (!book.enabled) return <span className="text-sm text-muted-foreground">{t('pricing.notOffered')}</span>;
  if (book.tiers.length === 0) return <span className="text-sm font-semibold text-primary">{t('pricing.onRequest')}</span>;
  const tiers = [...book.tiers].sort((a, b) => a.minQty - b.minQty);
  return (
    <div className="flex flex-wrap gap-1.5">
      {tiers.map((tier, i) => (
        <span
          key={tier.minQty}
          className={cn(
            'inline-flex items-baseline gap-1 rounded-lg border px-2 py-1 text-xs tabular-nums',
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

function PriceBookView({ audience }: { audience: Audience }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: categories } = useCategories();
  const { data: products, isLoading, error, refetch } = useProducts();

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !categories) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {categories
        .filter((c) => c.audiences.includes(audience))
        .map((category) => {
          const items = (products ?? []).filter(
            (p) => p.category._id === category._id && p.pricing[audience].enabled,
          );
          if (items.length === 0) return null;
          return (
            <section key={category._id} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-center gap-3 border-b bg-muted/40 px-5 py-4">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <DynamicIcon name={category.icon} className="size-5" />
                </span>
                <h2 className="text-lg font-semibold">{l(category.name)}</h2>
              </header>
              <ul className="divide-y">
                {items.map((p) => {
                  const book = p.pricing[audience];
                  return (
                    <li key={p._id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_0.6fr_1.6fr_auto] md:items-center">
                      <div>
                        <Link to={`/products/${p.slug}`} className="font-medium hover:text-primary">
                          {l(p.name)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {t('common.perUnit', { unit: t(`units.${p.unit}`, { count: 1 }) })}
                        </p>
                      </div>
                      <div className="text-sm">
                        <span className="text-xs text-muted-foreground md:hidden">{t('pricing.minOrder')}: </span>
                        <span className="font-medium tabular-nums">
                          {formatNumber(book.minQty)} {t(`units.${p.unit}`, { count: book.minQty })}
                        </span>
                      </div>
                      <TierChips product={p} audience={audience} />
                      <Button size="sm" variant="outline" className="justify-self-start md:justify-self-end" asChild>
                        <Link to={`/products/${p.slug}`}>
                          {t('pricing.orderCta')} <IconArrowRight />
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconInfoCircle className="size-4" /> {t('pricing.taxNote')}
      </p>
    </div>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const audience = useAudience();
  useDocumentTitle(t('nav.pricing'));
  const compare = t('pricing.compare', { returnObjects: true }) as string[];

  return (
    <div className="container-page py-12">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">{t('pricing.title')}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t('pricing.subtitle')}</p>
      </div>

      <Tabs defaultValue={audience} className="gap-8">
        <TabsList className="mx-auto h-auto w-full max-w-xl p-1.5">
          <TabsTrigger value="retail" className="h-auto flex-col gap-0.5 py-2.5 whitespace-normal">
            <span className="flex items-center gap-2 text-base">
              <IconUser /> {t('pricing.individual')}
            </span>
            <span className="hidden text-xs font-normal text-muted-foreground sm:block">{t('pricing.individualHint')}</span>
          </TabsTrigger>
          <TabsTrigger value="institution" className="h-auto flex-col gap-0.5 py-2.5 whitespace-normal">
            <span className="flex items-center gap-2 text-base">
              <IconBuildingCommunity /> {t('pricing.institution')}
            </span>
            <span className="hidden text-xs font-normal text-muted-foreground sm:block">{t('pricing.institutionHint')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="retail">
          <PriceBookView audience="retail" />
        </TabsContent>

        <TabsContent value="institution" className="space-y-8">
          <div className="grid gap-6 rounded-2xl bg-zinc-950 p-7 ring-1 ring-white/10 text-white md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-xl font-bold">{t('pricing.compareTitle')}</h2>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {compare.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-white/85">
                    <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-yellow" /> {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-white/60">{t('pricing.approvedOnly')}</p>
            </div>
            {audience !== 'institution' && (
              <Button size="lg" className="bg-white text-zinc-950 hover:bg-white/90" asChild>
                <Link to="/institutions/register">
                  {t('pricing.registerCta')} <IconArrowRight />
                </Link>
              </Button>
            )}
          </div>
          <PriceBookView audience="institution" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
