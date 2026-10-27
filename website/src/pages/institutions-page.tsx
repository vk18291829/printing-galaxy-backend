import {
  IconArrowRight,
  IconAward,
  IconBook,
  IconBuildingCommunity,
  IconIdBadge2,
  IconReceipt,
  IconShirt,
  IconDiscount2,
  IconFileInvoice,
  IconLock,
  IconPhotoCheck,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Icon } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/auth-store';
import { InfiniteProductGrid } from '@/features/catalog/components/infinite-product-grid';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';

export default function InstitutionsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.institutions'));
  const isInstitution = useAuthStore((s) => s.principal?.kind === 'institution');

  const benefits = [
    { icon: IconDiscount2, title: t('institutions.benefit1Title'), desc: t('institutions.benefit1Desc') },
    { icon: IconLock, title: t('institutions.benefit2Title'), desc: t('institutions.benefit2Desc') },
    { icon: IconPhotoCheck, title: t('institutions.benefit3Title'), desc: t('institutions.benefit3Desc') },
    { icon: IconFileInvoice, title: t('institutions.benefit4Title'), desc: t('institutions.benefit4Desc') },
  ];
  const steps = [t('institutions.step1'), t('institutions.step2'), t('institutions.step3')];
  const showcase: { icon: Icon; title: string; desc: string; to: string; featured?: boolean }[] = [
    { icon: IconIdBadge2, title: t('institutions.showIdTitle'), desc: t('institutions.showIdDesc'), to: '/products/student-id-card', featured: true },
    { icon: IconBook, title: t('institutions.showDiaryTitle'), desc: t('institutions.showDiaryDesc'), to: '/products/school-diary' },
    { icon: IconAward, title: t('institutions.showMedalTitle'), desc: t('institutions.showMedalDesc'), to: '/products/school-medal' },
    { icon: IconShirt, title: t('institutions.showUniformTitle'), desc: t('institutions.showUniformDesc'), to: '/products/school-tie' },
    { icon: IconReceipt, title: t('institutions.showOfficeTitle'), desc: t('institutions.showOfficeDesc'), to: '/products/fee-receipt-book' },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div className="absolute inset-0 bg-grid opacity-15" />
        <div className="absolute -top-24 right-0 size-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="container-page relative py-16 lg:py-20">
          <div className="max-w-3xl space-y-6">
            <Badge className="border-white/15 bg-white/10 px-3 py-1 text-white">
              <IconBuildingCommunity /> {t('institutions.badge')}
            </Badge>
            <h1 className="text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl">{t('institutions.title')}</h1>
            <p className="text-lg text-white/75">{t('institutions.subtitle')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {isInstitution ? (
                <Button size="lg" variant="brand" asChild>
                  <Link to="/institution">
                    {t('nav.dashboard')} <IconArrowRight />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" variant="brand" asChild>
                    <Link to="/institutions/register">
                      {t('institutions.register')} <IconArrowRight />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
                    <Link to="/login?tab=institution">{t('institutions.login')}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="h-1 cmyk-strip" />
      </section>

      {/* Showcase: one lead tile for ID cards, then the other things a campus orders every year. */}
      <section className="container-page section-y">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow mb-2">{t('institutions.showEyebrow')}</p>
          <h2 className="text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('institutions.showTitle')}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          {showcase.map(({ icon: TileIcon, title, desc, to, featured }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'group relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl shadow-card p-6 transition-[border-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-brand-navy/8',
                featured ? 'bg-primary text-white sm:col-span-2 lg:row-span-2' : 'bg-card hover:border-brand-navy/20',
              )}
            >
              {featured && (
                // A stack of ID cards, drawn in CSS.
                <div className="pointer-events-none absolute -right-6 -bottom-6 hidden w-56 sm:block" aria-hidden>
                  <div className="absolute right-10 bottom-14 h-36 w-24 rotate-[-10deg] rounded-xl bg-white/25" />
                  <div className="relative ml-auto h-40 w-28 rotate-[6deg] overflow-hidden rounded-xl bg-white shadow-2xl">
                    <div className="h-8 bg-brand-navy" />
                    <div className="mx-auto -mt-4 size-12 rounded-full border-4 border-white bg-muted" />
                    <div className="mt-3 space-y-1.5 px-4">
                      <span className="block h-1.5 rounded bg-brand-navy/70" />
                      <span className="block h-1.5 w-2/3 rounded bg-brand-navy/25" />
                      <span className="block h-1.5 w-1/2 rounded bg-brand-navy/25" />
                    </div>
                  </div>
                </div>
              )}
              <span className={cn('relative grid size-12 place-items-center rounded-xl', featured ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary')}>
                <TileIcon className="size-6" />
              </span>
              <div className="relative">
                <h3 className={cn('font-bold', featured ? 'max-w-xs text-2xl sm:text-3xl' : 'text-lg text-brand-navy')}>{title}</h3>
                <p className={cn('mt-1.5 text-sm', featured ? 'max-w-xs text-white/85' : 'text-muted-foreground')}>{desc}</p>
                <span className={cn('mt-4 inline-flex items-center gap-1.5 text-sm font-semibold', featured ? 'text-white' : 'text-primary')}>
                  {t('business.view')} <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="products" className="scroll-mt-24 border-y bg-muted section-y">
        <div className="container-page">
          <div className="mb-8">
            <h2 className="text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('institutions.productsTitle')}</h2>
            <p className="mt-1.5 text-muted-foreground">{t('institutions.productsSubtitle')}</p>
          </div>
          <InfiniteProductGrid section="institution" />
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="mb-10 text-center text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('institutions.benefitsTitle')}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl shadow-card bg-card p-6">
              <span className="mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-6" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted section-y">
        <div className="container-page">
          <h2 className="mb-10 text-center text-[1.75rem] font-bold tracking-tight text-brand-navy sm:text-[2rem]">{t('institutions.stepsTitle')}</h2>
          <ol className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-xl shadow-card bg-card p-6 md:flex-col">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-white">
                  {i + 1}
                </span>
                <p className="font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

    </>
  );
}
