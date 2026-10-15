import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconClockHour4,
  IconDiscount2,
  IconPackage,
  IconSchool,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useMyOrders } from '@/features/orders/api';
import { OrderList } from '@/features/orders/components/order-list';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';

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
  const { t } = useTranslation();
  const principal = useAuthStore((s) => s.principal);
  const setPrincipal = useAuthStore((s) => s.setPrincipal);
  const { data: orders } = useMyOrders();
  const { data: settings } = usePublicSettings();

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

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{t(`auth.types.${institution.type}`)}</p>
          <h1 className="text-3xl font-bold">{t('institutionDashboard.welcome', { name: institution.name })}</h1>
        </div>
        <Button variant="brand" asChild>
          <Link to="/products?category=school-works">
            <IconSchool /> {t('institutionDashboard.browse')}
          </Link>
        </Button>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('institutionDashboard.recent')}</CardTitle>
          <Button variant="ghost" size="sm" asChild>
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
