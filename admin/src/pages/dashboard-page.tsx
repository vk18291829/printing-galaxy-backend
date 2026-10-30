import {
  IconArrowRight,
  IconBuildingCommunity,
  IconCash,
  IconCalendarMonth,
  IconChartBar,
  IconChartPie,
  IconClockHour4,
  IconPackage,
  IconTrophy,
  IconReceipt,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { ErrorState, PageLoader, SectionTitle } from '@/components/common/states';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NextSteps } from '@/features/dashboard/next-steps';
import { ProductionPipeline } from '@/features/dashboard/production-pipeline';
import { RevenueChart } from '@/features/dashboard/revenue-chart';
import { TrafficCard } from '@/features/dashboard/traffic-card';
import { useAuthStore, useCan } from '@/features/auth/auth-store';
import { useDashboard } from '@/features/management/api';
import { formatDate, formatINR } from '@/lib/format';
import { en } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { OrderSegment } from '@/types/api';

/** One number in the welcome band; a link when there is a list behind it. */
function StatTile({ icon, label, value, sub, to }: { icon: ReactNode; label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <div className="flex h-full items-start justify-between gap-3 rounded-2xl bg-card p-3.5 ring-1 ring-border transition-colors hover:ring-primary/30 sm:p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold tracking-tight text-brand-navy tabular-nums sm:text-2xl dark:text-foreground">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-brand-amber text-brand-navy sm:grid [&_svg]:size-5">{icon}</span>
    </div>
  );
  return to ? (
    <Link to={to} className="rounded-2xl focus-visible:ring-2 focus-visible:ring-brand-amber focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const SEGMENTS: { key: OrderSegment; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'institution', label: 'School & College' },
  { key: 'business', label: 'Business' },
  { key: 'wedding', label: 'Wedding' },
];

export default function DashboardPage() {
  const canSeeReports = useCan('reports');
  const firstName = useAuthStore((s) => s.user?.name?.split(/\s+/)[0]);
  const { data, isLoading, error, refetch } = useDashboard();
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const segments = SEGMENTS.map((s) => ({ ...s, ...(data.bySegment?.[s.key] ?? { revenue: 0, orders: 0 }), open: data.openBySegment?.[s.key] ?? 0 }));
  const monthTotal = segments.reduce((sum, s) => sum + s.revenue, 0) || 1;

  return (
    <div className="space-y-6">
      <section className="light-band rounded-3xl p-5 sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-primary/70 uppercase">
              {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date())}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl dark:text-foreground">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Today at a glance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/orders/new">
                <IconReceipt /> New walk-in order
              </Link>
            </Button>
            <Button variant="outline" className="bg-card" asChild>
              <Link to="/orders?active=true">
                <IconPackage /> Open orders
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
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
      </section>

      <NextSteps data={data} />

      <ProductionPipeline counts={data.openByStatus} />

      <Card>
        <CardHeader>
          <SectionTitle icon={<IconChartBar />} title="Revenue" description="Last 14 days" />
        </CardHeader>
        <CardContent>
          <RevenueChart data={data.daily} />
        </CardContent>
      </Card>

      {canSeeReports && <TrafficCard />}

      <Card className="gap-0 pb-0">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <SectionTitle icon={<IconClockHour4 />} title="Recent orders" description="The latest orders, online and at the counter" />
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

        <div className="grid gap-6 *:min-w-0 md:grid-cols-2">
          <Card>
            <CardHeader>
              <SectionTitle icon={<IconChartPie />} title="This month by line of business" />
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
                    <div className="h-full rounded-full bg-brand-amber" style={{ width: `${(row.revenue / monthTotal) * 100}%` }} />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionTitle icon={<IconTrophy />} title="Top products this month" />
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet this month.</p>
              ) : (
                <ol className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <li key={p._id} className="flex items-center gap-3 text-sm">
                      <span className={cn('grid size-7 place-items-center rounded-lg text-xs font-bold', i === 0 ? 'bg-brand-amber text-brand-navy' : 'bg-secondary text-primary')}>{i + 1}</span>
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
  );
}
