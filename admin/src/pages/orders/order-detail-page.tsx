import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconBuildingStore,
  IconCash,
  IconClockHour4,
  IconDownload,
  IconFileInvoice,
  IconFileUpload,
  IconHandStop,
  IconKey,
  IconLock,
  IconMapPin,
  IconPhone,
} from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { ORDER_STATUS_LABEL, OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useIsAdmin } from '@/features/auth/auth-store';
import { useStaff } from '@/features/management/api';
import {
  openFile,
  useAdminOrder,
  useAssignOrder,
  useChangeStatus,
  useHandover,
  useQuoteOrder,
  useRecordPayment,
  useRefund,
  useSaveNote,
  useSendProof,
} from '@/features/orders/api';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { getErrorMessage, newIdempotencyKey } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { cn } from '@/lib/utils';
import { formatDate, formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import { ALL_STATUSES, ALLOWED_TRANSITIONS, isClosed, netPaid } from '@/lib/order-flow';
import type { AdminOrder } from '@/types/admin';
import type { OrderItem, OrderStatus, UploadedFile } from '@/types/api';

/** Asks first, runs the change, then shows the result in the same dialog. Resolves true on success. */
const ask = (
  title: string,
  description: string,
  confirmLabel: string,
  action: () => Promise<unknown>,
  successTitle: string,
  tone: 'default' | 'danger' = 'default',
) => confirmAction({ title, description, confirmLabel, action, successTitle, tone });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

function ProofUpload({ order, item }: { order: AdminOrder; item: OrderItem }) {
  const sendProof = useSendProof(order._id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase">Send proof for approval</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="sm:w-auto">
          <IconFileUpload /> {file ? file.name.slice(0, 24) : 'Choose image / PDF'}
        </Button>
        <input ref={inputRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to customer (optional)" className="h-8 text-sm" />
        <Button
          size="sm"
          disabled={!file || sendProof.isPending}
          onClick={() =>
            file &&
            void ask(
              'Send this proof to the customer?',
              `“${file.name}” is sent for approval${message ? ' with your message' : ''}. Printing waits until they approve it.`,
              'Send proof',
              () => sendProof.mutateAsync({ itemId: item._id, file, message: message || undefined }),
              'Proof sent to customer',
            ).then((ok) => {
              if (!ok) return;
              setFile(null);
              setMessage('');
            })
          }
        >
          {sendProof.isPending && <Spinner className="size-4 text-current" />} Send
        </Button>
      </div>
    </div>
  );
}

function ItemCard({ order, item }: { order: AdminOrder; item: OrderItem }) {
  const qty =
    item.unit === 'page'
      ? `${formatNumber(item.pageCount ?? 0)} pages × ${item.copies} ${unitLabel('copy', item.copies)} = ${formatNumber(item.units)} pages`
      : `${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)}`;
  const files = item.files.filter((f): f is UploadedFile => typeof f !== 'string');
  const showProofs = item.workflow === 'design' || item.proofs.length > 0;

  return (
    <div className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{en(item.productName)}</p>
          <p className="text-sm text-muted-foreground">{qty}</p>
          {item.options.length > 0 && (
            <p className="text-xs text-muted-foreground">{item.options.map((o) => `${en(o.label)}: ${en(o.valueLabel)}`).join(' · ')}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{formatINR(item.lineTotal)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatINR(item.unitPrice)}/{unitLabel(item.unit, 1)}
            {item.fixedFees > 0 && ` + ${formatINR(item.fixedFees)}`}
          </p>
        </div>
      </div>
      {item.notes && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">“{item.notes}”</p>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <Button
              key={f._id}
              variant="outline"
              size="sm"
              disabled={f.status === 'deleted'}
              onClick={() => void openFile(f._id).catch((e) => toast.error(getErrorMessage(e)))}
            >
              {f.sensitive ? <IconLock className="text-amber-600" /> : <IconDownload />}
              <span className="max-w-44 truncate">{f.originalName}</span>
              <span className="text-xs text-muted-foreground">
                {f.status === 'deleted' ? 'deleted' : `${formatFileSize(f.size)}${f.pageCount ? ` · ${f.pageCount}p` : ''}`}
              </span>
            </Button>
          ))}
        </div>
      )}
      {showProofs && (
        <div className="space-y-2">
          {item.proofs.map((p, i) => {
            const fileId = typeof p.file === 'string' ? p.file : p.file._id;
            return (
              <div key={p._id} className="flex flex-wrap items-center gap-2 text-sm">
                <button className="font-medium text-primary hover:underline" onClick={() => void openFile(fileId)}>
                  Proof {i + 1}
                </button>
                <Badge variant={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'destructive'}>
                  {p.status.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(p.createdAt, 'en', true)}</span>
                {p.customerComment && <span className="w-full text-xs text-muted-foreground">Customer: “{p.customerComment}”</span>}
              </div>
            );
          })}
          {!['cancelled', 'delivered', 'picked_up'].includes(order.status) && <ProofUpload order={order} item={item} />}
        </div>
      )}
    </div>
  );
}

