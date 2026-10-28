import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconClockHour4,
  IconDiscount2,
  IconFileInvoice,
  IconPackage,
  IconPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useProducts } from '@/features/catalog/api';
import { useRoster } from '@/features/roster/api';
import { Progress } from '@/components/ui/progress';
import { useMyOrders } from '@/features/orders/api';
import { OrderList } from '@/features/orders/components/order-list';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';

/** Five products plus a sixth tile that opens the full list. */
const QUICK_PICKS = 5;

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InstitutionDashboardPage() {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const principal = useAuthStore((s) => s.principal);
  const setPrincipal = useAuthStore((s) => s.setPrincipal);
  const { data: orders } = useMyOrders();
  const { data: settings } = usePublicSettings();
  const { data: products } = useProducts({ section: 'institution' });
  const { data: students } = useRoster('student');
  const { data: staff } = useRoster('staff');

  // Refresh the account so a fresh approval shows without signing in again.
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, staleTime: 0 });
  useEffect(() => {
    if (me.data) setPrincipal(me.data);
  }, [me.data, setPrincipal]);

  const institution = principal?.kind === 'institution' ? principal.institution : null;
  useDocumentTitle(t('nav.dashboard'));
  if (!institution) return null;

  const open = orders?.items.filter((o) => !['delivered', 'picked_up', 'cancelled'].includes(o.status)).length ?? 0;
  const status = institution.status;
  const quotes = orders?.items.filter((o) => o.status === 'quote_sent') ?? [];
  const inReview = orders?.items.filter((o) => o.status === 'quote_pending').length ?? 0;
  // Featured products first; the full list lives in the order builder.
  const sorted = [...(products ?? [])].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  const quickPicks = sorted.slice(0, QUICK_PICKS);
  const hidden = sorted.length - QUICK_PICKS;

  return (
    <div className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">{t(`auth.types.${institution.type}`)}</p>
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{t('institutionDashboard.welcome', { name: institution.name })}</h1>
      </div>

      {status !== 'approved' && (
        <Alert variant={status === 'pending' ? 'warning' : 'destructive'} className="mb-8">
          {status === 'pending' ? <IconClockHour4 /> : <IconAlertTriangle />}
          <AlertTitle>{t(`status.institution.${status}`)}</AlertTitle>
          {(institution.statusReason || settings?.shop.phone) && (
            <AlertDescription>
              {institution.statusReason && <p>{t('institutionDashboard.reason', { reason: institution.statusReason })}</p>}
              {settings?.shop.phone && (
                <p>
                  {t('institutionDashboard.contactShop')} +91 {settings.shop.phone}
                </p>
              )}
            </AlertDescription>
          )}
        </Alert>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={status === 'approved' ? <IconCircleCheck /> : <IconClockHour4 />}
          label={t('institutionDashboard.pricingActive')}
          value={t(`status.institutionShort.${status}`)}
        />
        <StatCard icon={<IconPackage />} label={t('institutionDashboard.orders')} value={orders?.total ?? 0} />
        <StatCard icon={<IconClockHour4 />} label={t('institutionDashboard.openOrders')} value={open} />
        <StatCard icon={<IconDiscount2 />} label={t('institutionDashboard.discount')} value={`${institution.extraDiscountPercent}%`} />
      </div>

      {quotes.length > 0 && (
        <Card className="mb-8 border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-brand-navy">
              <IconFileInvoice className="size-5 text-primary" /> {t('institutionDashboard.quotesTitle', { count: quotes.length })}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t('institutionDashboard.quotesDesc')}</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-xl shadow-card bg-background">
              {quotes.map((o) => (
                <li key={o._id}>
                  <Link to={`/account/orders/${o._id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-accent/50">
                    <span className="font-mono font-semibold">{o.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.items.map((i) => l(i.productName)).join(', ')}</span>
                    {o.quote?.validUntil && (
                      <span className="text-xs text-muted-foreground">{t('institutionDashboard.validUntil', { date: formatDate(o.quote.validUntil, i18n.language) })}</span>
                    )}
                    <span className="font-bold text-brand-navy tabular-nums">{formatINR(o.totals.total)}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-primary">
                      {t('institutionDashboard.review')} <IconArrowRight className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Ordering starts here: a guided builder instead of a cart. */}
      <div className="mb-8 grid gap-4 *:min-w-0 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-brand-navy p-6 text-white sm:p-8">
          <div className="absolute -right-16 -bottom-20 size-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-bold">{t('institutionDashboard.startTitle')}</h2>
            <p className="mt-1.5 max-w-md text-sm text-white/75">{t('institutionDashboard.startDesc')}</p>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {[t('institutionDashboard.start1'), t('institutionDashboard.start2'), t('institutionDashboard.start3')].map((label, i) => (
                <li key={label} className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-primary">{i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="brand" size="lg" asChild>
                <Link to="/institution/orders/new">
                  <IconPlus /> {t('institutionDashboard.newOrder')}
                </Link>
              </Button>
              {inReview > 0 && <span className="text-sm text-white/75">{t('institutionDashboard.inReview', { count: inReview })}</span>}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">{t('institutionDashboard.quickTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('institutionDashboard.quickDesc')}</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {quickPicks.map((p) => (
                <Link
                  key={p._id}
                  to={`/institution/orders/new?product=${p.slug}`}
                  className="group flex items-center gap-3 rounded-xl shadow-card px-3 py-2.5 text-sm font-semibold text-brand-navy transition-colors"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <DynamicIcon name={p.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l(p.name)}</span>
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </Link>
              ))}
              {hidden > 0 && (
                <Link
                  to="/institution/orders/new"
                  className="group flex items-center gap-3 rounded-xl shadow-card border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary transition-colors"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <IconPlus className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t('institutionDashboard.quickMore', { count: hidden })}</span>
                  <IconArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* The school's own list of students and staff, kept for every ID card order. */}
      <Card className="mb-8">
        <CardContent className="flex flex-col gap-5 md:flex-row md:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <IconUsers className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-brand-navy">{t('roster.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {(students?.total ?? 0) + (staff?.total ?? 0) > 0
                ? t('institutionDashboard.rosterSummary', { students: students?.total ?? 0, staff: staff?.total ?? 0 })
                : t('institutionDashboard.rosterEmpty')}
            </p>
            {(students?.total ?? 0) + (staff?.total ?? 0) > 0 && (
              <div className="mt-2 flex max-w-md items-center gap-3">
                <Progress
                  className="flex-1"
                  value={(((students?.withPhoto ?? 0) + (staff?.withPhoto ?? 0)) / Math.max(1, (students?.total ?? 0) + (staff?.total ?? 0))) * 100}
                />
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {t('roster.photoProgress', { done: (students?.withPhoto ?? 0) + (staff?.withPhoto ?? 0), total: (students?.total ?? 0) + (staff?.total ?? 0) })}
                </span>
              </div>
            )}
          </div>
          <Button variant="navy" asChild>
            <Link to="/institution/students">
              {t('institutionDashboard.openRoster')} <IconArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('institutionDashboard.recent')}</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/account/orders">
              {t('common.viewAll')} <IconArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <OrderList limit={5} />
        </CardContent>
      </Card>
    </div>
  );
}
