import {
  IconAlertTriangle,
  IconArrowRight,
  IconBoxSeam,
  IconBuildingCommunity,
  IconCash,
  IconCalendarMonth,
  IconPackage,
  IconReceipt,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { ErrorState, PageHeader, PageLoader } from '@/components/common/states';
import { ORDER_STATUS_LABEL, OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RevenueChart } from '@/features/dashboard/revenue-chart';
import { TrafficCard } from '@/features/dashboard/traffic-card';
import { useCan } from '@/features/auth/auth-store';
import { useDashboard } from '@/features/management/api';
import { formatDate, formatINR } from '@/lib/format';
import { en } from '@/lib/l10n';
import type { OrderSegment, OrderStatus } from '@/types/api';

function StatTile({ icon, label, value, sub, to }: { icon: ReactNode; label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <Card className="h-full gap-3 py-5 transition-colors hover:border-primary/30">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const SEGMENTS: { key: OrderSegment; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'institution', label: 'School & College' },
  { key: 'business', label: 'Business' },
  { key: 'wedding', label: 'Wedding' },
];

const PIPELINE: OrderStatus[] = ['quote_pending', 'quote_sent', 'received', 'proof_sent', 'approved', 'printing', 'ready', 'out_for_delivery'];

export default function DashboardPage() {
  const canSeeReports = useCan('reports');
  const { data, isLoading, error, refetch } = useDashboard();
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const segments = SEGMENTS.map((s) => ({ ...s, ...(data.bySegment?.[s.key] ?? { revenue: 0, orders: 0 }), open: data.openBySegment?.[s.key] ?? 0 }));
  const monthTotal = segments.reduce((sum, s) => sum + s.revenue, 0) || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Today at a glance."
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <IconReceipt /> New walk-in order
            </Link>
          </Button>
        }
      />

      {data.pendingInstitutions > 0 && (
        <Link
          to="/institutions?status=pending"
          className="flex items-center gap-3 rounded-xl shadow-card border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium"
        >
          <IconAlertTriangle className="size-5 text-amber-600 dark:text-warning" />
          {data.pendingInstitutions} institution{data.pendingInstitutions > 1 ? 's are' : ' is'} waiting for approval
          <IconArrowRight className="ml-auto size-4" />
        </Link>
      )}

      {data.lowStock.length > 0 && (
        <Link
          to="/inventory"
          className="flex items-center gap-3 rounded-xl shadow-card border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium"
        >
          <IconBoxSeam className="size-5 shrink-0 text-amber-600 dark:text-warning" />
          <span className="min-w-0">
            Low stock:{' '}
            <span className="font-normal">
              {data.lowStock.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join(', ')}
            </span>
          </span>
          <IconArrowRight className="ml-auto size-4 shrink-0" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<IconCash />} label="Today's sales" value={formatINR(data.today.revenue)} sub={`${data.today.orders} orders · ${formatINR(data.today.collected)} collected`} />
        <StatTile icon={<IconCalendarMonth />} label="This month" value={formatINR(data.month.revenue)} sub={`${data.month.orders} orders`} />
        <StatTile
          icon={<IconPackage />}
          label="Open orders"
          value={String(Object.values(data.openByStatus).reduce((a, b) => a + (b ?? 0), 0))}
          sub={`${data.openByStatus.quote_pending ?? 0} need a quote`}
          to="/orders?active=true"
        />
        <StatTile
          icon={<IconBuildingCommunity />}
          label="Payments due"
          value={formatINR(data.pendingPayments.due)}
          sub={`across ${data.pendingPayments.orders} orders`}
          to="/orders?paymentStatus=pending"
        />
      </div>

      <div className="grid gap-6 *:min-w-0 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Revenue · last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={data.daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Production pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {PIPELINE.map((s) => (
              <Link
                key={s}
                to={`/orders?status=${s}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-accent"
              >
                <span>{ORDER_STATUS_LABEL[s]}</span>
                <span className="font-semibold tabular-nums">{data.openByStatus[s] ?? 0}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {canSeeReports && (
        <div className="mt-6">
          <TrafficCard />
        </div>
      )}

      <div className="grid gap-6 *:min-w-0 xl:grid-cols-[1.6fr_1fr]">
        <Card className="gap-0 pb-0">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Recent orders</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/orders">
                All orders <IconArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <MobileList className="border-t">
            {data.recentOrders.map((o) => (
              <MobileRow
                key={o._id}
                to={`/orders/${o._id}`}
                title={<span className="font-mono">{o.orderNumber}</span>}
                subtitle={`${o.contact?.name || '—'} · ${o.audience === 'institution' ? 'Institution' : o.source === 'walk_in' ? 'Walk-in' : 'Online'} · ${formatDate(o.createdAt, 'en', true)}`}
                trailing={<span className="font-semibold tabular-nums">{formatINR(o.totals.total)}</span>}
                meta={
                  <>
                    <OrderStatusBadge status={o.status} />
                    <PaymentStatusBadge status={o.payment.status} />
                  </>
                }
              />
            ))}
          </MobileList>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Order</TableHead>
                <TableHead className="hidden sm:table-cell">Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOrders.map((o) => (
                <TableRow key={o._id}>
                  <TableCell className="pl-5">
                    <Link to={`/orders/${o._id}`} className="font-mono font-semibold hover:text-primary">
                      {o.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(o.createdAt, 'en', true)}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <p className="max-w-48 truncate">{o.contact?.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{o.audience === 'institution' ? 'Institution' : o.source === 'walk_in' ? 'Walk-in' : 'Online'}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <OrderStatusBadge status={o.status} />
                      <PaymentStatusBadge status={o.payment.status} />
                    </div>
                  </TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular-nums">{formatINR(o.totals.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>This month by line of business</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {segments.map((row) => (
                <Link key={row.key} to={`/orders?segment=${row.key}`} className="block space-y-1.5 rounded-lg hover:bg-accent/40">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {row.label}
                      {row.open > 0 && <span className="rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">{row.open} open</span>}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(row.revenue)} <span className="font-normal text-muted-foreground">· {row.orders} orders</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(row.revenue / monthTotal) * 100}%` }} />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top products this month</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet this month.</p>
              ) : (
                <ol className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <li key={p._id} className="flex items-center gap-3 text-sm">
                      <span className="grid size-6 place-items-center rounded-md bg-muted text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{en(p.name)}</span>
                      <span className="font-semibold tabular-nums">{formatINR(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
