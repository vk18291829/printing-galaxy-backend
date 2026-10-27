import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
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
  useDocumentTitle(t(`legal.${kind}.title`));
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as [string, string][];

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t(`legal.${kind}.title`) }]} />
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label={t('footer.legal')} className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.kind}
              to={p.path}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                p.kind === kind ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {t(`legal.${p.kind}.title`)}
            </Link>
          ))}
        </nav>

        <article className="max-w-3xl space-y-8">
          <header className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{t(`legal.${kind}.title`)}</h1>
            <p className="text-sm text-muted-foreground">
              {t('legal.updated', { date: new Date(UPDATED).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'long' }) })}
            </p>
            <p className="text-base leading-relaxed">{t(`legal.${kind}.intro`, { name })}</p>
          </header>
          {sections.map(([heading, body]) => (
            <section key={heading} className="space-y-2">
              <h2 className="text-lg font-semibold">{heading}</h2>
              <p className="text-base leading-relaxed text-foreground/85">{body}</p>
            </section>
          ))}
          <p className="rounded-xl shadow-card bg-muted/40 p-4 text-sm">
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
