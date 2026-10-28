import {
  IconArrowRight,
  IconBuildingStore,
  IconFileText,
  IconId,
  IconKey,
  IconPhotoCheck,
  IconPresentation,
  IconReceipt2,
  IconSticker,
  IconTruckDelivery,
  IconClock,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { InfiniteProductGrid } from '@/features/catalog/components/infinite-product-grid';
import { BUSINESS_CATEGORIES } from '@/features/catalog/sections';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';

// Visiting cards and flyers, banners and signage, office stationery.
const CATEGORY = BUSINESS_CATEGORIES.join(',');

/** Visiting card front/back, a flyer and a round logo sticker. */
function BusinessVisual() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[520px] select-none" aria-hidden>
      {/* Flyer */}
      <div className="absolute top-[4%] left-[4%] w-[42%] rotate-[-5deg] overflow-hidden rounded-lg shadow-card bg-card shadow-xl shadow-brand-navy/10">
        <div className="bg-primary px-3 pt-4 pb-6 text-primary-foreground">
          <span className="block h-2 w-3/4 rounded bg-white/90" />
          <span className="mt-1.5 block h-2 w-1/2 rounded bg-white/90" />
          <span className="mt-3 inline-block rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-primary">NOW OPEN</span>
        </div>
        <div className="space-y-1.5 p-3">
          {[90, 80, 86, 60].map((w) => (
            <span key={w} className="block h-1.5 rounded bg-brand-navy/12" style={{ width: `${w}%` }} />
          ))}
          <div className="grid grid-cols-3 gap-1.5 pt-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="aspect-square rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>

      {/* Card back */}
      <div className="absolute top-[14%] right-[3%] flex aspect-[9/5.5] w-[54%] rotate-[6deg] flex-col justify-between rounded-lg shadow-card bg-card p-4 shadow-lg shadow-brand-navy/10">
        <div className="space-y-1.5">
          <span className="block h-2.5 w-1/2 rounded bg-brand-navy/80" />
          <span className="block h-1.5 w-1/3 rounded bg-primary/70" />
        </div>
        <div className="space-y-1.5">
          {[70, 60, 75].map((w) => (
            <span key={w} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="block h-1.5 rounded bg-brand-navy/20" style={{ width: `${w}%` }} />
            </span>
          ))}
        </div>
      </div>

      {/* Card front */}
      <div className="absolute right-[12%] bottom-[6%] flex aspect-[9/5.5] w-[56%] rotate-[-3deg] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg bg-brand-navy shadow-2xl shadow-brand-navy/35">
        <img src="/logo-mark-dark.png" alt="" className="size-10 object-contain" />
        <span className="h-2 w-24 rounded bg-white/85" />
        <span className="h-1.5 w-16 rounded bg-white/40" />
        <span className="absolute inset-x-0 bottom-0 h-1 bg-primary" />
      </div>

      {/* Round sticker */}
      <div className="absolute bottom-[10%] left-[8%] grid size-[22%] place-items-center rounded-full bg-primary shadow-lg ring-4 ring-white">
        <img src="/logo-mark-dark.png" alt="" className="size-1/2 object-contain" />
      </div>
    </div>
  );
}

type Tile = { icon: Icon; title: string; desc: string; to: string; featured?: boolean };

