import { IconAlertTriangle, IconChecklist } from '@tabler/icons-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '@/components/common/states';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/auth-store';
import { useAdminOrders } from '@/features/orders/api';
import { formatDate, formatINR } from '@/lib/format';
import { en } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types/api';

const DONE: OrderStatus[] = ['ready', 'out_for_delivery'];

const dayKey = (d?: string) => (d ? new Date(d).toDateString() : '');

/**
 * A staff member's own queue: open orders assigned to them, soonest ready-by date first,
 * grouped into Overdue / Today / Tomorrow / Later.
 */
export default function MyWorkPage() {
  const me = useAuthStore((s) => s.user);
  const { data, isLoading, error, refetch } = useAdminOrders({ assignedTo: me?._id, active: true, sort: 'due', limit: 100 });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const today = new Date(new Date().toDateString());
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const group = (due?: string) => {
    if (!due) return 'Later';
    const d = new Date(due);
    if (d < today) return 'Overdue';
    if (dayKey(due) === today.toDateString()) return 'Today';
    if (dayKey(due) === tomorrow.toDateString()) return 'Tomorrow';
    return 'Later';
  };
  const groups = ['Overdue', 'Today', 'Tomorrow', 'Later'].map((name) => ({
    name,
    items: data.items.filter((o) => group(o.dueDate) === name),
  }));

  return (
    <div>
      <PageHeader icon={<IconChecklist />} title="My work" description={`Open orders assigned to ${me?.name || 'you'}, soonest first.`} />
      {data.items.length === 0 ? (
        <EmptyState icon={<IconChecklist />} title="Nothing assigned to you" description="Orders show here when someone assigns them to you on the order page." />
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.name}>
                <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', g.name === 'Overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                  {g.name === 'Overdue' && <IconAlertTriangle className="size-4" />}
                  {g.name} · {g.items.length}
                </h2>
                <Card className="gap-0 divide-y py-0">
                  {g.items.map((o) => (
                    <Link key={o._id} to={`/orders/${o._id}`} className="block space-y-1.5 px-4 py-3 hover:bg-accent/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold">{o.orderNumber}</p>
                          <p className="truncate text-sm">{o.items.map((i) => en(i.productName)).join(', ')}</p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums">{formatINR(o.totals.total)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={o.status} />
                        <PaymentStatusBadge status={o.payment.status} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {o.contact?.name || '—'}
                          {o.dueDate && !DONE.includes(o.status) && ` · due ${formatDate(o.dueDate, 'en')}`}
                        </span>
                      </div>
                    </Link>
                  ))}
                </Card>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
