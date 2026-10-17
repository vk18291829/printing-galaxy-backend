import {
  IconArrowRight,
  IconBuildingCommunity,
  IconDiscount2,
  IconFileInvoice,
  IconLock,
  IconPhotoCheck,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { useProducts } from '@/features/catalog/api';
import { ProductCard } from '@/features/catalog/components/product-card';
import { useDocumentTitle } from '@/hooks/use-document-title';

export default function InstitutionsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.institutions'));
  const isInstitution = useAuthStore((s) => s.principal?.kind === 'institution');
  const { data: products, isLoading } = useProducts({ category: 'school-works' });

  const benefits = [
    { icon: IconDiscount2, title: t('institutions.benefit1Title'), desc: t('institutions.benefit1Desc') },
    { icon: IconLock, title: t('institutions.benefit2Title'), desc: t('institutions.benefit2Desc') },
    { icon: IconPhotoCheck, title: t('institutions.benefit3Title'), desc: t('institutions.benefit3Desc') },
    { icon: IconFileInvoice, title: t('institutions.benefit4Title'), desc: t('institutions.benefit4Desc') },
  ];
  const steps = [t('institutions.step1'), t('institutions.step2'), t('institutions.step3')];

  return (
    <>
      <section className="relative overflow-hidden bg-zinc-950 text-white">
        <div className="absolute inset-0 bg-grid opacity-15" />
        <div className="absolute -top-24 right-0 size-96 rounded-full bg-brand-blue/30 blur-3xl" />
        <div className="container-page relative py-16 lg:py-20">
          <div className="max-w-3xl space-y-6">
            <Badge className="border-white/15 bg-white/10 px-3 py-1 text-white">
              <IconBuildingCommunity /> {t('institutions.badge')}
            </Badge>
            <h1 className="text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl">{t('institutions.title')}</h1>
            <p className="text-lg text-white/75">{t('institutions.subtitle')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {isInstitution ? (
                <Button size="lg" className="bg-white text-zinc-950 hover:bg-white/90" asChild>
                  <Link to="/institution">
                    {t('nav.dashboard')} <IconArrowRight />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" className="bg-white text-zinc-950 hover:bg-white/90" asChild>
                    <Link to="/institutions/register">
                      {t('institutions.register')} <IconArrowRight />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
                    <Link to="/institutions/login">{t('institutions.login')}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="h-1 cmyk-strip" />
      </section>

      <section className="container-page py-16">
        <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight sm:text-3xl">{t('institutions.benefitsTitle')}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border bg-card p-6">
              <span className="mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-6" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 py-16">
        <div className="container-page">
          <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight sm:text-3xl">{t('institutions.stepsTitle')}</h2>
          <ol className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-xl border bg-card p-6 md:flex-col">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-white">
                  {i + 1}
                </span>
                <p className="font-medium">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('institutions.productsTitle')}</h2>
          <Button variant="outline" asChild>
            <Link to="/pricing">
              {t('nav.pricing')} <IconArrowRight />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
            : products?.slice(0, 8).map((p, i) => <ProductCard key={p._id} product={p} index={i} />)}
        </div>
      </section>
    </>
  );
}
