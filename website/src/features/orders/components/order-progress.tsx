import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types/api';

function stagesFor(order: Order): OrderStatus[] {
  const needsProof = order.items.some((i) => i.workflow === 'design' || i.proofs.length > 0);
  const history = new Set(order.statusHistory?.map((h) => h.status));
  const start: OrderStatus[] = [
    ...(history.has('quote_pending') ? (['quote_pending'] as const) : []),
    ...(history.has('quote_sent') ? (['quote_sent'] as const) : []),
    ...(history.has('awaiting_payment') ? (['awaiting_payment'] as const) : []),
    'received',
  ];
  const proof: OrderStatus[] = needsProof ? ['proof_sent', 'approved'] : [];
  const end: OrderStatus[] =
    order.fulfilment.method === 'delivery' ? ['printing', 'out_for_delivery', 'delivered'] : ['printing', 'ready', 'picked_up'];
  return [...start, ...proof, ...end];
}

export function OrderProgress({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  if (order.status === 'cancelled') return null;
  const stages = stagesFor(order);
  // "received" can repeat after a change request; use the furthest stage reached.
  const reached = new Set(order.statusHistory?.map((h) => h.status));
  const currentIndex = Math.max(stages.indexOf(order.status), 0);
  const whenReached = (s: OrderStatus) => [...(order.statusHistory ?? [])].reverse().find((h) => h.status === s)?.at;

  return (
    <ol className="relative space-y-0">
      {stages.map((stage, i) => {
        const done = i < currentIndex || (i === currentIndex && ['delivered', 'picked_up'].includes(stage));
        const current = i === currentIndex && !done;
        const at = whenReached(stage);
        return (
          <li key={stage} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 && (
              <span className={cn('absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5', i < currentIndex ? 'bg-primary' : 'bg-border')} />
            )}
            <span
              className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
                done && 'border-primary bg-primary text-primary-foreground',
                current && 'border-primary bg-background text-primary ring-4 ring-primary/15',
                !done && !current && 'border-border bg-background text-muted-foreground',
              )}
            >
              {done ? <IconCheck className="size-4" stroke={3} /> : i + 1}
            </span>
            <div className="pt-1">
              <p className={cn('text-sm font-semibold', !done && !current && 'text-muted-foreground')}>
                {t(`status.order.${stage}`)}
              </p>
              {at && (done || current) && reached.has(stage) && (
                <p className="text-xs text-muted-foreground">{formatDate(at, i18n.language, true)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
