import {
  IconArrowLeft,
  IconCash,
  IconDownload,
  IconFileInvoice,
  IconFileUpload,
  IconLock,
  IconMapPin,
  IconPhone,
  IconBuildingStore,
} from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { ORDER_STATUS_LABEL, OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useStaff } from '@/features/management/api';
import {
  openFile,
  useAdminOrder,
  useAssignOrder,
  useChangeStatus,
  useQuoteOrder,
  useRecordPayment,
  useSaveNote,
  useSendProof,
} from '@/features/orders/api';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { formatDate, formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import type { AdminOrder } from '@/types/admin';
import type { OrderItem, OrderStatus, UploadedFile } from '@/types/api';

const NEXT_STATUSES: OrderStatus[] = [
  'received',
  'proof_sent',
  'approved',
  'printing',
  'ready',
  'out_for_delivery',
  'delivered',
  'picked_up',
  'cancelled',
];

const notify = (p: Promise<unknown>, success: string) =>
  p.then(() => toast.success(success)).catch((e) => toast.error(getErrorMessage(e)));

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
            void notify(sendProof.mutateAsync({ itemId: item._id, file, message: message || undefined }), 'Proof sent to customer').then(() => {
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
            void notify(
              quote.mutateAsync({ items: order.items.map((i) => ({ itemId: i._id, lineTotal: Number(prices[i._id]) })) }),
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
  const options = NEXT_STATUSES.filter(
    (s) =>
      s !== order.status &&
      !(order.fulfilment.method === 'delivery' && s === 'picked_up') &&
      !(order.fulfilment.method === 'pickup' && (s === 'out_for_delivery' || s === 'delivered')),
  );
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [sendMsg, setSendMsg] = useState(true);
  const closed = ['delivered', 'picked_up', 'cancelled'].includes(order.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {closed ? (
          <p className="text-sm text-muted-foreground">This order is closed.</p>
        ) : order.status === 'quote_pending' ? (
          <p className="text-sm text-muted-foreground">Set the price first. You can still cancel below.</p>
        ) : null}
        {!closed && (
          <>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose new status" />
              </SelectTrigger>
              <SelectContent>
                {options
                  .filter((s) => order.status !== 'quote_pending' || s === 'cancelled')
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (included in the customer message)" className="min-h-16" />
            <label className="flex items-center justify-between text-sm">
              Send WhatsApp / SMS update
              <Switch checked={sendMsg} onCheckedChange={setSendMsg} />
            </label>
            <Button
              className="w-full"
              variant={status === 'cancelled' ? 'destructive' : 'default'}
              disabled={!status || change.isPending}
              onClick={() =>
                status &&
                void notify(
                  change.mutateAsync({ status, note: note || undefined, notify: sendMsg }),
                  `Marked as ${ORDER_STATUS_LABEL[status]}`,
                ).then(() => {
                  setStatus('');
                  setNote('');
                })
              }
            >
              {change.isPending && <Spinner className="size-4 text-current" />} Update
            </Button>
          </>
        )}
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
            onValueChange={(v) => void notify(assign.mutateAsync({ assignedTo: v === 'none' ? null : v }), 'Assigned')}
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
              onValueChange={(v) => void notify(assign.mutateAsync({ deliveryPerson: v === 'none' ? null : v }), 'Delivery assigned')}
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

function PaymentCard({ order }: { order: AdminOrder }) {
  const record = useRecordPayment(order._id);
  const due = Math.max(0, order.totals.total - order.payment.amountPaid);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payment</CardTitle>
        <PaymentStatusBadge status={order.payment.status} />
      </CardHeader>
      <CardContent className="space-y-2">
        <Row label="Subtotal">{formatINR(order.totals.subtotal)}</Row>
        {order.totals.deliveryFee > 0 && <Row label="Delivery">{formatINR(order.totals.deliveryFee)}</Row>}
        {order.totals.tax > 0 && <Row label={`GST ${order.totals.taxRate}%`}>{formatINR(order.totals.tax)}</Row>}
        <Separator className="my-2" />
        <Row label="Total">{formatINR(order.totals.total)}</Row>
        <Row label="Paid">{formatINR(order.payment.amountPaid)}</Row>
        {due > 0 && <Row label="Due">{<span className="text-destructive">{formatINR(due)}</span>}</Row>}

        {order.payments.length > 0 && (
          <ul className="space-y-1 pt-2 text-xs text-muted-foreground">
            {order.payments.map((p) => (
              <li key={p._id} className="flex justify-between">
                <span>
                  {p.provider === 'razorpay' ? 'Online' : p.provider === 'cash' ? 'Cash' : 'UPI (counter)'} · {p.status} ·{' '}
                  {formatDate(p.createdAt, 'en', true)}
                </span>
                <span className="tabular-nums">{formatINR(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        {due > 0 && order.status !== 'cancelled' && order.status !== 'quote_pending' && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Record counter payment</p>
            <div className="flex gap-2">
              <Input type="number" min={0} max={due} placeholder={String(due)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Select value={provider} onValueChange={(v) => setProvider(v as 'cash' | 'upi_counter')}>
                <SelectTrigger className="w-32">
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
              disabled={record.isPending}
              onClick={() =>
                void notify(record.mutateAsync({ amount: Number(amount) || due, provider }), 'Payment recorded').then(() => setAmount(''))
              }
            >
              <IconCash /> Record {formatINR(Number(amount) || due)}
            </Button>
          </div>
        )}
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
          onClick={() => void notify(save.mutateAsync(note), 'Note saved')}
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

  const address = order.fulfilment.address;

  return (
    <div className="space-y-6">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" /> Orders
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold">{order.orderNumber}</h1>
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

      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1fr_360px]">
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

          {order.customerNote && (
            <Card>
              <CardHeader>
                <CardTitle>Customer note</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{order.customerNote}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4">
                {[...(order.statusHistory ?? [])].reverse().map((h, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="font-medium">{ORDER_STATUS_LABEL[h.status]}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.at, 'en', true)}</p>
                    {h.note && <p className="text-xs text-muted-foreground">“{h.note}”</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
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
              <Separator className="my-2" />
              <p className="flex items-start gap-2">
                {order.fulfilment.method === 'delivery' ? (
                  <>
                    <IconMapPin className="mt-0.5 size-4 shrink-0" />
                    {[address?.line1, address?.line2, address?.city, address?.state, address?.pincode].filter(Boolean).join(', ')}
                  </>
                ) : (
                  <>
                    <IconBuildingStore className="mt-0.5 size-4 shrink-0" /> Pickup from shop
                  </>
                )}
              </p>
            </CardContent>
          </Card>
          <StatusCard order={order} />
          <PaymentCard order={order} />
          <AssignCard order={order} />
          <NoteCard order={order} />
        </div>
      </div>
    </div>
  );
}
