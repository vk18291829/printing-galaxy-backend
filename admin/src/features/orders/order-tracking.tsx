import {
  IconCash,
  IconChevronRight,
  IconCircleCheck,
  IconClockHour4,
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
import { SectionTitle } from '@/components/common/states';
import { ORDER_STATUS_LABEL } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminOrder } from '@/types/admin';
import type { OrderStatus } from '@/types/api';

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

/** What normally comes after each step, for the "Next" line at the end of the timeline. */
function nextStep(order: AdminOrder): string | null {
  const proof = order.items.some((i) => i.workflow === 'design');
  const delivery = order.fulfilment.method === 'delivery';
  const next: Partial<Record<OrderStatus, string>> = {
    quote_pending: 'Shop sends the price',
    quote_sent: 'Customer accepts the quote',
    awaiting_payment: 'Customer pays',
    received: proof ? 'Send a proof to the customer' : 'Start printing',
    proof_sent: 'Customer approves the proof',
    approved: 'Start printing',
    printing: delivery ? 'Pack for delivery' : 'Mark ready for pickup',
    ready: delivery ? 'Hand to a rider' : 'Customer collects it',
    out_for_delivery: 'Delivered to the customer',
  };
  return next[order.status] ?? null;
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Every status change, oldest first, with the current step highlighted and what comes next. */
function Timeline({ order }: { order: AdminOrder }) {
  const history = order.statusHistory ?? [];
  const next = nextStep(order);
  const seen = new Map<OrderStatus, number>();
  return (
    <ol className="space-y-0">
      {history.map((h, i) => {
        const current = i === history.length - 1;
        const StatusIcon = ICON[h.status] ?? IconClockHour4;
        const repeat = (seen.get(h.status) ?? 0) > 0;
        seen.set(h.status, (seen.get(h.status) ?? 0) + 1);
        const cancelled = h.status === 'cancelled';
        return (
          <li key={`${h.status}-${h.at}`} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* The line joining this step to the next one. */}
            {(i < history.length - 1 || next) && <span aria-hidden className="absolute top-10 bottom-0 left-[19px] w-0.5 rounded-full bg-border" />}
            <span
              className={cn(
                'relative grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5',
                cancelled ? 'bg-destructive/12 text-destructive' : current ? 'bg-brand-amber text-brand-navy ring-4 ring-brand-amber/25' : 'bg-brand-navy text-white',
              )}
            >
              <StatusIcon />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {ORDER_STATUS_LABEL[h.status]}
                {repeat && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">again</span>}
                {current && !cancelled && <span className="rounded-full bg-brand-amber px-2 py-0.5 text-[11px] font-bold text-brand-navy">Now</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(h.at, 'en', true)} · {ago(h.at)}
              </p>
              {h.note && <p className="mt-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm text-foreground/80">“{h.note}”</p>}
            </div>
          </li>
        );
      })}
      {next && (
        <li className="relative flex gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground">
            <IconChevronRight className="size-5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next</p>
            <p className="font-medium text-muted-foreground">{next}</p>
          </div>
        </li>
      )}
    </ol>
  );
}

/**
 * Order tracking: the full timeline on wide screens. On phones only where the order is now, with the
 * whole history in a bottom sheet.
 */
export function OrderTracking({ order }: { order: AdminOrder }) {
  const phone = useMediaQuery('(max-width: 639.98px)');
  const [open, setOpen] = useState(false);
  const history = order.statusHistory ?? [];
  const last = history.at(-1);
  const LastIcon = last ? (ICON[last.status] ?? IconClockHour4) : IconClockHour4;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <SectionTitle icon={<IconHistory />} title="Tracking" description={`${history.length} ${history.length === 1 ? 'update' : 'updates'} on this order`} />
      </CardHeader>
      <CardContent>
        {phone ? (
          <div className="space-y-3">
            {last && (
              <div className="flex items-center gap-3 rounded-xl bg-brand-amber/10 p-3 ring-1 ring-brand-amber/40">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-amber text-brand-navy [&_svg]:size-5">
                  <LastIcon />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{ORDER_STATUS_LABEL[last.status]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(last.at, 'en', true)} · {ago(last.at)}
                  </p>
                </div>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
              <IconHistory /> View full history
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tracking · {order.orderNumber}</DialogTitle>
                  <DialogDescription>Every change to this order, oldest first.</DialogDescription>
                </DialogHeader>
                <Timeline order={order} />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <Timeline order={order} />
        )}
      </CardContent>
    </Card>
  );
}
