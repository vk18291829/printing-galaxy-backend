import { IconChevronRight, IconPackage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { formatDate, formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { useMyOrders } from '../api';

export function OrderList({ limit }: { limit?: number }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const { data, isLoading, error, refetch } = useMyOrders();
  const isInstitution = useAuthStore((s) => s.principal?.kind === 'institution');

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }
  const orders = (data?.items ?? []).slice(0, limit);
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<IconPackage />}
        title={t('orders.empty')}
        description={t('orders.emptyDesc')}
        action={
          <Button asChild>
            {isInstitution ? (
              <Link to="/institution/orders/new">{t('institutionDashboard.newOrder')}</Link>
            ) : (
              <Link to="/products">{t('cart.browse')}</Link>
            )}
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order._id}>
          <Link
            to={`/account/orders/${order._id}`}
            className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{order.orderNumber}</span>
                <OrderStatusBadge status={order.status} />
                <PaymentStatusBadge status={order.payment.status} />
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {order.items.map((i) => l(i.productName)).join(', ')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('orders.placedOn', { date: formatDate(order.createdAt, i18n.language) })} ·{' '}
                {t('orders.items', { count: order.items.length })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums">{formatINR(order.totals.total)}</p>
            </div>
            <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
