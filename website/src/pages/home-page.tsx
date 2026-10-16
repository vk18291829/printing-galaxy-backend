import {
  IconArrowRight,
  IconBuildingCommunity,
  IconCheck,
  IconCreditCard,
  IconHandFinger,
  IconLayoutGrid,
  IconPackage,
  IconReceipt2,
  IconRosetteDiscountCheck,
  IconShieldLock,
  IconUpload,
  IconUser,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Rail, Section } from '@/components/common/section';
import { StarRating } from '@/components/common/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useProducts } from '@/features/catalog/api';
import { ProductCard } from '@/features/catalog/components/product-card';
import { ExploreEverything, Highlights, WEDDING_CATEGORY, WeddingSpotlight } from '@/features/catalog/components/home-showcase';
import { useBanners } from '@/features/marketing/api';
import { HeroCarousel } from '@/features/marketing/hero-carousel';
import { FeatureBanner, PromoTiles } from '@/features/marketing/promo-banners';
import { useReviewHighlights } from '@/features/reviews/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import type { Banner, Product } from '@/types/api';

function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md select-none" aria-hidden>
      <div className="absolute inset-6 rounded-[2.5rem] bg-linear-to-br from-brand-blue/20 via-brand-cyan/10 to-brand-magenta/15 blur-2xl" />
      <div className="absolute inset-0 rounded-[2.5rem] bg-grid opacity-60" />

      {/* Notes document */}
      <div className="absolute top-[8%] left-[6%] w-[52%] rotate-[-7deg] rounded-xl border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-red-500/10 text-[10px] font-bold text-red-500">PDF</span>
          <span className="h-2 w-20 rounded bg-foreground/15" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="mb-2 block h-1.5 rounded bg-foreground/10" style={{ width: `${90 - i * 9}%` }} />
        ))}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/8 px-2 py-1.5 text-[11px] font-semibold text-primary">
          <span>120 pages</span>
          <span>₹180</span>
        </div>
      </div>

      {/* PVC / ID card */}
      <div className="absolute top-[38%] right-[4%] w-[58%] rotate-[5deg] overflow-hidden rounded-2xl bg-zinc-900 p-4 text-white shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-widest uppercase opacity-70">Student ID</span>
          <img src="/logo.png" alt="" className="size-6 rounded bg-white p-0.5" />
        </div>
        <div className="flex gap-3">
          <div className="size-14 shrink-0 rounded-lg bg-linear-to-br from-brand-sky to-brand-blue" />
          <div className="flex-1 space-y-1.5 pt-1">
            <span className="block h-2 w-4/5 rounded bg-white/80" />
            <span className="block h-1.5 w-3/5 rounded bg-white/40" />
            <span className="block h-1.5 w-2/5 rounded bg-white/40" />
          </div>
        </div>
        <div className="mt-3 h-1 rounded-full cmyk-strip" />
        <p className="mt-2 text-right text-[9px] opacity-60">8.6 × 5.4 cm</p>
      </div>

      {/* Key chain */}
      <div className="absolute bottom-[7%] left-[14%] flex rotate-[-4deg] items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xl">
        <span className="grid size-10 place-items-center rounded-full bg-brand-magenta/12 text-brand-magenta">
          <DynamicIcon name="key" className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold">Photo key chain</p>
          <p className="text-[11px] text-muted-foreground">Proof approved ✓</p>
        </div>
      </div>

      <span className="absolute top-[4%] right-[16%] size-4 rounded-full bg-brand-cyan" />
      <span className="absolute right-[10%] bottom-[20%] size-3 rounded-full bg-brand-yellow" />
      <span className="absolute bottom-[34%] left-[3%] size-2.5 rounded-full bg-brand-magenta" />
    </div>
  );
}

