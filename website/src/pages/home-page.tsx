import {
  IconArrowRight,
  IconBuildingCommunity,
  IconCheck,
  IconCreditCard,
  IconHandFinger,
  IconPackage,
  IconReceipt2,
  IconShieldLock,
  IconUpload,
  IconUser,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories, useProducts } from '@/features/catalog/api';
import { ProductCard } from '@/features/catalog/components/product-card';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';

function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md select-none" aria-hidden>
      <div className="absolute inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-blue/20 via-brand-cyan/10 to-brand-magenta/15 blur-2xl" />
      <div className="absolute inset-0 rounded-[2.5rem] bg-grid opacity-60" />

      {/* Notes document */}
      <div className="absolute top-[8%] left-[6%] w-[52%] rotate-[-7deg] rounded-2xl border bg-card p-4 shadow-xl">
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
      <div className="absolute top-[38%] right-[4%] w-[58%] rotate-[5deg] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy to-[#1f2a46] p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-widest uppercase opacity-70">Student ID</span>
          <img src="/logo.png" alt="" className="size-6 rounded bg-white p-0.5" />
        </div>
        <div className="flex gap-3">
          <div className="size-14 shrink-0 rounded-lg bg-gradient-to-br from-brand-sky to-brand-blue" />
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
      <div className="absolute bottom-[7%] left-[14%] flex rotate-[-4deg] items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xl">
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-primary/6 to-transparent" />
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
    <section className="container-page py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="eyebrow mb-2">{t('home.eyebrowAudience')}</p>
        <h2 className="text-3xl font-bold sm:text-4xl">{t('home.audienceTitle')}</h2>
        <p className="mt-3 text-muted-foreground">{t('home.audienceSubtitle')}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative flex flex-col overflow-hidden rounded-3xl border bg-card p-7 sm:p-9">
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

        <div className="relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy via-[#18233d] to-[#1b2f5e] p-7 text-white sm:p-9">
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
          <Button className="relative mt-auto w-fit bg-white text-brand-navy hover:bg-white/90" asChild>
            <Link to="/institutions">
              {t('home.institutionCta')} <IconArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data, isLoading } = useCategories();

  return (
    <section className="container-page">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t('home.eyebrowCategories')}</p>
          <h2 className="text-3xl font-bold sm:text-4xl">{t('home.categoriesTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('home.categoriesSubtitle')}</p>
        </div>
        <Button variant="ghost" className="hidden sm:inline-flex" asChild>
          <Link to="/products">
            {t('common.viewAll')} <IconArrowRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)
          : data?.map((c) => (
              <Link
                key={c._id}
                to={`/products?category=${c.slug}`}
                className="group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-all hover:border-primary/40"
              >
                <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <DynamicIcon name={c.icon} className="size-6" />
                </span>
                <div>
                  <p className="leading-snug font-semibold">{l(c.name)}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l(c.description)}</p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}

function Featured() {
  const { t } = useTranslation();
  const { data, isLoading } = useProducts({ featured: true });
  return (
    <section className="container-page py-20">
      <div className="mb-8">
        <p className="eyebrow mb-2">{t('home.eyebrowFeatured')}</p>
        <h2 className="text-3xl font-bold sm:text-4xl">{t('home.featuredTitle')}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
          : data?.slice(0, 8).map((p, i) => <ProductCard key={p._id} product={p} index={i} />)}
      </div>
    </section>
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
    <section className="bg-muted/40 py-20">
      <div className="container-page">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-2">{t('home.eyebrowHow')}</p>
          <h2 className="text-3xl font-bold sm:text-4xl">{t('home.howTitle')}</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, desc, color }, i) => (
            <li key={title} className="relative rounded-2xl border bg-card p-6">
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
    <section className="container-page pt-20">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-white sm:px-12">
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
  return (
    <>
      <Hero />
      <TrustStrip />
      <AudienceSplit />
      <Categories />
      <Featured />
      <HowItWorks />
      <InstitutionCta />
    </>
  );
}
