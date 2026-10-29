import { IconShieldCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageBanner } from '@/components/common/page-banner';
import { PageNav } from '@/components/common/page-nav';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { LEGAL_PAGES, type LegalKind } from '@/lib/legal';
import { cn } from '@/lib/utils';

/** Last time the policy text changed. */
const UPDATED = '2026-10-27';

/** Terms, privacy, refund and shipping policies (required for Razorpay live payments). */
export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation();
  const { data: settings } = usePublicSettings();
  const shop = settings?.shop;
  const name = shop?.name || 'Printing Galaxy';
  useDocumentTitle(t(`legal.${kind}.title`), { description: t('seo.legalDesc') });
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as [string, string][];

  return (
    <div className="container-page space-y-8 py-8 sm:py-10">
      <PageNav items={[{ label: t(`legal.${kind}.title`) }]} />
      <PageBanner
        icon={<IconShieldCheck />}
        eyebrow={t('footer.legal')}
        title={t(`legal.${kind}.title`)}
        description={t('legal.updated', { date: new Date(UPDATED).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'long' }) })}
      />
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-[240px_1fr]">
        <nav aria-label={t('footer.legal')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-28 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.kind}
              to={p.path}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors lg:rounded-xl',
                p.kind === kind ? 'border-brand-navy bg-brand-navy text-white' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`legal.${p.kind}.title`)}
            </Link>
          ))}
        </nav>

        <article className="max-w-3xl space-y-5">
          <p className="text-base leading-relaxed font-medium">{t(`legal.${kind}.intro`, { name })}</p>
          <ol className="divide-y rounded-2xl border bg-card">
            {sections.map(([heading, body], i) => (
              <li key={heading} className="flex gap-4 p-5 sm:p-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white tabular-nums">{i + 1}</span>
                <section className="min-w-0 space-y-1.5 pt-0.5">
                  <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
                  <p className="text-base leading-relaxed text-foreground/80">{body}</p>
                </section>
              </li>
            ))}
          </ol>
          <p className="rounded-2xl border border-brand-amber/50 bg-brand-amber/8 p-4 text-sm sm:p-5">
            {t('legal.contactLine', {
              name,
              phone: shop?.phone ? `+91 ${shop.phone}` : t('nav.contact'),
              email: shop?.email ? ` / ${shop.email}` : '',
            })}
            {shop?.address && <span className="mt-1 block text-muted-foreground">{shop.address}</span>}
          </p>
        </article>
      </div>
    </div>
  );
}
