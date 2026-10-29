import {
  IconCash,
  IconCheck,
  IconCircleCheck,
  IconHistory,
  IconHomeCheck,
  IconInbox,
  IconPackage,
  IconPhotoCheck,
  IconPrinter,
  IconReceipt2,
  IconSend,
  IconThumbUp,
  IconTruckDelivery,
  IconX,
  type Icon,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const ICON: Record<OrderStatus, Icon> = {
  quote_pending: IconReceipt2,
  quote_sent: IconSend,
  awaiting_payment: IconCash,
  received: IconInbox,
  proof_sent: IconPhotoCheck,
  approved: IconThumbUp,
  printing: IconPrinter,
  ready: IconPackage,
  out_for_delivery: IconTruckDelivery,
  delivered: IconHomeCheck,
  picked_up: IconCircleCheck,
  cancelled: IconX,
};

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
        const StageIcon = ICON[stage];
        return (
          <li key={stage} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < stages.length - 1 && (
              <span aria-hidden className={cn('absolute top-10 bottom-0 left-[19px] w-0.5 rounded-full', i < currentIndex ? 'bg-brand-navy' : 'bg-border')} />
            )}
            <span
              className={cn(
                'relative z-10 grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5',
                done && 'bg-brand-navy text-white',
                current && 'bg-brand-amber text-brand-navy ring-4 ring-brand-amber/25',
                !done && !current && 'border-2 border-dashed border-border bg-card text-muted-foreground',
              )}
            >
              {done ? <IconCheck stroke={3} /> : <StageIcon />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn('flex flex-wrap items-center gap-2 text-sm font-semibold', !done && !current && 'text-muted-foreground')}>
                {t(`status.order.${stage}`)}
                {current && <span className="rounded-full bg-brand-amber px-2 py-0.5 text-[11px] font-bold text-brand-navy">{t('orders.now')}</span>}
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

/**
 * The tracking card body: the full step list on wider screens; on phones where the order is now,
 * with the full list in a bottom sheet.
 */
export function OrderTracking({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  if (order.status === 'cancelled') return null;
  const CurrentIcon = ICON[order.status];
  const at = [...(order.statusHistory ?? [])].reverse().find((h) => h.status === order.status)?.at;
  return (
    <>
      <div className="space-y-3 sm:hidden">
        <div className="flex items-center gap-3 rounded-xl bg-brand-amber/10 p-3 ring-1 ring-brand-amber/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-amber text-brand-navy [&_svg]:size-5">
            <CurrentIcon />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t(`status.order.${order.status}`)}</p>
            {at && <p className="text-xs text-muted-foreground">{formatDate(at, i18n.language, true)}</p>}
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <IconHistory /> {t('orders.viewTracking')}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('orders.timeline')}</DialogTitle>
              <DialogDescription>{order.orderNumber}</DialogDescription>
            </DialogHeader>
            <OrderProgress order={order} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="hidden sm:block">
        <OrderProgress order={order} />
      </div>
    </>
  );
}
