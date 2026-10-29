import {
  IconArrowRight,
  IconBriefcase,
  IconCheck,
  IconChevronDown,
  IconCreditCard,
  IconEyeCheck,
  IconFileText,
  IconHandFinger,
  IconHeart,
  IconPackage,
  IconRosetteDiscountCheck,
  IconSchool,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SafeImage } from '@/components/common/safe-image';
import { Rail, Section } from '@/components/common/section';
import { StarRating } from '@/components/common/star-rating';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/features/catalog/api';
import { Highlights, HOME_HIDDEN_CATEGORY } from '@/features/catalog/components/home-showcase';
import { BUSINESS_CATEGORIES, NOT_INDIVIDUAL, WEDDING_CATEGORIES } from '@/features/catalog/sections';
import { useBanners } from '@/features/marketing/api';
import { HeroCarousel } from '@/features/marketing/hero-carousel';
import { useReviewHighlights } from '@/features/reviews/api';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { businessLd } from '@/lib/seo';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';

/**
 * Real products in a 2×2 mosaic (their own photos or samples), so the first screen shows what the
 * shop makes. Tablets and up; on phones the same products follow a little further down.
 */
function ProductMosaic() {
  const l = useLocalized();
  const { data } = useProducts({ excludeCategory: HOME_HIDDEN_CATEGORY });
  const picks = (data ?? []).filter((p) => p.isFeatured && p.images.length > 0).slice(0, 4);
  if (picks.length < 4) return null;
  return (
    <div className="hidden grid-cols-2 gap-3 md:grid lg:gap-4" aria-hidden>
      {picks.map((p, i) => (
        <Link
          key={p._id}
          to={`/products/${p.slug}`}
          tabIndex={-1}
          className={cn('group relative overflow-hidden rounded-2xl border bg-card', i % 2 === 1 && 'translate-y-6')}
        >
          <SafeImage src={p.images[0]} alt="" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" fallback={<span className="block aspect-[4/3] w-full bg-secondary" />} />
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-foreground">{l(p.name)}</span>
        </Link>
      ))}
    </div>
  );
}

