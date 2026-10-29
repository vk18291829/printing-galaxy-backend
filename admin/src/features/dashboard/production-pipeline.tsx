import { IconArrowRight, IconClockPause, IconHandClick } from '@tabler/icons-react';
import { Link } from 'react-router';
import { ORDER_STATUS_LABEL } from '@/components/common/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types/api';

/** What happens at each stage, and whose move it is. */
const STAGES: { status: OrderStatus; turn: 'shop' | 'customer'; hint: string }[] = [
  { status: 'quote_pending', turn: 'shop', hint: 'Set the price' },
  { status: 'quote_sent', turn: 'customer', hint: 'Customer accepts the price' },
  { status: 'received', turn: 'shop', hint: 'Check files, send a proof' },
  { status: 'proof_sent', turn: 'customer', hint: 'Customer checks the proof' },
  { status: 'approved', turn: 'shop', hint: 'Proof approved, print it' },
  { status: 'printing', turn: 'shop', hint: 'On the machines' },
  { status: 'ready', turn: 'shop', hint: 'Hand over or dispatch' },
  { status: 'out_for_delivery', turn: 'shop', hint: 'With the rider' },
];

const PHASES: { label: string; statuses: OrderStatus[] }[] = [
  { label: 'Pricing', statuses: ['quote_pending', 'quote_sent'] },
  { label: 'Design & proof', statuses: ['received', 'proof_sent', 'approved'] },
  { label: 'Printing', statuses: ['printing'] },
  { label: 'Handover', statuses: ['ready', 'out_for_delivery'] },
];

/**
 * Every open order by stage, left to right in the order work flows. Stages where it is the shop's
 * move are marked amber; stages waiting on the customer (price or proof approval) say so.
 */
export function ProductionPipeline({ counts }: { counts: Partial<Record<OrderStatus, number>> }) {
  const total = STAGES.reduce((n, s) => n + (counts[s.status] ?? 0), 0);
  const yourTurn = STAGES.filter((s) => s.turn === 'shop').reduce((n, s) => n + (counts[s.status] ?? 0), 0);
  const waiting = total - yourTurn;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Production pipeline</CardTitle>
          <CardDescription>Every open order, by the stage it is at.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-amber/40 bg-brand-amber/12 px-3 py-1 font-semibold text-foreground">
            <IconHandClick className="size-4 text-brand-navy" /> {yourTurn} need you
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-medium text-muted-foreground">
            <IconClockPause className="size-4" /> {waiting} waiting for customer
          </span>
          <Link to="/orders?active=true" className="inline-flex items-center gap-1 px-1 font-semibold text-primary hover:underline">
            All {total} open <IconArrowRight className="size-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[2fr_3fr_1fr_2fr]">
          {PHASES.map((phase, p) => (
            <section key={phase.label} className="min-w-0">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <span className="grid size-5 place-items-center rounded-full bg-brand-navy text-[10px] text-white">{p + 1}</span>
                {phase.label}
              </h3>
              <div className={cn('grid gap-2', phase.statuses.length === 3 ? 'grid-cols-3' : phase.statuses.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                {phase.statuses.map((status) => {
                  const stage = STAGES.find((s) => s.status === status)!;
                  const n = counts[status] ?? 0;
                  const act = stage.turn === 'shop' && n > 0;
                  return (
                    <Link
                      key={status}
                      to={`/orders?status=${status}`}
                      className={cn(
                        'group flex min-h-28 flex-col justify-between rounded-xl border p-3 transition-colors',
                        act ? 'border-brand-amber/50 bg-brand-amber/10 hover:border-brand-amber' : 'bg-card hover:border-primary/30',
                        n === 0 && 'opacity-70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] leading-tight font-semibold text-foreground">{ORDER_STATUS_LABEL[status]}</span>
                        {stage.turn === 'customer' && <IconClockPause className="size-4 shrink-0 text-muted-foreground" aria-label="Waiting for customer" />}
                      </div>
                      <div>
                        <span className={cn('block text-3xl font-bold tracking-tight tabular-nums', n === 0 ? 'text-muted-foreground' : 'text-brand-navy')}>{n}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">{stage.hint}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
