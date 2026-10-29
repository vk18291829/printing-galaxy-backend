import {
  IconListCheck,
  IconArrowRight,
  IconBoxSeam,
  IconBuildingCommunity,
  IconCash,
  IconCircleCheck,
  IconClockPause,
  IconPackage,
  IconPhotoCheck,
  IconPrinter,
  IconReceipt2,
  IconStars,
  IconTruckDelivery,
  type Icon,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { SectionTitle } from '@/components/common/states';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardData } from '@/types/admin';

interface Step {
  key: string;
  icon: Icon;
  count: number;
  /** What to do, written for the person at the counter. */
  title: string;
  hint: string;
  to: string;
  /** Highlighted: the customer is waiting on the shop. */
  urgent?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "What to do next": the shop's own jobs right now, most important first, each linking to the
 * orders (or screen) to work on. Things waiting on customers are listed separately underneath.
 */
export function NextSteps({ data }: { data: DashboardData }) {
  const s = data.openByStatus;
  const steps: Step[] = [
    {
      key: 'quote',
      icon: IconReceipt2,
      count: s.quote_pending ?? 0,
      title: `Price ${plural(s.quote_pending ?? 0, 'custom request')}`,
      hint: 'The customer is waiting for your quote.',
      to: '/orders?status=quote_pending',
      urgent: true,
    },
    {
      key: 'received',
      icon: IconPhotoCheck,
      count: s.received ?? 0,
      title: `Check files and send proofs for ${plural(s.received ?? 0, 'new order')}`,
      hint: 'Design items need the customer’s approval before printing.',
      to: '/orders?status=received',
      urgent: true,
    },
    {
      key: 'approved',
      icon: IconPrinter,
      count: s.approved ?? 0,
      title: `Print ${plural(s.approved ?? 0, 'approved order')}`,
      hint: 'The customer approved the proof.',
      to: '/orders?status=approved',
    },
    {
      key: 'printing',
      icon: IconCircleCheck,
      count: s.printing ?? 0,
      title: `Mark ${plural(s.printing ?? 0, 'order')} ready when printed`,
      hint: 'On the machines now.',
      to: '/orders?status=printing',
    },
    {
      key: 'ready',
      icon: IconPackage,
      count: s.ready ?? 0,
      title: `Hand over or dispatch ${plural(s.ready ?? 0, 'ready order')}`,
      hint: 'Pickups at the counter, deliveries to a rider.',
      to: '/orders?status=ready',
    },
    {
      key: 'delivery',
      icon: IconTruckDelivery,
      count: s.out_for_delivery ?? 0,
      title: `Follow ${plural(s.out_for_delivery ?? 0, 'delivery', 'deliveries')} on the road`,
      hint: 'With the riders now.',
      to: '/deliveries',
    },
    {
      key: 'payments',
      icon: IconCash,
      count: data.pendingPayments.orders,
      title: `Collect ${formatINR(data.pendingPayments.due)} due`,
      hint: `Across ${plural(data.pendingPayments.orders, 'order')}.`,
      to: '/orders?paymentStatus=pending',
    },
    {
      key: 'institutions',
      icon: IconBuildingCommunity,
      count: data.pendingInstitutions,
      title: `Approve ${plural(data.pendingInstitutions, 'institution')}`,
      hint: 'They cannot see school prices until approved.',
      to: '/institutions?status=pending',
      urgent: true,
    },
    {
      key: 'reviews',
      icon: IconStars,
      count: data.pendingReviews ?? 0,
      title: `Check ${plural(data.pendingReviews ?? 0, 'new review')}`,
      hint: 'Approve them so they show on the website.',
      to: '/reviews',
    },
    {
      key: 'stock',
      icon: IconBoxSeam,
      count: data.lowStock.length,
      title: `Restock ${plural(data.lowStock.length, 'material')}`,
      hint: data.lowStock
        .slice(0, 3)
        .map((m) => `${m.name} (${m.quantity} ${m.unit})`)
        .join(', '),
      to: '/inventory',
      urgent: true,
    },
  ].filter((step) => step.count > 0);

  const waiting = [
    (s.quote_sent ?? 0) > 0 && `${plural(s.quote_sent ?? 0, 'quote')} to accept`,
    (s.proof_sent ?? 0) > 0 && `${plural(s.proof_sent ?? 0, 'proof')} to approve`,
    (s.awaiting_payment ?? 0) > 0 && `${plural(s.awaiting_payment ?? 0, 'payment')} to make`,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={<IconListCheck />} title="What to do next" description="The shop’s jobs right now, most important first." />
        {steps.length > 0 && (
          <span className="rounded-full bg-brand-amber px-3 py-1 text-sm font-semibold text-brand-navy">{plural(steps.length, 'thing')} to do</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-success/10 p-4 text-sm font-medium">
            <IconCircleCheck className="size-5 shrink-0 text-success" /> All caught up. Nothing is waiting on the shop right now.
          </div>
        ) : (
          <ol className="grid grid-cols-1 gap-2.5 *:min-w-0 md:grid-cols-2 2xl:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.key}>
                <Link
                  to={step.to}
                  className={cn(
                    'group flex h-full items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-primary/40',
                    step.urgent ? 'border-brand-amber/60 bg-brand-amber/8' : 'bg-card',
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white tabular-nums">{i + 1}</span>
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5',
                      step.urgent ? 'bg-brand-amber text-brand-navy' : 'bg-secondary text-primary',
                    )}
                  >
                    <step.icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-semibold">{step.title}</span>
                    {step.hint && <span className="block truncate text-xs text-muted-foreground">{step.hint}</span>}
                  </span>
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ol>
        )}
        {waiting.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <IconClockPause className="size-4 shrink-0" />
            <span className="font-medium text-foreground">Waiting on customers:</span>
            {waiting.join(' · ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