export default function BusinessPrintingPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.businessPrinting'));

  const tiles: Tile[] = [
    { icon: IconId, title: t('business.tileCards'), desc: t('business.tileCardsDesc'), to: '/products/visiting-card', featured: true },
    { icon: IconFileText, title: t('business.tileFlyers'), desc: t('business.tileFlyersDesc'), to: '/products/hand-bill' },
    { icon: IconSticker, title: t('business.tileStickers'), desc: t('business.tileStickersDesc'), to: '/products/logo-sticker' },
    { icon: IconKey, title: t('business.tileKeychains'), desc: t('business.tileKeychainsDesc'), to: '/products/logo-keychain' },
    { icon: IconPresentation, title: t('business.tileCustom'), desc: t('business.tileCustomDesc'), to: '/contact' },
  ];
  const audiences = t('business.audiences', { returnObjects: true }) as string[];
  const reasons = [
    { icon: IconPhotoCheck, title: t('business.why1Title'), desc: t('business.why1Desc') },
    { icon: IconReceipt2, title: t('business.why2Title'), desc: t('business.why2Desc') },
    { icon: IconClock, title: t('business.why3Title'), desc: t('business.why3Desc') },
    { icon: IconTruckDelivery, title: t('business.why4Title'), desc: t('business.why4Desc') },
  ];

  return (
    <>
      <section className="relative overflow-hidden border-b bg-muted">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="container-page relative grid items-center gap-10 py-12 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <p className="eyebrow mb-5 flex items-center gap-2">
              <IconBuildingStore className="size-4" /> {t('business.eyebrow')}
            </p>
            <h1 className="text-[2.25rem] leading-[1.08] font-extrabold text-brand-navy sm:text-5xl lg:text-[3.25rem]">
              {t('business.titleLead')} <span className="text-logo-gradient">{t('business.titleHighlight')}</span> {t('business.titleTail')}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t('business.subtitle')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="brand" asChild>
                <a href="#products">
                  {t('business.ctaBrowse')} <IconArrowRight />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/contact">{t('business.ctaQuote')}</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label={t('business.audiencesLabel')}>
              {audiences.map((a) => (
                <li key={a} className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-brand-navy">
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <BusinessVisual />
        </div>
      </section>

      {/* What we print: a bento grid with visiting cards as the lead tile. */}
      <section className="container-page section-y">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow mb-2">{t('business.printEyebrow')}</p>
          <h2 className="text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('business.printTitle')}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          {tiles.map(({ icon: Icon, title, desc, to, featured }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'group relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl shadow-card p-6 transition-[border-color,box-shadow] duration-200',
                featured ? 'bg-brand-navy text-white sm:col-span-2 lg:row-span-2' : 'bg-card hover:border-brand-navy/20',
              )}
            >
              {featured && (
                <>
                  <div className="absolute -right-16 -bottom-16 size-64 rounded-full bg-primary/30 blur-3xl" />
                  {/* A fanned stack of visiting cards, drawn in CSS. */}
                  <div className="pointer-events-none absolute top-10 right-8 hidden w-60 sm:block" aria-hidden>
                    <div className="absolute top-6 right-10 aspect-[9/5.5] w-full rotate-[-12deg] rounded-lg bg-primary shadow-xl" />
                    <div className="absolute top-3 right-5 aspect-[9/5.5] w-full rotate-[-5deg] rounded-lg bg-white/90 shadow-xl" />
                    <div className="relative flex aspect-[9/5.5] w-full rotate-[3deg] flex-col justify-between rounded-lg bg-white p-4 shadow-2xl transition-transform duration-300 group-hover:rotate-[1deg]">
                      <img src="/logo-mark.png" alt="" className="size-8 object-contain" />
                      <div className="space-y-1.5">
                        <span className="block h-2 w-1/2 rounded bg-brand-navy" />
                        <span className="block h-1.5 w-1/3 rounded bg-primary/70" />
                        <span className="block h-1.5 w-2/3 rounded bg-brand-navy/20" />
                      </div>
                    </div>
                  </div>
                </>
              )}
              <span
                className={cn(
                  'relative grid size-12 place-items-center rounded-xl',
                  featured ? 'bg-white/10 text-primary' : 'bg-primary/10 text-primary',
                )}
              >
                <Icon className="size-6" />
              </span>
              <div className="relative">
                <h3 className={cn('font-bold', featured ? 'text-2xl sm:text-3xl' : 'text-lg text-brand-navy')}>{title}</h3>
                <p className={cn('mt-1.5 text-sm', featured ? 'max-w-sm text-white/70' : 'text-muted-foreground')}>{desc}</p>
                <span
                  className={cn(
                    'mt-4 inline-flex items-center gap-1.5 text-sm font-semibold',
                    featured ? 'text-white' : 'text-primary',
                  )}
                >
                  {t('business.view')} <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="products" className="scroll-mt-24 border-t bg-muted section-y">
        <div className="container-page">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('business.productsTitle')}</h2>
              <p className="mt-1.5 text-muted-foreground">{t('business.productsSubtitle')}</p>
            </div>
          </div>
          <InfiniteProductGrid category={CATEGORY} />
        </div>
      </section>

      <section className="container-page section-y">
        <h2 className="mb-10 text-center text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('business.whyTitle')}</h2>
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="border-l-2 border-primary pl-5">
              <Icon className="mb-3 size-6 text-primary" />
              <h3 className="font-bold text-brand-navy">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page">
        <div className="relative overflow-hidden rounded-2xl bg-brand-navy px-6 py-12 text-white sm:px-12">
          <div className="absolute inset-0 bg-grid opacity-15" />
          <div className="absolute -right-16 -bottom-24 size-72 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold sm:text-3xl">{t('business.ctaTitle')}</h2>
              <p className="mt-2 text-white/75">{t('business.ctaSubtitle')}</p>
            </div>
            <Button size="lg" variant="brand" asChild>
              <Link to="/contact">
                {t('business.ctaQuote')} <IconArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