function Hero() {
  const { t } = useTranslation();
  const { data: products } = useProducts();

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-linear-to-b from-primary/6 to-transparent" />
      <div className="container-page relative grid items-center gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div className="space-y-7">
          <Badge variant="soft" className="gap-1.5 px-3 py-1 text-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {t('home.badge')}
          </Badge>
          <h1 className="text-4xl leading-[1.08] font-bold sm:text-5xl lg:text-6xl">
            {t('home.titleLead')} <span className="text-brand-gradient">{t('home.titleHighlight')}</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t('home.subtitle')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="brand" asChild>
              <Link to="/products">
                {t('home.ctaPrimary')} <IconArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">{t('home.ctaSecondary')}</Link>
            </Button>
          </div>
          <dl className="grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
            <div>
              <dt className="text-2xl font-bold">{products?.length ?? '30'}+</dt>
              <dd className="text-xs text-muted-foreground">{t('home.statProducts')}</dd>
            </div>
            <div>
              <dt className="text-2xl font-bold">24h</dt>
              <dd className="text-xs text-muted-foreground">{t('home.statSameDay')}</dd>
            </div>
            <div>
              <dt className="text-2xl font-bold">EN · हि</dt>
              <dd className="text-xs text-muted-foreground">{t('home.statLanguages')}</dd>
            </div>
          </dl>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function TrustStrip() {
  const { t } = useTranslation();
  const items = [
    { icon: IconShieldLock, text: t('home.trustSecure') },
    { icon: IconHandFinger, text: t('home.trustProof') },
    { icon: IconReceipt2, text: t('home.trustPrice') },
  ];
  return (
    <section className="border-y bg-muted/30">
      <div className="container-page grid gap-4 py-5 sm:grid-cols-3">
        {items.map(({ icon: Icon, text }) => (
          <p key={text} className="flex items-center gap-3 text-sm font-medium">
            <Icon className="size-5 shrink-0 text-primary" /> {text}
          </p>
        ))}
      </div>
    </section>
  );
}

function AudienceSplit() {
  const { t } = useTranslation();
  const individualPoints = t('home.individualPoints', { returnObjects: true }) as string[];
  const institutionPoints = t('home.institutionPoints', { returnObjects: true }) as string[];

  return (
    <section className="container-page py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="eyebrow mb-2">{t('home.eyebrowAudience')}</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('home.audienceTitle')}</h2>
        <p className="mt-3 text-muted-foreground">{t('home.audienceSubtitle')}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative flex flex-col overflow-hidden rounded-xl border bg-card p-7 sm:p-9">
          <div className="absolute -top-16 -right-16 size-48 rounded-full bg-brand-cyan/10 blur-2xl" />
          <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-brand-cyan/12 text-brand-cyan">
            <IconUser className="size-6" />
          </span>
          <h3 className="text-2xl font-bold">{t('home.individualTitle')}</h3>
          <p className="mt-2 text-muted-foreground">{t('home.individualDesc')}</p>
          <ul className="my-6 space-y-3">
            {individualPoints.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm">
                <IconCheck className="size-4 shrink-0 text-success" /> {p}
              </li>
            ))}
          </ul>
          <Button className="mt-auto w-fit" asChild>
            <Link to="/products">
              {t('home.individualCta')} <IconArrowRight />
            </Link>
          </Button>
        </div>

        <div className="relative flex flex-col overflow-hidden rounded-2xl bg-zinc-950 p-7 text-white ring-1 ring-white/10 sm:p-9">
          <div className="absolute -top-20 -right-10 size-56 rounded-full bg-brand-blue/40 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-1 cmyk-strip" />
          <span className="relative mb-5 grid size-12 place-items-center rounded-2xl bg-white/10 text-brand-yellow">
            <IconBuildingCommunity className="size-6" />
          </span>
          <h3 className="relative text-2xl font-bold">{t('home.institutionTitle')}</h3>
          <p className="relative mt-2 text-white/70">{t('home.institutionDesc')}</p>
          <ul className="relative my-6 space-y-3">
            {institutionPoints.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm">
                <IconCheck className="size-4 shrink-0 text-brand-yellow" /> {p}
              </li>
            ))}
          </ul>
          <Button className="relative mt-auto w-fit bg-white text-zinc-950 hover:bg-white/90" asChild>
            <Link to="/institutions">
              {t('home.institutionCta')} <IconArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function CategoryCircles() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data, isLoading } = useCategories();

  return (
    <Section title={t('home.categoriesTitle')} subtitle={t('home.categoriesSubtitle')} viewAll="/products" className="pb-4 sm:pb-6">
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto scroll-px-4 px-4 pt-1 sm:-mx-6 sm:gap-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] lg:gap-4 lg:px-0">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square w-24 shrink-0 rounded-full sm:w-28 lg:w-auto" />)
          : [
              ...(data ?? []).map((c) => (
                <Link key={c._id} to={`/products?category=${c.slug}`} className="group flex w-24 shrink-0 snap-start flex-col items-center gap-2.5 text-center sm:w-28 lg:w-auto">
                  <span className="relative aspect-square w-full overflow-hidden rounded-full border-2 border-transparent bg-muted ring-1 ring-border transition-all group-hover:border-primary group-hover:shadow-md">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="grid size-full place-items-center bg-primary/8 text-primary">
                        <DynamicIcon name={c.icon} className="size-9" stroke={1.5} />
                      </span>
                    )}
                  </span>
                  <span className="text-xs leading-tight font-medium sm:text-sm">{l(c.name)}</span>
                </Link>
              )),
              <Link key="all" to="/products" className="group flex w-24 shrink-0 snap-start flex-col items-center gap-2.5 text-center sm:w-28 lg:w-auto">
                <span className="grid aspect-square w-full place-items-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                  <IconLayoutGrid className="size-8" stroke={1.5} />
                </span>
                <span className="text-xs leading-tight font-medium sm:text-sm">{t('home.allProducts')}</span>
              </Link>,
            ]}
      </div>
    </Section>
  );
}

const RAIL_ITEM = 'w-[72%] min-[480px]:w-[46%] md:w-[31%] lg:w-[calc(25%-9px)]';