function QuoteCard({ order }: { order: AdminOrder }) {
  const quote = useQuoteOrder(order._id);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i._id, i.lineTotal ? String(i.lineTotal) : ''])),
  );
  const valid = order.items.every((i) => Number(prices[i._id]) > 0);
  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader>
        <CardTitle>Set the price</CardTitle>
        <p className="text-sm text-muted-foreground">The customer pays after you confirm. They'll be notified.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {order.items.map((i) => (
          <div key={i._id} className="flex items-center gap-3">
            <Label className="flex-1">{en(i.productName)}</Label>
            <div className="relative w-36">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                min={0}
                className="pl-7"
                value={prices[i._id]}
                onChange={(e) => setPrices((p) => ({ ...p, [i._id]: e.target.value }))}
              />
            </div>
          </div>
        ))}
        <Button
          className="w-full"
          disabled={!valid || quote.isPending}
          onClick={() =>
            void ask(
              'Confirm this price?',
              `The order total becomes ${formatINR(order.items.reduce((s, i) => s + (Number(prices[i._id]) || 0), 0))} before delivery and tax, and the customer is asked to pay.`,
              'Confirm price',
              () => quote.mutateAsync({ items: order.items.map((i) => ({ itemId: i._id, lineTotal: Number(prices[i._id]) })) }),
              'Price confirmed and customer notified',
            )
          }
        >
          {quote.isPending && <Spinner className="size-4 text-current" />} Confirm price
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusCard({ order }: { order: AdminOrder }) {
  const change = useChangeStatus(order._id);
  const isAdmin = useIsAdmin();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [sendMsg, setSendMsg] = useState(true);
  const [override, setOverride] = useState(false);
  const [refund, setRefund] = useState(true);
  const closed = isClosed(order.status);
  const method = order.fulfilment.method;
  const paid = netPaid(order.payment);

  // Normal moves follow the shop's flow; the owner can unlock any other step with a reason.
  const allowed = ALLOWED_TRANSITIONS[order.status];
  const options = (override ? ALL_STATUSES : allowed).filter(
    (s) =>
      s !== order.status &&
      !(method === 'delivery' && s === 'picked_up') &&
      !(method === 'pickup' && (s === 'out_for_delivery' || s === 'delivered')),
  );
  const needsReason = override && status !== '' && !allowed.includes(status);
  const cancelling = status === 'cancelled';
  const canSubmit = status !== '' && !change.isPending && (!needsReason || note.trim().length >= 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update status</CardTitle>
        <CardDescription>
          {closed
            ? 'This order is closed.'
            : order.status === 'quote_pending'
              ? 'Set the price first. You can still cancel it here.'
              : order.status === 'awaiting_payment'
                ? 'Waiting for online payment. It moves to Received automatically once paid, or record a counter payment below.'
                : order.status === 'ready' && method === 'pickup'
                  ? 'Use Hand over when the customer collects it.'
                  : order.status === 'out_for_delivery'
                    ? 'The rider completes delivery with the customer’s code.'
                    : 'Move the order to its next step.'}
        </CardDescription>
      </CardHeader>
      {!closed && (
        <CardContent className="space-y-3">
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
            <SelectTrigger aria-label="New status">
              <SelectValue placeholder="Choose new status" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                  {override && !allowed.includes(s) ? ' (override)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={needsReason ? 'Reason for the override (required, saved in history)' : 'Note (included in the customer message)'}
            className="min-h-16"
            aria-invalid={needsReason && note.trim().length < 5}
          />
          <label className="flex items-center justify-between gap-3 text-sm">
            Send WhatsApp / SMS update
            <Switch checked={sendMsg} onCheckedChange={setSendMsg} />
          </label>
          {cancelling && paid > 0 && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <span>
                <span className="block font-medium">Refund {formatINR(paid)}</span>
                <span className="block text-xs text-muted-foreground">Online payments go back through Razorpay; cash is recorded as returned.</span>
              </span>
              <Switch checked={refund} onCheckedChange={setRefund} disabled={!isAdmin} />
            </label>
          )}
          {isAdmin && (
            <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              Override the normal flow (owner)
              <Switch checked={override} onCheckedChange={(v) => { setOverride(v); setStatus(''); }} />
            </label>
          )}
          <Button
            className="w-full"
            variant={cancelling ? 'destructive' : 'default'}
            disabled={!canSubmit}
            onClick={() =>
              status &&
              void ask(
                cancelling ? `Cancel order ${order.orderNumber}?` : `Mark as “${ORDER_STATUS_LABEL[status]}”?`,
                [
                  cancelling ? 'This cannot be undone.' : '',
                  cancelling && paid > 0 ? (refund && isAdmin ? `${formatINR(paid)} is refunded to the customer.` : `${formatINR(paid)} was paid and is NOT refunded now.`) : '',
                  sendMsg ? 'The customer gets a WhatsApp / SMS update.' : 'No message is sent to the customer.',
                ].filter(Boolean).join(' '),
                cancelling ? 'Cancel order' : 'Update status',
                () => change.mutateAsync({ status, note: note || undefined, notify: sendMsg, override: needsReason, refund: cancelling && refund && isAdmin }),
                `Marked as ${ORDER_STATUS_LABEL[status]}`,
                cancelling ? 'danger' : 'default',
              ).then((ok) => {
                if (!ok) return;
                setStatus('');
                setNote('');
                setOverride(false);
              })
            }
          >
            {change.isPending && <Spinner className="size-4 text-current" />} Update
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

/** Counter pickup: the customer's code, and any balance collected now. */
function HandoverCard({ order }: { order: AdminOrder }) {
  const handover = useHandover(order._id);
  const isAdmin = useIsAdmin();
  const due = Math.max(0, Math.round((order.totals.total - netPaid(order.payment)) * 100) / 100);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(due > 0 ? String(due) : '');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');
  const [overrideReason, setOverrideReason] = useState('');
  const [noCode, setNoCode] = useState(false);
  const key = useRef(newIdempotencyKey());
  const locked = (order.handover?.wrongAttempts ?? 0) >= 5;
  const collected = Number(amount) || 0;
  const credit = order.audience === 'institution';
  const settles = collected + 0.009 >= due || credit || (noCode && isAdmin);
  const ready = (noCode ? overrideReason.trim().length >= 5 : /^\d{4}$/.test(code)) && settles && !handover.isPending;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconHandStop className="size-5 text-primary" /> Hand over
        </CardTitle>
        <CardDescription>Ask the customer for the 4-digit pickup code sent to their phone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertDescription>Too many wrong codes. Only the owner can hand this over now.</AlertDescription>
          </Alert>
        )}
        {!noCode ? (
          <div className="space-y-1.5">
            <Label htmlFor="handover-code">Pickup code</Label>
            <Input
              id="handover-code"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
              value={code}
              disabled={locked}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="handover-reason">Why there is no code</Label>
            <Textarea id="handover-reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Customer's phone is off; checked their ID" className="min-h-16" />
          </div>
        )}
        {due > 0 && (
          <div className="space-y-1.5">
            <Label>Collect now {credit && <span className="font-normal text-muted-foreground">(institution: can be billed on account)</span>}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input type="number" min={0} max={due} className="pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <Select value={provider} onValueChange={(v) => setProvider(v as 'cash' | 'upi_counter')}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi_counter">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!settles && <p className="text-xs text-destructive">{formatINR(due)} is due. Collect the full amount before handing over.</p>}
          </div>
        )}
        {isAdmin && (
          <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            Hand over without the code (owner)
            <Switch checked={noCode} onCheckedChange={setNoCode} />
          </label>
        )}
        <Button
          className="w-full"
          size="lg"
          disabled={!ready || (locked && !noCode)}
          onClick={() =>
            void ask(
              `Hand over ${order.orderNumber}?`,
              `${collected > 0 ? `${formatINR(collected)} received by ${provider === 'cash' ? 'cash' : 'UPI'}. ` : ''}The order is marked as picked up and the customer is thanked by message.`,
              'Hand over',
              () =>
                handover.mutateAsync({
                  key: key.current,
                  code: noCode ? undefined : code,
                  overrideReason: noCode ? overrideReason : undefined,
                  amountCollected: due > 0 ? collected : 0,
                  provider,
                }),
              'Order handed over',
            )
          }
        >
          {handover.isPending ? <Spinner className="size-4 text-current" /> : <IconKey />} Verify code and hand over
        </Button>
      </CardContent>
    </Card>
  );
}