function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  return (
    <section className="border-b">
      <div className="container-page grid items-center gap-10 py-10 sm:py-14 md:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
        <div>
          <p className="eyebrow mb-4">{t('home.heroEyebrow')}</p>
          <h1 className="text-[2.1rem] leading-[1.08] font-extrabold text-brand-navy sm:text-5xl lg:text-[3.25rem]">
            {t('home.heroTitleLead')} <span className="text-logo-gradient">{t('home.heroTitleHighlight')}</span>
            <br />
            {t('home.heroTitleTail')}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t('home.heroSubtitle')}</p>

          {/* Straight to a product: the search opens the full catalogue filtered by what was typed. */}
          <form
            role="search"
            className="mt-7 flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : '/products');
            }}
          >
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchPlaceholder')}
                className="h-12 rounded-xl bg-card pl-11 text-base"
              />
            </div>
            <Button type="submit" size="lg" variant="brand" className="h-12 px-5">
              <span className="max-sm:sr-only">{t('home.searchButton')}</span>
              <IconArrowRight className="sm:hidden" />
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link to="/products" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
              {t('home.ctaExplore')} <IconArrowRight className="size-4" />
            </Link>
            <Link to="/contact" className="font-medium text-muted-foreground hover:text-foreground">
              {t('home.ctaQuote')}
            </Link>
          </div>
        </div>
        <ProductMosaic />
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
    { to: '/products', title: t('home.exploreIndividual'), desc: t('home.exploreIndividualDesc'), icon: IconFileText, tint: 'border-[#c4eafc] bg-[#e9f7fe]', img: photo(retail, (p) => !NOT_INDIVIDUAL.includes(p.category.slug)) },
    { to: '/institutions', title: t('home.exploreSchool'), desc: t('home.exploreSchoolDesc'), icon: IconSchool, tint: 'border-[#d2ddef] bg-[#edf2fa]', img: photo(school) },
    { to: '/business-printing', title: t('home.exploreBusiness'), desc: t('home.exploreBusinessDesc'), icon: IconBriefcase, tint: 'border-[#fde0ad] bg-[#fff5e4]', img: photo(retail, (p) => BUSINESS_CATEGORIES.includes(p.category.slug)) },
    { to: '/wedding-cards', title: t('home.exploreWedding'), desc: t('home.exploreWeddingDesc'), icon: IconHeart, tint: 'border-[#fcd0e2] bg-[#feedf4]', img: photo(wedding) },
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
          <Link key={to} to={to} className={cn('group flex flex-col overflow-hidden rounded-2xl border transition-[border-color] duration-200 hover:border-primary/30', tint)}>
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
function CatalogueRails() {
  const { data: products, isLoading } = useProducts({ excludeCategory: HOME_HIDDEN_CATEGORY });
  if (isLoading) return <RailSkeleton />;
  const highlights = (products ?? []).filter((p) => p.isFeatured || p.tags?.includes('highlight'));
  return <Highlights products={highlights} />;
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

/** Four numbered steps in one row (a compact list on phones), no cards. */
function HowItWorks() {
  const { t } = useTranslation();
  const { data: settings } = usePublicSettings();
  const counter = settings?.payments.counterEnabled;
  const steps = [
    { icon: IconHandFinger, title: t('home.how1Title'), desc: t('home.how1Desc') },
    { icon: IconUpload, title: t('home.how2Title'), desc: t('home.how2Desc') },
    { icon: IconCreditCard, title: t('home.how3Title'), desc: counter === false ? t('home.how3DescOnline') : t('home.how3Desc') },
    // The proof: personalised items are printed only after the customer approves a preview.
    { icon: IconEyeCheck, title: t('home.howProofTitle'), desc: t('home.howProofDesc'), tag: t('home.howProofTag'), proof: true },
    { icon: IconPackage, title: t('home.how4Title'), desc: t('home.how4Desc') },
  ];
  return (
    <section className="container-page section-y">
      <div className="mb-8 max-w-2xl sm:mb-12">
        <h2 className="text-[1.6rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('home.howTitle')}</h2>
        <p className="mt-2 text-muted-foreground">{t('home.howSubtitle')}</p>
      </div>
      {/* A timeline: across on wide screens, down on phones, the circles joined by a line. */}
      <ol className="relative grid gap-7 lg:grid-cols-5 lg:gap-6">
        <span aria-hidden className="absolute top-6 right-[10%] left-[10%] hidden h-0.5 bg-border lg:block" />
        <span aria-hidden className="absolute top-2 bottom-2 left-6 w-0.5 bg-border lg:hidden" />
        {steps.map(({ icon: Icon, title, desc, tag, proof }, i) => (
          <li key={title} className="relative flex gap-4 lg:flex-col lg:items-center lg:text-center">
            <span
              className={cn(
                'relative z-10 grid size-12 shrink-0 place-items-center rounded-full ring-8 ring-background',
                proof ? 'bg-brand-amber text-brand-navy' : 'bg-brand-navy text-white',
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 pt-1 lg:pt-0">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t('home.howStep', { n: i + 1 })}</p>
              <h3 className="mt-0.5 font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              {tag && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-brand-amber/40 bg-brand-amber/12 px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
                  <IconCheck className="size-3.5" /> {tag}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Short answers to what customers ask before ordering. Every answer comes from the shop's own
 * policies and settings (the delivery fee is live), and links to the full policy.
 */
function Faq() {
  const { t } = useTranslation();
  const { data: settings } = usePublicSettings();
  const delivery = settings?.delivery;
  const items: [string, string, string?][] = [
    [t('home.faqOrderQ'), settings?.payments.counterEnabled === false ? t('home.faqOrderAOnline') : t('home.faqOrderA')],
    [t('home.faqFilesQ'), t('home.faqFilesA')],
    [t('home.faqTimeQ'), t('home.faqTimeA'), '/shipping-policy'],
    [
      t('home.faqDeliveryQ'),
      delivery?.enabled
        ? t('home.faqDeliveryA', { fee: formatINR(delivery.fee), free: formatINR(delivery.freeAbove) })
        : t('home.faqDeliveryPickupOnly'),
      '/shipping-policy',
    ],
    [t('home.faqProofQ'), t('home.faqProofA')],
    [t('home.faqCancelQ'), t('home.faqCancelA'), '/refund-policy'],
    [t('home.faqIdQ'), t('home.faqIdA'), '/privacy'],
  ];
  return (
    <section className="border-t bg-muted section-y">
      <div className="container-page grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div>
          <h2 className="text-[1.6rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('home.faqTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('home.faqSubtitle')}</p>
          <Link to="/contact" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            {t('home.faqContact')} <IconArrowRight className="size-4" />
          </Link>
        </div>
        <div className="divide-y rounded-2xl border bg-card">
          {items.map(([q, a, link]) => (
            <details key={q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-foreground">
                {q}
                <IconChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="-mt-1 pb-4 text-sm leading-relaxed text-muted-foreground">
                {a}
                {link && (
                  <>
                    {' '}
                    <Link to={link} className="font-medium text-primary hover:underline">
                      {t('home.faqMore')}
                    </Link>
                  </>
                )}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** One band for bulk buyers (schools, colleges and businesses), light so it does not stack navy on the footer. */
function InstitutionCta() {
  const { t } = useTranslation();
  return (
    <section className="container-page section-y">
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border bg-secondary px-6 py-8 sm:px-10 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 className="text-xl font-bold text-brand-navy sm:text-2xl">{t('home.ctaBulkTitle')}</h2>
          <p className="mt-1.5 text-muted-foreground">{t('home.ctaBulkSubtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" asChild>
            <Link to="/institutions">
              <IconSchool /> {t('home.ctaButton')}
            </Link>
          </Button>
          <Button variant="outline" className="bg-card" asChild>
            <Link to="/business-printing">
              <IconBriefcase /> {t('home.ctaBusiness')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const { data: settings } = usePublicSettings();
  useDocumentTitle(undefined, { description: t('seo.homeDesc'), jsonLd: businessLd(settings?.shop, settings?.social as Record<string, string> | undefined) });
  const { banners, isLoading } = useBanners();

  return (
    <>
      <Hero />
      <ExploreServices />
      {/* One banner slot: the offer slides managed in the admin panel. */}
      {isLoading ? (
        <div className="container-page pt-2">
          <Skeleton className="h-[240px] rounded-2xl sm:h-[300px] lg:h-[340px]" />
        </div>
      ) : (
        banners.hero.length > 0 && <HeroCarousel slides={banners.hero} />
      )}
      <CatalogueRails />
      <HowItWorks />
      <Testimonials />
      <Faq />
      <InstitutionCta />
    </>
  );
}
