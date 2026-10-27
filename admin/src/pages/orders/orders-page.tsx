import { IconAlertTriangle, IconBriefcase, IconHeart, IconLayoutGrid, IconPackageOff, IconReceipt, IconSchool, IconSearch, IconUser } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { ORDER_STATUS_LABEL, OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminOrders } from '@/features/orders/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDate, formatINR } from '@/lib/format';
import { en } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { Order, OrderSegment, OrderStatus } from '@/types/api';

const STATUS_TABS: (OrderStatus | 'active' | 'all')[] = [
  'active',
  'quote_pending',
  'quote_sent',
  'awaiting_payment',
  'received',
  'proof_sent',
  'printing',
  'ready',
  'all',
];

/** Each line of business is its own queue. */
const SEGMENT_TABS: { key: OrderSegment | 'all'; label: string; icon: typeof IconUser }[] = [
  { key: 'all', label: 'All', icon: IconLayoutGrid },
  { key: 'individual', label: 'Individual', icon: IconUser },
  { key: 'institution', label: 'School & College', icon: IconSchool },
  { key: 'business', label: 'Business', icon: IconBriefcase },
  { key: 'wedding', label: 'Wedding', icon: IconHeart },
];

const CLOSED: OrderStatus[] = ['delivered', 'picked_up', 'cancelled', 'ready', 'out_for_delivery'];

/** "Due 29 Oct", red once the date has passed and the order isn't ready yet. */
function DueLabel({ order }: { order: Pick<Order, 'dueDate' | 'status'> }) {
  if (!order.dueDate || CLOSED.includes(order.status)) return null;
  const late = new Date(order.dueDate) < new Date(new Date().toDateString());
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', late ? 'text-destructive' : 'text-muted-foreground')}>
      {late && <IconAlertTriangle className="size-3" />}
      {late ? 'Overdue · ' : 'Due '}
      {formatDate(order.dueDate, 'en')}
    </span>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300) || undefined;

  const statusParam = params.get('status') as OrderStatus | null;
  const tab: OrderStatus | 'active' | 'all' = statusParam ?? (params.get('active') === 'false' ? 'all' : 'active');
  const segment = (params.get('segment') as OrderSegment | null) ?? undefined;
  const overdue = params.get('overdue') === 'true';
  const paymentStatus = params.get('paymentStatus') ?? undefined;
  const page = Number(params.get('page') ?? 1);

  const { data, isLoading, error, refetch, isFetching } = useAdminOrders({
    page,
    q,
    segment,
    overdue: overdue || undefined,
    paymentStatus,
    status: statusParam ?? undefined,
    active: tab === 'active',
  });

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const selectTab = (t: (typeof STATUS_TABS)[number]) =>
    update(t === 'active' ? { status: undefined, active: undefined } : t === 'all' ? { status: undefined, active: 'false' } : { status: t, active: undefined });

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every online and counter order in one place."
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <IconReceipt /> Walk-in order
            </Link>
          </Button>
        }
      />

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {SEGMENT_TABS.map(({ key, label, icon: Icon }) => {
          const on = (segment ?? 'all') === key;
          const count = key === 'all' ? undefined : data?.segmentCounts?.[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => update({ segment: key === 'all' ? undefined : key })}
              aria-pressed={on}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
              {count ? <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', on ? 'bg-white/20' : 'bg-muted')}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 [scrollbar-width:none]">
        {STATUS_TABS.map((t) => {
          const count = t !== 'active' && t !== 'all' ? data?.statusCounts[t] : undefined;
          return (
            <button
              key={t}
              onClick={() => selectTab(t)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                tab === t && 'bg-primary/10 text-primary',
              )}
            >
              {t === 'active' ? 'Open' : t === 'all' ? 'All' : ORDER_STATUS_LABEL[t]}
              {count ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{count}</Badge> : null}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number, phone or name" className="pl-9" />
        </div>
        <Button
          variant={overdue ? 'destructive' : 'outline'}
          className="sm:w-auto"
          onClick={() => update({ overdue: overdue ? undefined : 'true' })}
          aria-pressed={overdue}
        >
          <IconAlertTriangle /> Overdue
        </Button>
        <Select value={paymentStatus ?? 'all'} onValueChange={(v) => update({ paymentStatus: v === 'all' ? undefined : v })}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            <SelectItem value="pending">Unpaid</SelectItem>
            <SelectItem value="partial">Partly paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="gap-0 py-0">
          {isLoading ? (
            <div className="grid h-64 place-items-center">
              <Spinner />
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              {/* Phones: one card per order so status, payment and total stay visible. */}
              <ul className={cn('divide-y md:hidden', isFetching && 'opacity-70')}>
                {data.items.map((o) => (
                  <li key={o._id}>
                    <Link to={`/orders/${o._id}`} className="block space-y-2 px-4 py-3.5 active:bg-accent/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold">{o.orderNumber}</p>
                          <p className="truncate text-sm">{o.contact?.name || '—'}</p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums">{formatINR(o.totals.total)}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{o.items.map((i) => en(i.productName)).join(', ')}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={o.status} />
                        <PaymentStatusBadge status={o.payment.status} />
                        <DueLabel order={o} />
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {formatDate(o.createdAt, 'en', true)} · {o.audience === 'institution' ? 'Institution' : o.source === 'walk_in' ? 'Walk-in' : 'Online'}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
              <Table className={cn(isFetching && 'opacity-70')}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="pr-5 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((o) => (
                    <TableRow key={o._id} className="cursor-pointer" onClick={() => navigate(`/orders/${o._id}`)}>
                      <TableCell className="pl-5">
                        <p className="font-mono font-semibold">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(o.createdAt, 'en', true)}</p>
                        <DueLabel order={o} />
                      </TableCell>
                      <TableCell>
                        <p className="max-w-52 truncate font-medium">{o.contact?.name || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.contact?.phone} ·{' '}
                          {o.audience === 'institution' ? 'Institution' : o.source === 'walk_in' ? 'Walk-in' : 'Online'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-56 truncate text-sm">{o.items.map((i) => en(i.productName)).join(', ')}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.fulfilment.method === 'delivery' ? 'Delivery' : 'Pickup'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={o.payment.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.assignedTo?.name ?? '—'}</TableCell>
                      <TableCell className="pr-5 text-right font-semibold tabular-nums">{formatINR(o.totals.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: String(p) })} />
            </>
          ) : (
            <EmptyState icon={<IconPackageOff />} title="No orders found" description="Try another filter or search." />
          )}
        </Card>
      )}
    </div>
  );
}
