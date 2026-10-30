import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconBrandWhatsapp,
  IconBuildingStore,
  IconCamera,
  IconCash,
  IconClockHour4,
  IconDownload,
  IconEye,
  IconFile,
  IconFileInvoice,
  IconFileTypePdf,
  IconFileUpload,
  IconHandStop,
  IconKey,
  IconLock,
  IconMail,
  IconMapPin,
  IconMessage,
  IconPhone,
  IconPhoto,
  IconPhotoCheck,
  IconProgressCheck,
  IconSend,
  IconUpload,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import { useCan, useIsAdmin } from '@/features/auth/auth-store';
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
  useSetDueDate,
  useAddItemFiles,
} from '@/features/orders/api';
import { deleteUpload, FileUploader, type LineFile } from '@/features/uploads/file-uploader';
import { OrderTracking } from '@/features/orders/order-tracking';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { ProofViewer } from '@/features/orders/proof-viewer';
import { getErrorMessage, newIdempotencyKey } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { cn } from '@/lib/utils';
import { formatDate, formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import { ALLOWED_TRANSITIONS, awaitingProofApproval, isClosed, netPaid, OVERRIDE_STATUSES } from '@/lib/order-flow';
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

/** A picked file shown before it goes anywhere: the image itself, or the PDF in a frame. */
function LocalPreview({ file, url, className }: { file: File; url: string; className?: string }) {
  if (file.type.startsWith('image/')) {
    return <img src={url} alt={file.name} className={cn('mx-auto max-h-full w-auto object-contain', className)} />;
  }
  if (file.type === 'application/pdf') {
    return <iframe src={`${url}#view=FitH&toolbar=0`} title={file.name} className={cn('size-full bg-white', className)} />;
  }
  return <p className="p-4 text-sm">{file.name}</p>;
}

function ProofUpload({ order, item }: { order: AdminOrder; item: OrderItem }) {
  const sendProof = useSendProof(order._id);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast.error('Proofs must be under 25 MB');
    setFile(f);
  };
  const clear = () => {
    setFile(null);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };
  const send = () =>
    file &&
    sendProof.mutate(
      { itemId: item._id, file, message: message.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Proof sent', { description: `${order.contact.name || 'The customer'} has been asked to approve it.` });
          setConfirming(false);
          clear();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  const version = item.proofs.length + 1;

  return (
    // Highlighted on purpose: nothing with a design is printed until the customer approves a proof.
    <div id={`proof-${item._id}`} className="scroll-mt-20 space-y-4 rounded-2xl border-2 border-brand-amber bg-brand-amber/8 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-amber text-brand-navy">
          <IconPhotoCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy dark:text-foreground">
            Send proof {version > 1 ? `${version} ` : ''}for approval
          </p>
          <ol className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <li>1. Upload the design</li>
            <li aria-hidden>→</li>
            <li>2. Customer approves</li>
            <li aria-hidden>→</li>
            <li>3. Printing starts</li>
          </ol>
        </div>
      </div>
      <input ref={inputRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => pick(e.target.files?.[0])} />
      {/* Phones: photograph a printed sample straight from the camera. */}
      <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />

      {!file || !url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => inputRef.current?.click()}>
            <IconFileUpload /> Choose image / PDF
          </Button>
          <Button variant="outline" onClick={() => cameraRef.current?.click()} className="bg-card sm:hidden">
            <IconCamera /> Take photo
          </Button>
        </div>
      ) : (
        <>
          {/* Preview first, so a wrong file is caught before the customer sees it. */}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="relative grid h-44 place-items-center overflow-hidden rounded-xl bg-card ring-1 ring-brand-amber/40"
              aria-label="Preview proof"
            >
              <LocalPreview file={file} url={url} className="pointer-events-none" />
            </button>
            <div className="min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.type === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(file.size)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={clear}>
                  <IconX /> Change
                </Button>
              </div>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to the customer (optional), e.g. Please check the spelling of the school name" className="min-h-16 bg-card text-sm" maxLength={500} />
              <Button className="w-full sm:w-auto" onClick={() => setConfirming(true)}>
                <IconEye /> Preview & send
              </Button>
            </div>
          </div>

          <Dialog open={confirming} onOpenChange={(o) => !sendProof.isPending && setConfirming(o)}>
            <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Send this proof?</DialogTitle>
                <DialogDescription>
                  Proof {version} for <span className="font-semibold text-foreground">{en(item.productName)}</span> goes to{' '}
                  <span className="font-semibold text-foreground">{order.contact.name || 'the customer'}</span>
                  {order.contact.email ? ` (${order.contact.email})` : order.contact.phone ? ` (+91 ${order.contact.phone})` : ''}. Printing waits until they approve it.
                </DialogDescription>
              </DialogHeader>
              <div className="h-[55dvh] overflow-hidden rounded-xl shadow-card bg-muted">
                <LocalPreview file={file} url={url} />
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Message</p>
                <p className={cn(!message.trim() && 'text-muted-foreground italic')}>{message.trim() || 'No message: the customer sees “Please check the design carefully before approving.”'}</p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={sendProof.isPending}>
                  Back
                </Button>
                <Button onClick={send} disabled={sendProof.isPending}>
                  {sendProof.isPending ? <Spinner className="size-4 text-current" /> : <IconSend />} Send proof
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** The customer's file arriving after the order was entered: upload it, then attach it to the item. */
function AddItemFiles({ order, item }: { order: AdminOrder; item: OrderItem }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<LineFile[]>([]);
  const add = useAddItemFiles(order._id);

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        <IconUpload /> Add customer files
      </Button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <FileUploader productId={item.product} accepted={['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'ppt', 'pptx', 'zip']} files={files} onChange={setFiles} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={files.length === 0 || add.isPending}
          onClick={() =>
            add.mutate(
              { itemId: item._id, fileIds: files.map((f) => f.id) },
              {
                onSuccess: () => {
                  toast.success(`${files.length} file${files.length > 1 ? 's' : ''} added`);
                  setFiles([]);
                  setOpen(false);
                },
                onError: (e) => toast.error(getErrorMessage(e)),
              },
            )
          }
        >
          {add.isPending && <Spinner className="size-4 text-current" />} Attach to this item
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            files.forEach((f) => void deleteUpload(f.id));
            setFiles([]);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ItemCard({ order, item, index }: { order: AdminOrder; item: OrderItem; index: number }) {
  const qty =
    item.unit === 'page'
      ? `${formatNumber(item.pageCount ?? 0)} pages × ${item.copies} ${unitLabel('copy', item.copies)}`
      : `${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)}`;
  const files = item.files.filter((f): f is UploadedFile => typeof f !== 'string');
  const showProofs = item.workflow === 'design' || item.proofs.length > 0;

  // Everything that decides what gets printed, as one grid: how many first, then each option.
  const specs: { label: string; value: string; strong?: boolean }[] = [
    ...(item.unit === 'page'
      ? [
          { label: 'Pages per copy', value: formatNumber(item.pageCount ?? 0), strong: true },
          { label: 'Copies', value: formatNumber(item.copies), strong: true },
          { label: 'Total pages', value: formatNumber(item.units), strong: true },
        ]
      : [
          { label: 'Quantity', value: `${formatNumber(item.quantity)} ${unitLabel(item.unit, item.quantity)}`, strong: true },
          ...(item.copies > 1 ? [{ label: 'Copies', value: formatNumber(item.copies), strong: true }] : []),
        ]),
    ...(item.customSize ? [{ label: 'Custom size', value: `${item.customSize.width} × ${item.customSize.height} ${item.customSize.unit}` }] : []),
    ...item.options.map((o) => ({ label: en(o.label), value: en(o.valueLabel) })),
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-navy text-sm font-bold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-semibold">{en(item.productName)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground tabular-nums">{qty}</span>
            {item.workflow === 'design' && <Badge variant="info">Design proof</Badge>}
            {item.workflow === 'quote' && <Badge variant="warning">Priced on quote</Badge>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">{formatINR(item.lineTotal)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatINR(item.unitPrice)} / {unitLabel(item.unit, 1)}
            {item.fixedFees > 0 && ` + ${formatINR(item.fixedFees)}`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
        {specs.map((spec) => (
          <div
            key={spec.label}
            className={cn('min-w-0 rounded-xl px-3 py-2.5', spec.strong ? 'bg-secondary ring-1 ring-primary/20' : 'bg-muted/60')}
          >
            <dt className="truncate text-xs text-muted-foreground">{spec.label}</dt>
            <dd className={cn('truncate font-semibold tabular-nums', spec.strong && 'text-brand-navy dark:text-foreground')}>{spec.value}</dd>
          </div>
        ))}
      </dl>

      {item.notes && (
        <div className="flex gap-2.5 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2.5 text-sm">
          <IconMessage className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Customer instructions</p>
            <p className="mt-0.5">{item.notes}</p>
          </div>
        </div>
      )}

      {(files.length > 0 || !['cancelled', 'delivered', 'picked_up'].includes(order.status)) && (
        <Section title={files.length ? `Files (${files.length})` : 'Files'}>
          {files.length === 0 && <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">No file yet.</p>}
          <ul className="grid gap-2 md:grid-cols-2">
            {files.map((f) => {
              const deleted = f.status === 'deleted';
              const pdf = f.mimeType === 'application/pdf';
              const image = f.mimeType.startsWith('image/');
              const FileIcon = f.sensitive ? IconLock : pdf ? IconFileTypePdf : image ? IconPhoto : IconFile;
              return (
                <li key={f._id} className={cn('flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3', deleted && 'opacity-60')}>
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5',
                      f.sensitive ? 'bg-brand-amber/20 text-amber-700' : 'bg-secondary text-primary',
                    )}
                  >
                    <FileIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={f.originalName}>
                      {f.originalName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {deleted
                        ? 'Deleted after the order was completed'
                        : [pdf ? 'PDF' : image ? 'Image' : f.originalName.split('.').pop()?.toUpperCase(), formatFileSize(f.size), f.pageCount ? `${f.pageCount} ${f.pageCount === 1 ? 'page' : 'pages'}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                      {f.sensitive && !deleted && ' · ID document'}
                    </p>
                  </div>
                  {!deleted && (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => void openFile(f._id).catch((e) => toast.error(getErrorMessage(e)))}>
                      <IconDownload /> Open
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {!['cancelled', 'delivered', 'picked_up'].includes(order.status) && <AddItemFiles order={order} item={item} />}
        </Section>
      )}

      {showProofs && (
        <Section title={item.proofs.length ? `Proofs (${item.proofs.length})` : 'Proof'}>
          {item.proofs.length > 0 && <ProofList proofs={item.proofs} />}
          {!['cancelled', 'delivered', 'picked_up'].includes(order.status) && <ProofUpload order={order} item={item} />}
        </Section>
      )}
    </div>
  );
}

/** Proof versions; the latest opens inline so staff see exactly what the customer is reviewing. */
function ProofList({ proofs }: { proofs: OrderItem['proofs'] }) {
  const [open, setOpen] = useState<string | null>(proofs.at(-1)?._id ?? null);
  return (
    <ul className="divide-y rounded-lg shadow-card">
      {proofs.map((p, i) => {
        const file = typeof p.file === 'string' ? null : (p.file as UploadedFile);
        const expanded = open === p._id;
        return (
          <li key={p._id} className="space-y-1 p-2.5 text-sm">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(expanded ? null : p._id)} aria-expanded={expanded}>
              <span className="font-medium">Proof {i + 1}</span>
              <Badge variant={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'destructive'}>{p.status.replace('_', ' ')}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(p.createdAt, 'en', true)}</span>
              <span className="ml-auto text-xs text-primary">{expanded ? 'Hide' : 'Preview'}</span>
            </button>
            {p.customerComment && <p className="text-xs text-muted-foreground">Customer: “{p.customerComment}”</p>}
            {expanded && file && <ProofViewer file={file} className="pt-1" />}
          </li>
        );
      })}
    </ul>
  );
}

function QuoteCard({ order }: { order: AdminOrder }) {
  const quote = useQuoteOrder(order._id);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i._id, i.lineTotal ? String(i.lineTotal) : ''])),
  );
  const valid = order.items.every((i) => Number(prices[i._id]) > 0);
  // A requested quote goes back to the customer to accept; other quote items move straight on.
  const requested = Boolean(order.quote?.requested);
  const resend = order.status === 'quote_sent';
  return (
    <Card id="quote" className="scroll-mt-20 border-warning/50 bg-warning/5">
      <CardHeader>
        <CardTitle>{requested ? (resend ? 'Quote sent' : 'Send a quote') : 'Set the price'}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {resend
            ? `Waiting for the customer to accept${order.quote?.validUntil ? ` (valid until ${formatDate(order.quote.validUntil, 'en')})` : ''}. You can revise the price and send it again.`
            : requested
              ? 'The customer asked for a quote. They accept it before work starts. List prices are filled in as a starting point.'
              : "The customer pays after you confirm. They'll be notified."}
        </p>
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
              requested ? 'Send this quote?' : 'Confirm this price?',
              `The order total becomes ${formatINR(order.items.reduce((s, i) => s + (Number(prices[i._id]) || 0), 0))} before delivery and tax, and the customer is ${requested ? 'asked to accept it' : 'asked to pay'}.`,
              requested ? 'Send quote' : 'Confirm price',
              () => quote.mutateAsync({ items: order.items.map((i) => ({ itemId: i._id, lineTotal: Number(prices[i._id]) })) }),
              requested ? 'Quote sent to the customer' : 'Price confirmed and customer notified',
            )
          }
        >
          {quote.isPending && <Spinner className="size-4 text-current" />} {requested ? (resend ? 'Send revised quote' : 'Send quote') : 'Confirm price'}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The promised ready-by date; changing it needs a reason, kept in the audit log. */
function DueCard({ order }: { order: AdminOrder }) {
  const setDue = useSetDueDate(order._id);
  const current = order.dueDate ? order.dueDate.slice(0, 10) : '';
  const [date, setDate] = useState(current);
  const [note, setNote] = useState('');
  if (isClosed(order.status)) return null;
  const late = order.dueDate && new Date(order.dueDate) < new Date(new Date().toDateString()) && !['ready', 'out_for_delivery'].includes(order.status);
  const changed = date && date !== current;
  return (
    <Card className={cn(late && 'border-destructive/50')}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Ready by
          {late && <Badge variant="destructive">Overdue</Badge>}
        </CardTitle>
        <CardDescription>{order.dueDate ? `Promised for ${formatDate(order.dueDate, 'en')}. The customer sees this date.` : 'No date set yet.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Ready by date" />
        {changed && (
          <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (e.g. paper delayed)" maxLength={300} />
            <Button
              className="w-full"
              disabled={setDue.isPending}
              onClick={() =>
                setDue.mutate(
                  { dueDate: date, note: note.trim() || undefined },
                  { onSuccess: () => { setNote(''); toast.success('Ready-by date updated'); }, onError: (e) => toast.error(getErrorMessage(e)) },
                )
              }
            >
              {setDue.isPending && <Spinner className="size-4 text-current" />} Save date
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** What each next step means, shown on its choice card. */
const STATUS_HINT: Partial<Record<OrderStatus, string>> = {
  received: 'Reopen the order',
  printing: 'Work has started on the machine',
  ready: 'Packed and ready for pickup or the rider',
  cancelled: 'Stop the order; the customer is told',
};

/** Why the order can't move on by hand right now, or what to do instead. */
function statusHelp(order: AdminOrder, proofPending: boolean) {
  const method = order.fulfilment.method;
  if (isClosed(order.status)) return 'This order is closed.';
  if (order.status === 'quote_pending') return 'Set the price first. You can still cancel it here.';
  if (order.status === 'quote_sent') return 'Waiting for the customer to accept the quote. You can still cancel it here.';
  if (order.status === 'awaiting_payment') return 'Waiting for online payment. It moves to Received once paid, or record a counter payment.';
  if (order.status === 'proof_sent') return 'Waiting for the customer to approve the proof. It moves to Approved by itself.';
  if (proofPending) return 'Send a proof from the item. Printing unlocks once the customer approves it.';
  if (order.status === 'ready' && method === 'pickup') return 'Use Hand over when the customer collects it.';
  if (order.status === 'ready') return 'The rider starts the delivery; it moves to Out for delivery by itself.';
  if (order.status === 'out_for_delivery') return 'The rider completes delivery with the customer’s code.';
  return 'Choose the next step.';
}

/** Change the status in a dialog: pick the step, add a note, decide who is told. */
function StatusDialog({ order, open, onOpenChange }: { order: AdminOrder; open: boolean; onOpenChange: (open: boolean) => void }) {
  const change = useChangeStatus(order._id);
  const isAdmin = useIsAdmin();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [sendMsg, setSendMsg] = useState(true);
  const [override, setOverride] = useState(false);
  const [refund, setRefund] = useState(true);
  const method = order.fulfilment.method;
  const paid = netPaid(order.payment);

  // Normal moves follow the shop's flow; the owner can unlock the others with a reason.
  // Personalised items wait for the customer's proof approval before printing.
  const proofPending = order.status === 'received' && awaitingProofApproval(order);
  const allowed = ALLOWED_TRANSITIONS[order.status].filter((s) => !(proofPending && s === 'printing'));
  const options = (override ? OVERRIDE_STATUSES : allowed).filter(
    (s) =>
      s !== order.status &&
      !(method === 'delivery' && s === 'picked_up') &&
      !(method === 'pickup' && (s === 'out_for_delivery' || s === 'delivered')),
  );
  const needsReason = override && status !== '' && !allowed.includes(status);
  const cancelling = status === 'cancelled';
  const canSubmit = status !== '' && !change.isPending && (!needsReason || note.trim().length >= 5);

  const reset = () => {
    setStatus('');
    setNote('');
    setOverride(false);
  };
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = () =>
    status &&
    change.mutate(
      { status, note: note || undefined, notify: sendMsg, override: needsReason, refund: cancelling && refund && isAdmin },
      {
        onSuccess: () => {
          toast.success(cancelling ? `Order ${order.orderNumber} cancelled` : `Marked as ${ORDER_STATUS_LABEL[status]}`, {
            description: sendMsg ? 'The customer has been told.' : 'No message was sent.',
          });
          close(false);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update status</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-semibold text-foreground">{order.orderNumber}</span> is now <OrderStatusBadge status={order.status} />
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{statusHelp(order, proofPending)}</p>

        {options.length > 0 ? (
          <div className="grid gap-2" role="radiogroup" aria-label="New status">
            {options.map((s) => {
              const on = status === s;
              const danger = s === 'cancelled';
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl shadow-card p-3 text-left transition-colors',
                    on ? (danger ? 'border-destructive bg-destructive/5 ring-2 ring-destructive/20' : 'border-primary bg-primary/5 ring-2 ring-primary/20') : 'hover:bg-accent/60',
                  )}
                >
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', on ? (danger ? 'border-destructive' : 'border-primary') : 'border-muted-foreground/40')}>
                    {on && <span className={cn('size-2.5 rounded-full', danger ? 'bg-destructive' : 'bg-primary')} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-semibold', danger && 'text-destructive')}>
                      {ORDER_STATUS_LABEL[s]}
                      {override && !allowed.includes(s) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(override)</span>}
                    </span>
                    {STATUS_HINT[s] && <span className="block text-xs text-muted-foreground">{STATUS_HINT[s]}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No manual step is available right now.</p>
        )}

        {status && (
          <div className="space-y-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={needsReason ? 'Reason for the override (required, saved in history)' : 'Note for the customer (optional)'}
              className="min-h-16"
              aria-invalid={needsReason && note.trim().length < 5}
            />
            <label className="flex items-center justify-between gap-3 rounded-lg shadow-card p-3 text-sm">
              <span>
                <span className="block font-medium">Notify the customer</span>
                <span className="block text-xs text-muted-foreground">Email or SMS with the new status{note ? ' and your note' : ''}.</span>
              </span>
              <Switch checked={sendMsg} onCheckedChange={setSendMsg} />
            </label>
            {cancelling && paid > 0 && (
              <label className="flex items-center justify-between gap-3 rounded-lg shadow-card border-warning/40 bg-warning/10 p-3 text-sm">
                <span>
                  <span className="block font-medium">Refund {formatINR(paid)}</span>
                  <span className="block text-xs text-muted-foreground">Online payments go back through Razorpay; cash is recorded as returned.</span>
                </span>
                <Switch checked={refund} onCheckedChange={setRefund} disabled={!isAdmin} />
              </label>
            )}
          </div>
        )}

        {isAdmin && !isClosed(order.status) && (
          <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            Override the normal flow (owner)
            <Switch checked={override} onCheckedChange={(v) => { setOverride(v); setStatus(''); }} />
          </label>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            Close
          </Button>
          <Button variant={cancelling ? 'destructive' : 'default'} disabled={!canSubmit} onClick={submit}>
            {change.isPending && <Spinner className="size-4 text-current" />}
            {cancelling ? 'Cancel order' : status ? `Mark as ${ORDER_STATUS_LABEL[status]}` : 'Choose a step'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
    <Card id="handover" className="scroll-mt-20 border-primary/40">
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
    <Card id="assign" className="scroll-mt-20">
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
          <DialogDescription>Up to {formatINR(max)} can be refunded. The customer is notified.</DialogDescription>
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
  const isAdmin = useCan('refunds');
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

/**
 * Phones: the one next step for this order, pinned above the tab bar so it is always in reach.
 * Steps that need more input (price, proof file, handover code) scroll to their card.
 */
function NextActionBar({ order, onUpdate }: { order: AdminOrder; onUpdate: () => void }) {
  const change = useChangeStatus(order._id);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const move = (status: OrderStatus, label: string) =>
    void ask(`${label}?`, `${order.orderNumber} moves to “${ORDER_STATUS_LABEL[status]}” and the customer is told.`, label, () => change.mutateAsync({ status }), `Marked ${ORDER_STATUS_LABEL[status].toLowerCase()}`);
  const waitingProof = order.items.find((i) => i.workflow === 'design' && i.proofs.at(-1)?.status !== 'approved' && i.proofs.at(-1)?.status !== 'pending');

  let action: { label: string; run: () => void } | null = null;
  if (order.status === 'quote_pending') action = { label: order.quote?.requested ? 'Send quote' : 'Set the price', run: () => go('quote') };
  else if (order.status === 'received' && waitingProof) action = { label: 'Send proof', run: () => go(`proof-${waitingProof._id}`) };
  else if (order.status === 'received' && !awaitingProofApproval(order)) action = { label: 'Start printing', run: () => move('printing', 'Start printing') };
  else if (order.status === 'approved') action = { label: 'Start printing', run: () => move('printing', 'Start printing') };
  else if (order.status === 'printing') action = { label: 'Mark ready', run: () => move('ready', 'Mark ready') };
  else if (order.status === 'ready' && order.fulfilment.method === 'pickup') action = { label: 'Hand over', run: () => go('handover') };
  else if (order.status === 'ready' && !order.deliveryPerson) action = { label: 'Assign rider', run: () => go('assign') };
  if (!action && !isClosed(order.status)) action = { label: 'Update status', run: onUpdate };
  if (!action) return null;

  // The bar is rendered on <body> so it always sits just above the tab bar, whatever the page
  // wrapper does; the spacer keeps the last card on the page clear of it.
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      {createPortal(
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-card/95 px-4 py-2.5 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-semibold">{order.orderNumber}</p>
              <OrderStatusBadge status={order.status} />
            </div>
            <Button className="shrink-0" onClick={action.run} disabled={change.isPending}>
              {change.isPending && <Spinner className="size-4 text-current" />} {action.label}
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const SEGMENT_LABEL = { individual: 'Individual', institution: 'School & College', business: 'Business', wedding: 'Wedding' } as const;

/** The main road an order travels, for the progress strip in the summary. */
function stagesOf(order: AdminOrder): { key: string; label: string; reached: OrderStatus[] }[] {
  const proof = order.items.some((i) => i.workflow === 'design' || i.proofs.length > 0);
  const delivery = order.fulfilment.method === 'delivery';
  return [
    { key: 'received', label: 'Received', reached: ['received', 'proof_sent', 'approved', 'printing', 'ready', 'out_for_delivery', 'delivered', 'picked_up'] },
    ...(proof ? [{ key: 'proof', label: 'Proof approved', reached: ['approved', 'printing', 'ready', 'out_for_delivery', 'delivered', 'picked_up'] as OrderStatus[] }] : []),
    { key: 'printing', label: 'Printing', reached: ['printing', 'ready', 'out_for_delivery', 'delivered', 'picked_up'] },
    { key: 'ready', label: delivery ? 'Packed' : 'Ready', reached: ['ready', 'out_for_delivery', 'delivered', 'picked_up'] },
    { key: 'done', label: delivery ? 'Delivered' : 'Picked up', reached: ['delivered', 'picked_up'] },
  ];
}

function Fact({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: 'danger' | 'success'; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-card px-3.5 py-3 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('truncate text-base font-bold tabular-nums', tone === 'danger' && 'text-destructive', tone === 'success' && 'text-success')}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function OrderSummary({ order, onUpdate }: { order: AdminOrder; onUpdate: () => void }) {
  const paid = netPaid(order.payment);
  const due = Math.max(0, Math.round((order.totals.total - paid) * 100) / 100);
  const stages = stagesOf(order);
  const cancelled = order.status === 'cancelled';
  const late = order.dueDate && !isClosed(order.status) && !['ready', 'out_for_delivery'].includes(order.status) && new Date(order.dueDate) < new Date(new Date().toDateString());

  return (
    <section className="light-band rounded-3xl">
      <div className="space-y-6 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-primary/70 uppercase">Order</p>
            <h1 className="font-mono text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl dark:text-foreground">{order.orderNumber}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <OrderStatusBadge status={order.status} />
              <Badge variant="soft">{SEGMENT_LABEL[order.segment ?? (order.audience === 'institution' ? 'institution' : 'individual')]}</Badge>
              <Badge variant="outline">{order.source === 'walk_in' ? 'Walk-in' : 'Online'}</Badge>
              <span className="text-sm text-muted-foreground">Placed {formatDate(order.createdAt, 'en', true)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isClosed(order.status) && (
              <Button onClick={onUpdate}>
                <IconProgressCheck /> Update status
              </Button>
            )}
            {!['cancelled', 'quote_pending', 'quote_sent'].includes(order.status) && (
              <Button
                variant="outline"
                className="bg-card"
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
        </div>

        {!cancelled && !['quote_pending', 'quote_sent', 'awaiting_payment'].includes(order.status) && (
          <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="Progress">
            {stages.map((st) => {
              const done = st.reached.includes(order.status);
              return (
                <li key={st.key} className="min-w-0">
                  <span className={cn('block h-1.5 rounded-full', done ? 'bg-brand-amber' : 'bg-primary/12')} />
                  <span className={cn('mt-1.5 block truncate text-[11px] font-medium sm:text-xs', done ? 'text-foreground' : 'text-muted-foreground')}>{st.label}</span>
                </li>
              );
            })}
          </ol>
        )}
        {cancelled && order.cancelReason && (
          <p className="rounded-xl bg-destructive/8 px-3 py-2 text-sm text-destructive">Cancelled: {order.cancelReason}</p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Total" value={formatINR(order.totals.total)} sub={`${order.items.length} item${order.items.length === 1 ? '' : 's'}`} />
          <Fact label="Paid" value={formatINR(paid)} tone={paid > 0 ? 'success' : undefined} sub={order.payment.method === 'online' ? 'Online' : 'Counter / account'} />
          <Fact label="Due" value={formatINR(due)} tone={due > 0 && !cancelled ? 'danger' : undefined} />
          <Fact
            label="Ready by"
            value={order.dueDate ? formatDate(order.dueDate, 'en') : '—'}
            tone={late ? 'danger' : undefined}
            sub={late ? 'Overdue' : undefined}
          />
          <Fact
            label={order.fulfilment.method === 'delivery' ? 'Delivery' : 'Pickup'}
            value={order.fulfilment.method === 'delivery' ? order.fulfilment.address?.city || 'Delivery' : 'At the shop'}
            sub={order.deliveryPerson ? `Rider: ${order.deliveryPerson.name}` : order.assignedTo ? `Staff: ${order.assignedTo.name}` : undefined}
          />
        </div>
      </div>
    </section>
  );
}

function CustomerCard({ order }: { order: AdminOrder }) {
  const address = order.fulfilment.address;
  const phone = order.contact.phone;
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-navy text-base font-bold text-white">
          {order.contact.name?.trim() ? order.contact.name.trim().charAt(0).toUpperCase() : <IconUser className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Customer</p>
          <p className={cn('truncate text-lg font-semibold', !order.contact.name?.trim() && 'text-muted-foreground')}>{order.contact.name?.trim() || 'No name given'}</p>
          {order.institution && (
            <Link to={`/institutions/${order.institution._id}`} className="text-sm font-medium text-primary hover:underline">
              {order.institution.name}
            </Link>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {phone && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:+91${phone}`}>
                    <IconPhone /> +91 {phone}
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/91${phone}?text=${encodeURIComponent(`Hi, about your order ${order.orderNumber}`)}`} target="_blank" rel="noopener noreferrer">
                    <IconBrandWhatsapp className="text-[#25D366]" /> WhatsApp
                  </a>
                </Button>
              </>
            )}
            {order.contact.email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${order.contact.email}?subject=${encodeURIComponent(`Order ${order.orderNumber}`)}`}>
                  <IconMail /> <span className="max-w-44 truncate">{order.contact.email}</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="flex gap-3 p-4 text-sm sm:p-5">
          {order.fulfilment.method === 'delivery' ? <IconMapPin className="mt-0.5 size-5 shrink-0 text-primary" /> : <IconBuildingStore className="mt-0.5 size-5 shrink-0 text-primary" />}
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{order.fulfilment.method === 'delivery' ? 'Deliver to' : 'Pickup from shop'}</p>
            {order.fulfilment.method === 'delivery' && (
              <p className="text-muted-foreground">{[address?.line1, address?.line2, address?.city, address?.state, address?.pincode].filter(Boolean).join(', ')}</p>
            )}
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
        <div className="space-y-3 p-4 text-sm sm:p-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Reference / PO</p>
            <p className="font-mono font-medium">{order.reference || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Payment method</p>
            <p className="font-medium">{order.payment.method === 'online' ? 'Pay online' : order.audience === 'institution' ? 'Institution account' : 'Pay at counter'}</p>
          </div>
        </div>
      </div>

      {order.customerNote && (
        <div className="flex gap-2.5 border-t bg-primary/5 p-4 text-sm sm:p-5">
          <IconMessage className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Note from the customer</p>
            <p className="mt-0.5">{order.customerNote}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function OrderDetail({ order }: { order: AdminOrder }) {
  useBreadcrumbLabel(order.orderNumber);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <div className="space-y-6">
      <OrderSummary order={order} onUpdate={() => setStatusOpen(true)} />

      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {(order.status === 'quote_pending' || order.status === 'quote_sent') && <QuoteCard order={order} />}
          {order.status === 'ready' && order.fulfilment.method === 'pickup' && <HandoverCard order={order} />}

          <section className="overflow-hidden rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6">
              <h2 className="text-base font-semibold">Items</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
                {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="divide-y">
              {order.items.map((item, i) => (
                <ItemCard key={item._id} order={order} item={item} index={i} />
              ))}
            </div>
          </section>

          <CustomerCard order={order} />

          <OrderTracking order={order} />
        </div>

        <div className="space-y-6">
          <DueCard key={order.dueDate ?? 'none'} order={order} />
          <PaymentCard order={order} />
          <AssignCard order={order} />
          <NoteCard order={order} />
        </div>
      </div>
      {/* Keeps the last card clear of the pinned action bar (phones only; tablets have the rail, not the tab bar). */}
      <div className="h-14 md:hidden" />
      <NextActionBar order={order} onUpdate={() => setStatusOpen(true)} />
      <StatusDialog order={order} open={statusOpen} onOpenChange={setStatusOpen} />
    </div>
  );
}
