import {
  IconArrowRight,
  IconBriefcase,
  IconFileText,
  IconHeart,
  IconSchool,
  IconCheck,
  IconCreditCard,
  IconHandFinger,
  IconHeadset,
  IconPackage,
  IconPalette,
  IconReceipt2,
  IconRosetteDiscountCheck,
  IconShieldLock,
  IconUpload,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SafeImage } from '@/components/common/safe-image';
import { Link } from 'react-router';
import { Rail, Section } from '@/components/common/section';
import { StarRating } from '@/components/common/star-rating';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/features/catalog/api';
import { Highlights, HOME_HIDDEN_CATEGORY } from '@/features/catalog/components/home-showcase';
import { BUSINESS_CATEGORIES, NOT_INDIVIDUAL, WEDDING_CATEGORIES } from '@/features/catalog/sections';
import { useBanners } from '@/features/marketing/api';
import { HeroCarousel } from '@/features/marketing/hero-carousel';
import { FeatureBanner, PromoTiles } from '@/features/marketing/promo-banners';
import { useReviewHighlights } from '@/features/reviews/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Banner, Product } from '@/types/api';

/** Print mockups: a bound document, a visiting card and a student ID, in brand colours. */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[500px] select-none" aria-hidden>
      <div className="absolute inset-4 rounded-[2rem] shadow-card bg-muted" />
      <div className="absolute inset-4 rounded-[2rem] bg-grid opacity-70" />
      <div className="absolute top-[12%] right-[10%] size-40 rounded-full bg-primary/15 blur-3xl" />

      {/* Bound document */}
      <div className="absolute top-[9%] left-[9%] w-[46%] rotate-[-6deg] rounded-xl shadow-card bg-card p-4 shadow-lg shadow-brand-navy/10">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">PDF</span>
          <span className="h-2 w-20 rounded bg-brand-navy/15" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="mb-2 block h-1.5 rounded bg-brand-navy/10" style={{ width: `${92 - i * 9}%` }} />
        ))}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-2 py-1.5 text-[11px] font-semibold text-brand-navy">
          120 pages <span className="text-muted-foreground">A4 · B/W</span>
        </div>
      </div>

      {/* Visiting card */}
      <div className="absolute top-[34%] right-[7%] w-[60%] rotate-[4deg] overflow-hidden rounded-xl bg-brand-navy p-4 text-white shadow-2xl shadow-brand-navy/30">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="block h-2.5 w-24 rounded bg-white/90" />
            <span className="block h-1.5 w-16 rounded bg-white/45" />
          </div>
          <img src="/logo-mark-dark.png" alt="" className="size-8 object-contain" />
        </div>
        <div className="mt-6 space-y-1.5">
          <span className="block h-1.5 w-3/5 rounded bg-white/40" />
          <span className="block h-1.5 w-2/5 rounded bg-white/40" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-primary" />
        <p className="mt-3 text-right text-[9px] font-medium text-white/55">9 × 5.5 cm · Matt</p>
      </div>

      {/* Student ID */}
      <div className="absolute bottom-[8%] left-[12%] w-[38%] rotate-[-3deg] overflow-hidden rounded-xl shadow-card bg-card shadow-xl shadow-brand-navy/15">
        <div className="flex items-center justify-between bg-primary px-3 py-2 text-primary-foreground">
          <span className="text-[9px] font-bold tracking-widest uppercase">Student ID</span>
          <span className="size-2 rounded-full bg-white/70" />
        </div>
        <div className="flex gap-2.5 p-3">
          <div className="size-11 shrink-0 rounded-md bg-linear-to-br from-brand-navy/80 to-brand-navy" />
          <div className="flex-1 space-y-1.5 pt-1">
            <span className="block h-1.5 w-4/5 rounded bg-brand-navy/70" />
            <span className="block h-1.5 w-3/5 rounded bg-brand-navy/25" />
            <span className="block h-1.5 w-2/5 rounded bg-brand-navy/25" />
          </div>
        </div>
      </div>

      {/* Proof chip */}
      <div className="absolute right-[12%] bottom-[14%] flex items-center gap-2 rounded-full bg-card py-1.5 pr-3.5 pl-1.5 shadow-lg shadow-brand-navy/10">
        <span className="grid size-6 place-items-center rounded-full bg-success text-white">
          <IconCheck className="size-3.5" stroke={3} />
        </span>
        <span className="text-xs font-semibold text-brand-navy">Proof approved</span>
      </div>

      <span className="absolute top-[6%] right-[22%] size-3 rounded-full bg-brand-cyan" />
      <span className="absolute top-[30%] left-[4%] size-2.5 rounded-full bg-brand-magenta" />
      <span className="absolute right-[4%] bottom-[34%] size-2.5 rounded-full bg-brand-yellow" />
    </div>
  );
}

