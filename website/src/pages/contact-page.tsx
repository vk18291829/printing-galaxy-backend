import {
  IconArrowRight,
  IconBrandWhatsapp,
  IconBuildingCommunity,
  IconChevronDown,
  IconClock,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPhone,
  IconShoppingBag,
  type Icon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageNav } from '@/components/common/page-nav';
import { SocialLinks, socialLinks } from '@/components/common/social-links';
import { PageLoader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';

function Channel({ icon: Icon, title, value, action }: { icon: Icon; title: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl shadow-card bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="truncate font-semibold">{value}</p>
        </div>
      </div>
      {action && <div className="mt-auto">{action}</div>}
    </div>
  );
}

export default function ContactPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('seo.contactTitle'), { description: t('seo.contactDesc') });
  const { data, isLoading } = usePublicSettings();
  if (isLoading || !data) return <PageLoader />;
  const { shop } = data;
  const faqs = t('contact.faqs', { returnObjects: true }) as { q: string; a: string }[];
  const help = [
    { icon: IconPackage, title: t('contact.helpTrack'), desc: t('contact.helpTrackDesc'), to: '/account/orders' },
    { icon: IconBuildingCommunity, title: t('contact.helpBulk'), desc: t('contact.helpBulkDesc'), to: '/institutions' },
    { icon: IconShoppingBag, title: t('contact.helpPrices'), desc: t('contact.helpPricesDesc'), to: '/products' },
  ];

  return (
    <div>
      <section className="relative overflow-hidden border-b bg-muted/30">
        <div className="pointer-events-none absolute -top-24 right-0 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="container-page relative py-8 sm:py-10">
          <PageNav className="mb-5" items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.contact') }]} />
          <p className="eyebrow mb-1.5">{t('contact.eyebrow')}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('contact.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('contact.subtitle')}</p>
        </div>
      </section>

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {shop.phone && (
              <Channel
                icon={IconPhone}
                title={t('contact.call')}
                value={`+91 ${shop.phone}`}
                action={
                  <Button variant="outline" className="w-full" asChild>
                    <a href={`tel:+91${shop.phone}`}>
                      <IconPhone /> {t('contact.callNow')}
                    </a>
                  </Button>
                }
              />
            )}
            {(shop.whatsapp || shop.phone) && (
              <Channel
                icon={IconBrandWhatsapp}
                title={t('contact.whatsapp')}
                value={`+91 ${shop.whatsapp || shop.phone}`}
                action={
                  <Button className="w-full bg-[#25D366] text-white hover:bg-[#1fb957]" asChild>
                    <a href={`https://wa.me/91${shop.whatsapp || shop.phone}`} target="_blank" rel="noreferrer">
                      <IconBrandWhatsapp /> {t('contact.chatNow')}
                    </a>
                  </Button>
                }
              />
            )}
            {shop.email && (
              <Channel
                icon={IconMail}
                title={t('contact.email')}
                value={shop.email}
                action={
                  <Button variant="outline" className="w-full" asChild>
                    <a href={`mailto:${shop.email}`}>
                      <IconMail /> {t('contact.writeEmail')}
                    </a>
                  </Button>
                }
              />
            )}
            {shop.hours && <Channel icon={IconClock} title={t('contact.hours')} value={shop.hours} action={<p className="text-sm text-muted-foreground">{t('contact.hoursNote')}</p>} />}
          </div>

          {shop.address && (
            <div className="relative isolate overflow-hidden rounded-2xl shadow-card bg-card">
              {/* Decorative map backdrop; directions open in the visitor's maps app. */}
              <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-70" aria-hidden />
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                    <IconMapPin className="size-6" />
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('contact.visit')}</p>
                    <p className="text-lg font-semibold">{shop.address}</p>
                    {shop.hours && <p className="mt-0.5 text-sm text-muted-foreground">{shop.hours}</p>}
                  </div>
                </div>
                {shop.mapUrl && (
                  <Button variant="brand" className="shrink-0" asChild>
                    <a href={shop.mapUrl} target="_blank" rel="noreferrer">
                      {t('contact.directions')} <IconArrowRight />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {socialLinks(data.social).length > 0 && (
            <div className="flex flex-col gap-4 rounded-2xl shadow-card bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t('contact.followTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('contact.followDesc')}</p>
              </div>
              <SocialLinks social={data.social} />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {help.map(({ icon: Icon, title, desc, to }) => (
              <Link key={to} to={to} className="group rounded-2xl shadow-card bg-card p-5 transition-colors">
                <Icon className="mb-3 size-5 text-primary" />
                <p className="flex items-center gap-1 font-semibold">
                  {title} <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            ))}
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t('contact.faqTitle')}</h2>
          <div className="divide-y overflow-hidden rounded-2xl shadow-card bg-card">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="rounded-2xl bg-brand-navy p-6 text-white">
            <p className="text-lg font-semibold">{t('contact.ctaTitle')}</p>
            <p className="mt-1 text-sm text-white/70">{t('contact.ctaDesc')}</p>
            <Button variant="brand" className="mt-4" asChild>
              <Link to="/products">
                {t('home.ctaPrimary')} <IconArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