function AssignCard({ order }: { order: AdminOrder }) {
  const { data: staff } = useStaff();
  const assign = useAssignOrder(order._id);
  const staffers = staff?.filter((s) => s.isActive && s.role !== 'delivery') ?? [];
  const riders = staff?.filter((s) => s.isActive && s.role === 'delivery') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Handled by</Label>
          <Select
            value={order.assignedTo?._id ?? 'none'}
            onValueChange={(v) =>
              void ask(
                v === 'none' ? 'Unassign this order?' : `Assign to ${staffers.find((s) => s._id === v)?.name}?`,
                v === 'none' ? 'Nobody will be responsible for it until you assign someone.' : 'They will see it in their order list.',
                v === 'none' ? 'Unassign' : 'Assign',
                () => assign.mutateAsync({ assignedTo: v === 'none' ? null : v }),
                v === 'none' ? 'Unassigned' : 'Assigned',
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {staffers.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {order.fulfilment.method === 'delivery' && (
          <div className="space-y-1.5">
            <Label>Delivery person</Label>
            <Select
              value={order.deliveryPerson?._id ?? 'none'}
              onValueChange={(v) =>
                void ask(
                  v === 'none' ? 'Remove the delivery person?' : `Give this delivery to ${riders.find((s) => s._id === v)?.name}?`,
                  v === 'none' ? 'The order leaves their delivery list.' : 'It appears in their delivery list straight away.',
                  v === 'none' ? 'Remove' : 'Assign rider',
                  () => assign.mutateAsync({ deliveryPerson: v === 'none' ? null : v }),
                  v === 'none' ? 'Delivery person removed' : 'Delivery assigned',
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not assigned</SelectItem>
                {riders.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PROVIDER_LABEL = { razorpay: 'Online', cash: 'Cash', upi_counter: 'UPI (counter)' } as const;
const PAYMENT_STATE: Record<string, string> = {
  created: 'window opened',
  captured: 'received',
  failed: 'failed',
  refund_pending: 'refund in progress',
  refunded: 'refunded',
};

function RefundDialog({ order, max, onClose }: { order: AdminOrder; max: number; onClose: () => void }) {
  const refund = useRefund(order._id);
  const [amount, setAmount] = useState(String(max));
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'original' | 'cash'>('original');
  const key = useRef(newIdempotencyKey());
  const value = Number(amount) || 0;
  const hasOnline = order.payments.some((p) => p.provider === 'razorpay' && p.status === 'captured' && p.kind !== 'refund');
  const valid = value > 0 && value <= max + 0.009 && reason.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {order.orderNumber}</DialogTitle>
          <DialogDescription>Up to {formatINR(max)} can be refunded. The customer is told by WhatsApp / SMS.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Amount</Label>
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <Input id="refund-amount" type="number" min={0} max={max} className="pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          {hasOnline && (
            <div className="space-y-1.5">
              <Label>How</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as 'original' | 'cash')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">To the original payment (Razorpay, 5–7 days)</SelectItem>
                  <SelectItem value="cash">Cash handed back at the counter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Misprint on 2 cards" className="min-h-16" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!valid || refund.isPending}
            onClick={() =>
              void refund
                .mutateAsync({ key: key.current, amount: value, reason: reason.trim(), method })
                .then(() => {
                  toast.success(`${formatINR(value)} refund started`);
                  onClose();
                })
                .catch((e) => toast.error(getErrorMessage(e)))
            }
          >
            {refund.isPending ? <Spinner className="size-4 text-current" /> : <IconArrowBackUp />} Refund {formatINR(value)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentCard({ order }: { order: AdminOrder }) {
  const record = useRecordPayment(order._id);
  const isAdmin = useIsAdmin();
  const paid = netPaid(order.payment);
  const refunded = order.payment.amountRefunded ?? 0;
  const due = Math.max(0, Math.round((order.totals.total - paid) * 100) / 100);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');
  const [refunding, setRefunding] = useState(false);
  const key = useRef(newIdempotencyKey());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payment</CardTitle>
        <PaymentStatusBadge status={order.payment.status} />
      </CardHeader>
      <CardContent className="space-y-2">
        {order.status === 'awaiting_payment' && order.payment.dueBy && (
          <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs">
            <IconClockHour4 className="size-4 shrink-0" /> Cancelled automatically if unpaid by {formatDate(order.payment.dueBy, 'en', true)}
          </p>
        )}
        <Row label="Subtotal">{formatINR(order.totals.subtotal)}</Row>
        {order.totals.deliveryFee > 0 && <Row label="Delivery">{formatINR(order.totals.deliveryFee)}</Row>}
        {order.totals.tax > 0 && <Row label={`GST ${order.totals.taxRate}%`}>{formatINR(order.totals.tax)}</Row>}
        <Separator className="my-2" />
        <Row label="Total">{formatINR(order.totals.total)}</Row>
        <Row label="Paid">{formatINR(order.payment.amountPaid)}</Row>
        {refunded > 0 && <Row label="Refunded">−{formatINR(refunded)}</Row>}
        {due > 0 && order.status !== 'cancelled' && <Row label="Due">{<span className="text-destructive">{formatINR(due)}</span>}</Row>}

        {order.payments.length > 0 && (
          <ul className="space-y-1.5 border-t pt-2 text-xs">
            {order.payments.map((p) => (
              <li key={p._id} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  <span className={cn('font-medium', p.kind === 'refund' ? 'text-destructive' : 'text-foreground')}>
                    {p.kind === 'refund' ? 'Refund' : PROVIDER_LABEL[p.provider]}
                  </span>
                  {' · '}
                  {PAYMENT_STATE[p.status] ?? p.status} · {formatDate(p.createdAt, 'en', true)}
                  {p.note && <span className="block">“{p.note}”</span>}
                </span>
                <span className={cn('tabular-nums', p.kind === 'refund' && 'text-destructive')}>
                  {p.kind === 'refund' ? '−' : ''}
                  {formatINR(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {due > 0 && !['cancelled', 'quote_pending'].includes(order.status) && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Record counter payment</p>
            <div className="flex gap-2">
              <Input type="number" min={0} max={due} placeholder={String(due)} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
              <Select value={provider} onValueChange={(v) => setProvider(v as 'cash' | 'upi_counter')}>
                <SelectTrigger className="w-32" aria-label="Paid by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi_counter">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={record.isPending || (Number(amount) || due) > due + 0.009}
              onClick={() =>
                void ask(
                  `Record ${formatINR(Number(amount) || due)} received?`,
                  `Paid by ${provider === 'cash' ? 'cash' : 'UPI'} at the counter. This goes on the invoice and cannot be edited later.`,
                  'Record payment',
                  () => record.mutateAsync({ key: key.current, amount: Number(amount) || due, provider }),
                  'Payment recorded',
                ).then((ok) => {
                  // A new key only after success: a retry of a failed attempt is still recognised.
                  if (!ok) return;
                  key.current = newIdempotencyKey();
                  setAmount('');
                })
              }
            >
              <IconCash /> Record {formatINR(Number(amount) || due)}
            </Button>
          </div>
        )}

        {isAdmin && paid > 0 && (
          <Button variant="danger" className="w-full" onClick={() => setRefunding(true)}>
            <IconArrowBackUp /> Refund…
          </Button>
        )}
        {refunding && <RefundDialog order={order} max={paid} onClose={() => setRefunding(false)} />}
      </CardContent>
    </Card>
  );
}

function NoteCard({ order }: { order: AdminOrder }) {
  const save = useSaveNote(order._id);
  const [note, setNote] = useState(order.internalNote ?? '');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal note</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only staff can see this" />
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending || note === (order.internalNote ?? '')}
          onClick={() => void ask('Save this note?', 'Only staff can see internal notes.', 'Save note', () => save.mutateAsync(note), 'Note saved')}
        >
          Save note
        </Button>
      </CardContent>
    </Card>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order, isLoading, error, refetch } = useAdminOrder(id);

  if (isLoading) return <PageLoader />;
  if (error || !order) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return <OrderDetail order={order} />;
}

function OrderDetail({ order }: { order: AdminOrder }) {
  useBreadcrumbLabel(order.orderNumber);
  const address = order.fulfilment.address;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
            <Badge variant="outline">{order.audience === 'institution' ? 'Institution' : 'Individual'}</Badge>
            {order.source === 'walk_in' && <Badge variant="outline">Walk-in</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(order.createdAt, 'en', true)}</p>
        </div>
        {!['cancelled', 'quote_pending'].includes(order.status) && (
          <Button
            variant="outline"
            onClick={() =>
              void fetchFile(`/admin/orders/${order._id}/invoice`, { fallbackName: `${order.orderNumber}.pdf`, mode: 'open' }).catch((e) =>
                toast.error(getErrorMessage(e)),
              )
            }
          >
            <IconFileInvoice /> {order.invoice?.number ? `Invoice ${order.invoice.number}` : 'Invoice'}
          </Button>
        )}
      </div>

      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {order.status === 'quote_pending' && <QuoteCard order={order} />}
          <Card>
            <CardHeader>
              <CardTitle>Items ({order.items.length})</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {order.items.map((item) => (
                <ItemCard key={item._id} order={order} item={item} />
              ))}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="space-y-1.5 p-4 text-sm sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">Customer</p>
                <p className="font-semibold">{order.contact.name || '—'}</p>
                {order.contact.phone && (
                  <a href={`tel:+91${order.contact.phone}`} className="flex items-center gap-2 text-primary hover:underline">
                    <IconPhone className="size-4" /> +91 {order.contact.phone}
                  </a>
                )}
                {order.institution && (
                  <Link to={`/institutions/${order.institution._id}`} className="block text-primary hover:underline">
                    {order.institution.name}
                  </Link>
                )}
              </div>
              <div className="space-y-1.5 p-4 text-sm sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">{order.fulfilment.method === 'delivery' ? 'Delivery' : 'Pickup'}</p>
                <p className="flex items-start gap-2">
                  {order.fulfilment.method === 'delivery' ? (
                    <>
                      <IconMapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      {[address?.line1, address?.line2, address?.city, address?.state, address?.pincode].filter(Boolean).join(', ')}
                    </>
                  ) : (
                    <>
                      <IconBuildingStore className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> Pickup from shop
                    </>
                  )}
                </p>
                {order.deliveryPerson && <p className="text-muted-foreground">Rider: {order.deliveryPerson.name}</p>}
                {(order.deliveryAttempts ?? 0) > 0 && order.status !== 'delivered' && (
                  <p className="text-warning">{order.deliveryAttempts} failed delivery attempt{order.deliveryAttempts === 1 ? '' : 's'}</p>
                )}
                {order.handover?.verifiedAt && (
                  <p className="text-muted-foreground">
                    Handed over {formatDate(order.handover.verifiedAt, 'en', true)}
                    {order.handover.overrideReason ? ` without code: “${order.handover.overrideReason}”` : ' · code verified'}
                  </p>
                )}
              </div>
            </div>
            {order.customerNote && (
              <div className="border-t p-4 text-sm sm:p-5">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Customer note</p>
                <p>{order.customerNote}</p>
              </div>
            )}
          </Card>

          <div className="grid items-start gap-6 *:min-w-0 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-4 border-l pl-5">
                  {[...(order.statusHistory ?? [])].reverse().map((h, i) => (
                    <li key={i} className="relative text-sm">
                      <span className={cn('absolute top-1 -left-6.25 size-2.5 rounded-full ring-4 ring-card', i === 0 ? 'bg-primary' : 'bg-muted-foreground/40')} />
                      <p className="font-medium">{ORDER_STATUS_LABEL[h.status]}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(h.at, 'en', true)}</p>
                      {h.note && <p className="mt-0.5 text-xs text-muted-foreground">“{h.note}”</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <NoteCard order={order} />
          </div>
        </div>

        <div className="space-y-6">
          {order.status === 'ready' && order.fulfilment.method === 'pickup' && <HandoverCard order={order} />}
          <StatusCard order={order} />
          <PaymentCard order={order} />
          <AssignCard order={order} />
        </div>
      </div>
    </div>
  );
}