function ProductRail({ title, subtitle, viewAll, products }: { title: string; subtitle?: string; viewAll: string; products: Product[] }) {
  return (
    <Section title={title} subtitle={subtitle} viewAll={viewAll}>
      <Rail label={title} itemClassName={RAIL_ITEM}>
        {products.map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </Rail>
    </Section>
  );
}

function RailSkeleton() {
  return (
    <div className="container-page py-8">
      <Skeleton className="mb-5 h-7 w-56" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className={`h-80 shrink-0 rounded-xl ${RAIL_ITEM}`} />
        ))}
      </div>
    </div>
  );
}

/** Bestseller grid, the new-feature banner, then one rail per category. */
function CatalogueRails({ feature }: { feature?: Banner }) {
  const l = useLocalized();
  const { data: categories } = useCategories();
  const { data: products, isLoading } = useProducts();

  if (isLoading) return <RailSkeleton />;
  const all = products ?? [];
  const highlights = all.filter((p) => p.isFeatured || p.tags?.includes('highlight'));
  const byCategory = (categories ?? [])
    .map((c) => ({ category: c, items: all.filter((p) => p.category?._id === c._id) }))
    // The wedding spotlight above already features that category.
    .filter((g) => g.items.length > 0 && g.category.slug !== WEDDING_CATEGORY);

  return (
    <>
      <Highlights products={highlights} />
      {feature && <FeatureBanner banner={feature} />}
      {byCategory.map(({ category, items }) => (
        <ProductRail
          key={category._id}
          title={l(category.name)}
          subtitle={l(category.description)}
          viewAll={`/products?category=${category.slug}`}
          products={items}
        />
      ))}
    </>
  );
}

function Testimonials() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data } = useReviewHighlights();
  if (!data?.length) return null;

  return (
    <Section title={t('home.reviewsTitle')} subtitle={t('home.reviewsSubtitle')}>
      <Rail label={t('home.reviewsTitle')} itemClassName="w-[85%] min-[480px]:w-[60%] md:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]">
        {data.map((r) => (
          <figure key={r._id} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <StarRating value={r.rating} />
              {r.verifiedPurchase && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <IconRosetteDiscountCheck className="size-4" /> {t('reviews.verified')}
                </span>
              )}
            </div>
            <blockquote className="flex-1 text-sm leading-relaxed">
              {r.title && <p className="mb-1 font-semibold">{r.title}</p>}
              <p className="line-clamp-5 text-muted-foreground">{r.comment}</p>
            </blockquote>
            <figcaption className="flex items-center gap-3 border-t pt-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {r.authorName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{r.authorName}</p>
                <Link to={`/products/${r.product.slug}`} className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline">
                  {l(r.product.name)}
                </Link>
              </div>
            </figcaption>
          </figure>
        ))}
      </Rail>
    </Section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    { icon: IconHandFinger, title: t('home.how1Title'), desc: t('home.how1Desc'), color: 'text-brand-cyan bg-brand-cyan/12' },
    { icon: IconUpload, title: t('home.how2Title'), desc: t('home.how2Desc'), color: 'text-brand-magenta bg-brand-magenta/12' },
    { icon: IconCreditCard, title: t('home.how3Title'), desc: t('home.how3Desc'), color: 'text-amber-600 bg-brand-yellow/20 dark:text-brand-yellow' },
    { icon: IconPackage, title: t('home.how4Title'), desc: t('home.how4Desc'), color: 'text-primary bg-primary/12' },
  ];
  return (
    <section className="bg-muted/40 py-16">
      <div className="container-page">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-2">{t('home.eyebrowHow')}</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('home.howTitle')}</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, desc, color }, i) => (
            <li key={title} className="relative rounded-xl border bg-card p-6">
              <span className="absolute top-5 right-5 text-4xl font-bold text-foreground/5">0{i + 1}</span>
              <span className={`mb-4 grid size-12 place-items-center rounded-xl ${color}`}>
                <Icon className="size-6" />
              </span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function InstitutionCta() {
  const { t } = useTranslation();
  return (
    <section className="container-page pt-16">
      <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-white sm:px-12">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold sm:text-3xl">{t('home.ctaTitle')}</h2>
            <p className="mt-2 text-white/85">{t('home.ctaSubtitle')}</p>
          </div>
          <Button size="lg" className="bg-white text-brand-blue hover:bg-white/90" asChild>
            <Link to="/institutions">
              {t('home.ctaButton')} <IconArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  useDocumentTitle();
  const { banners, isLoading } = useBanners();

  return (
    <>
      {isLoading ? (
        <div className="container-page pt-4 sm:pt-6">
          <Skeleton className="h-[260px] rounded-2xl sm:h-[340px] lg:h-[400px]" />
        </div>
      ) : banners.hero.length > 0 ? (
        <HeroCarousel slides={banners.hero} />
      ) : (
        <Hero />
      )}
      <CategoryCircles />
      {banners.promo.length > 0 && <PromoTiles banners={banners.promo} />}
      <TrustStrip />
      <WeddingSpotlight />
      <CatalogueRails feature={banners.feature[0]} />
      <AudienceSplit />
      <HowItWorks />
      <Testimonials />
      <InstitutionCta />
      <ExploreEverything />
    </>
  );
}
