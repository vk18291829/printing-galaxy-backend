import {
  IconCash,
  IconCircleCheck,
  IconMapPin,
  IconPhone,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { OrderStatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth-store';
import { useCompleteDelivery, useDeliveries, useFailDelivery, useStartDelivery } from '@/features/operations/api';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { DeliveryOrder } from '@/types/admin';

const due = (o: DeliveryOrder) => Math.max(0, Math.round((o.totals.total - o.payment.amountPaid) * 100) / 100);

function addressLine(o: DeliveryOrder) {
  const a = o.fulfilment.address;
  return a ? [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ') : '';
}

function DeliveredDialog({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const complete = useCompleteDelivery();
  const owed = due(order);
  const [amount, setAmount] = useState(owed ? String(owed) : '0');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');
  const [note, setNote] = useState('');
  const value = Number(amount) || 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {order.orderNumber} delivered</DialogTitle>
          <DialogDescription>{owed > 0 ? `${formatINR(owed)} is due on this order.` : 'This order is fully paid.'}</DialogDescription>
        </DialogHeader>
        {owed > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="collected">Amount collected</Label>
              <Input id="collected" type="number" inputMode="decimal" min={0} max={owed} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'upi_counter'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn('rounded-xl border py-2.5 text-sm font-medium', provider === p && 'border-primary bg-primary/5 text-primary')}
                >
                  {p === 'cash' ? 'Cash' : 'UPI'}
                </button>
              ))}
            </div>
            {value < owed && <p className="text-xs text-amber-700 dark:text-warning">{formatINR(owed - value)} will stay due.</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="dnote">Note (optional)</Label>
          <Input id="dnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Handed to security, etc." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={complete.isPending || value > owed + 0.009}
            onClick={async () => {
              const ok = await confirmAction({
                title: `Mark ${order.orderNumber} as delivered?`,
                description: owed > 0 ? `You collected ${formatINR(value)} by ${provider === 'cash' ? 'cash' : 'UPI'}. The customer is notified.` : 'The customer is notified that the order was delivered.',
                confirmLabel: 'Mark delivered',
                action: () => complete.mutateAsync({ id: order._id, cashCollected: owed > 0 ? value : 0, provider, note: note || undefined }),
                successTitle: 'Delivered',
              });
              if (ok) onClose();
            }}
          >
            {complete.isPending && <Spinner className="size-4 text-current" />} Confirm delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FailedDialog({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const fail = useFailDelivery();
  const [note, setNote] = useState('');
  const reasons = ['Customer not reachable', 'Nobody at home', 'Wrong address', 'Customer asked to come later'];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Couldn't deliver {order.orderNumber}</DialogTitle>
          <DialogDescription>The order goes back to “ready” so the shop can plan another attempt.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <Button key={r} type="button" size="sm" variant={note === r ? 'default' : 'outline'} onClick={() => setNote(r)}>
              {r}
            </Button>
          ))}
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" className="min-h-16" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={fail.isPending || note.trim().length < 2}
            onClick={async () => {
              const ok = await confirmAction({
                tone: 'danger',
                title: `Report ${order.orderNumber} as not delivered?`,
                description: `Reason: “${note.trim()}”. The order goes back to the shop as ready.`,
                confirmLabel: 'Report failed delivery',
                action: () => fail.mutateAsync({ id: order._id, note: note.trim() }),
                successTitle: 'Shop informed',
              });
              if (ok) onClose();
            }}
          >
            {fail.isPending && <Spinner className="size-4 text-current" />} Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryCard({ order, showRider }: { order: DeliveryOrder; showRider: boolean }) {
  const start = useStartDelivery();
  const [dialog, setDialog] = useState<'done' | 'failed' | null>(null);
  const owed = due(order);
  const address = addressLine(order);
  const lastFail = [...(order.statusHistory ?? [])].reverse().find((h) => h.note?.startsWith('Delivery attempt failed'));

  return (
    <Card className={cn('gap-3 py-4', order.status === 'out_for_delivery' && 'border-primary/50 ring-1 ring-primary/20')}>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-base font-bold">{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              Placed {formatDate(order.createdAt)}
              {showRider && order.deliveryPerson ? ` · ${order.deliveryPerson.name}` : ''}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="space-y-1.5 text-sm">
          <p className="font-semibold">{order.fulfilment.address?.name || order.contact.name || 'Customer'}</p>
          {address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${order.fulfilment.address?.state ?? ''}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 text-primary hover:underline"
            >
              <IconMapPin className="mt-0.5 size-4 shrink-0" /> {address}
            </a>
          )}
          {(order.fulfilment.address?.phone || order.contact.phone) && (
            <a href={`tel:+91${order.fulfilment.address?.phone || order.contact.phone}`} className="flex items-center gap-2 text-primary hover:underline">
              <IconPhone className="size-4" /> +91 {order.fulfilment.address?.phone || order.contact.phone}
            </a>
          )}
        </div>

        <ul className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-2">
              <span className="truncate">{en(i.productName)}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatNumber(i.units)} {unitLabel(i.unit, i.units)}
              </span>
            </li>
          ))}
        </ul>
        {order.customerNote && <p className="text-sm text-muted-foreground">“{order.customerNote}”</p>}
        {lastFail && order.status === 'ready' && <p className="text-xs text-amber-700 dark:text-warning">Last attempt: {lastFail.note?.replace('Delivery attempt failed: ', '')}</p>}

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          {owed > 0 ? (
            <Badge variant="warning" className="text-sm">
              <IconCash /> Collect {formatINR(owed)}
            </Badge>
          ) : (
            <Badge variant="success">Paid</Badge>
          )}
          <div className="flex gap-2">
            {order.status === 'ready' && (
              <Button
                disabled={start.isPending}
                onClick={() =>
                  void confirmAction({
                    title: `Start delivery of ${order.orderNumber}?`,
                    description: 'The order is marked “out for delivery” and the customer is told you are on the way.',
                    confirmLabel: 'Start delivery',
                    action: () => start.mutateAsync(order._id),
                    successTitle: 'On the way — customer notified',
                  })
                }
              >
                {start.isPending ? <Spinner className="size-4 text-current" /> : <IconTruckDelivery />} Start
              </Button>
            )}
            {order.status === 'out_for_delivery' && (
              <>
                <Button variant="outline" size="icon" onClick={() => setDialog('failed')} aria-label="Couldn't deliver">
                  <IconX />
                </Button>
                <Button onClick={() => setDialog('done')}>
                  <IconCircleCheck /> Delivered
                </Button>
              </>
            )}
            {['approved', 'printing'].includes(order.status) && <span className="text-xs text-muted-foreground">Still in production</span>}
          </div>
        </div>
      </CardContent>
      {dialog === 'done' && <DeliveredDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === 'failed' && <FailedDialog order={order} onClose={() => setDialog(null)} />}
    </Card>
  );
}

export default function DeliveriesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, error, refetch } = useDeliveries();
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const showRider = role !== 'delivery';
  const cashToday = data.doneToday.length;

  return (
    <div>
      <PageHeader
        title={showRider ? 'Deliveries' : 'My deliveries'}
        description={showRider ? 'All delivery orders that have a rider assigned.' : 'Start a delivery when you leave the shop; customers get a message.'}
      />
      {data.active.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={<IconTruckDelivery />} title="Nothing to deliver right now" description="New assignments show up here automatically." />
        </Card>
      ) : (
        <div className="grid items-start gap-4 *:min-w-0 lg:grid-cols-2 2xl:grid-cols-3">
          {data.active.map((o) => (
            <DeliveryCard key={o._id} order={o} showRider={showRider} />
          ))}
        </div>
      )}

      {cashToday > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">Delivered today ({cashToday})</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {data.doneToday.map((o) => (
              <li key={o._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-mono font-semibold">{o.orderNumber}</span>
                <span className="truncate text-muted-foreground">{o.fulfilment.address?.name || o.contact.name}</span>
                <span className="tabular-nums">{formatINR(o.payment.amountPaid)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