function Hero() {
  const { t } = useTranslation();
  const trust = [
    { icon: IconRosetteDiscountCheck, text: t('home.trustQuality') },
    { icon: IconPalette, text: t('home.trustCustom') },
    { icon: IconHeadset, text: t('home.trustSupport') },
  ];

  return (
    <section className="relative overflow-hidden border-b">
      <div className="container-page relative grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20">
        <div>
          <p className="eyebrow mb-5">{t('home.heroEyebrow')}</p>
          <h1 className="text-[2.25rem] leading-[1.08] font-extrabold text-brand-navy sm:text-5xl lg:text-[3.5rem]">
            {t('home.heroTitleLead')} <span className="text-logo-gradient">{t('home.heroTitleHighlight')}</span>
            <br />
            {t('home.heroTitleTail')}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t('home.heroSubtitle')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="brand" asChild>
              <Link to="/products">
                {t('home.ctaExplore')} <IconArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/contact">{t('home.ctaQuote')}</Link>
            </Button>
          </div>
          <ul className="mt-9 grid gap-3 border-t pt-6 sm:grid-cols-3">
            {trust.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm font-semibold text-brand-navy">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
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
    <section className="border-y bg-muted">
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

/** The four lines of business, each on its own pastel tile with a real product photo. */
function ExploreServices() {
  const { t } = useTranslation();
  const { data: retail } = useProducts({ excludeCategory: HOME_HIDDEN_CATEGORY });
  const { data: wedding } = useProducts({ category: WEDDING_CATEGORIES.join(',') });
  const { data: school } = useProducts({ section: 'institution' });
  const photo = (list: Product[] | undefined, pick: (p: Product) => boolean = () => true) =>
    list?.find((p) => pick(p) && p.images.length > 0)?.images[0];
  const tiles = [
    { to: '/products', title: t('home.exploreIndividual'), desc: t('home.exploreIndividualDesc'), icon: IconFileText, tint: 'bg-[#e6f6fe]', img: photo(retail, (p) => !NOT_INDIVIDUAL.includes(p.category.slug)) },
    { to: '/institutions', title: t('home.exploreSchool'), desc: t('home.exploreSchoolDesc'), icon: IconSchool, tint: 'bg-[#eaf0f9]', img: photo(school) },
    { to: '/business-printing', title: t('home.exploreBusiness'), desc: t('home.exploreBusinessDesc'), icon: IconBriefcase, tint: 'bg-[#fff4e0]', img: photo(retail, (p) => BUSINESS_CATEGORIES.includes(p.category.slug)) },
    { to: '/wedding-cards', title: t('home.exploreWedding'), desc: t('home.exploreWeddingDesc'), icon: IconHeart, tint: 'bg-[#fee7f1]', img: photo(wedding) },
  ];

  return (
    <section className="container-page section-y">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        <p className="eyebrow mx-auto mb-3">{t('home.exploreEyebrow')}</p>
        <h2 className="text-[1.75rem] font-bold text-foreground sm:text-[2.1rem]">{t('home.exploreTitle')}</h2>
        <p className="mt-2 text-muted-foreground">{t('home.exploreSubtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map(({ to, title, desc, icon: Icon, tint, img }) => (
          <Link key={to} to={to} className={cn('group flex flex-col overflow-hidden rounded-2xl transition-transform duration-200 hover:-translate-y-1', tint)}>
            <div className="aspect-[4/3] overflow-hidden p-3 sm:p-4">
              <SafeImage
                src={img}
                alt=""
                loading="lazy"
                className="size-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                fallback={
                  <span className="grid size-full place-items-center rounded-xl bg-white/60 text-primary">
                    <Icon className="size-10" stroke={1.5} />
                  </span>
                }
              />
            </div>
            <div className="flex flex-1 flex-col px-3 pb-4 sm:px-5 sm:pb-5">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground sm:text-lg">
                {title} <IconArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const RAIL_ITEM = 'w-[72%] min-[480px]:w-[46%] md:w-[31%] lg:w-[calc(25%-9px)]';


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
/**
 * The home page shows a short, hand-picked selection; full ranges live on Products, School &
 * College, Business Works and Wedding & Invitations, so they are not repeated here.
 */
function CatalogueRails({ feature }: { feature?: Banner }) {
  const { data: products, isLoading } = useProducts({ excludeCategory: HOME_HIDDEN_CATEGORY });
  if (isLoading) return <RailSkeleton />;
  const highlights = (products ?? []).filter((p) => p.isFeatured || p.tags?.includes('highlight'));
  return (
    <>
      <Highlights products={highlights} />
      {feature && <FeatureBanner banner={feature} />}
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
          <figure key={r._id} className="flex h-full flex-col gap-3 rounded-xl shadow-card bg-card p-5">
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
    { icon: IconPackage, title: t('home.how4Title'), desc: t('home.how4Desc'), color: 'text-brand-navy bg-brand-navy/10' },
  ];
  return (
    <section className="bg-muted section-y">
      <div className="container-page">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-2">{t('home.eyebrowHow')}</p>
          <h2 className="text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('home.howTitle')}</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, desc, color }, i) => (
            <li key={title} className="relative rounded-xl shadow-card bg-card p-6">
              <span className="absolute top-5 right-5 text-4xl font-extrabold text-brand-navy/8">0{i + 1}</span>
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
      <div className="relative overflow-hidden rounded-2xl bg-brand-navy px-6 py-12 text-white sm:px-12">
        <div className="absolute inset-0 bg-grid opacity-15" />
        <div className="absolute -right-16 -bottom-24 size-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold sm:text-3xl">{t('home.ctaTitle')}</h2>
            <p className="mt-2 text-white/75">{t('home.ctaSubtitle')}</p>
          </div>
          <Button size="lg" variant="brand" asChild>
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
      <Hero />
      <ExploreServices />
      {/* Offer slides from the admin panel sit under the brand hero. */}
      {isLoading ? (
        <div className="container-page pt-2">
          <Skeleton className="h-[240px] rounded-2xl sm:h-[300px] lg:h-[340px]" />
        </div>
      ) : (
        banners.hero.length > 0 && <HeroCarousel slides={banners.hero} />
      )}
      {banners.promo.length > 0 && <PromoTiles banners={banners.promo} />}
      <TrustStrip />
      <CatalogueRails feature={banners.feature[0]} />
      <HowItWorks />
      <Testimonials />
      <InstitutionCta />
    </>
  );
}
