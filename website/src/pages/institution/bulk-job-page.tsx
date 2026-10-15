import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconFileTypePdf,
  IconLoader2,
  IconRefresh,
  IconShoppingBag,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/features/auth/auth-store';
import { useQuote } from '@/features/catalog/api';
import { usePlaceBulkOrder, useBulkJob, type BulkIssue, type BulkStatus } from '@/features/institution/api';
import { usePublicSettings } from '@/features/settings/api';
import { openFile } from '@/features/uploads/upload-file';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STEPS: { key: string; done: BulkStatus[]; active: BulkStatus[] }[] = [
  { key: 'uploaded', done: ['validating', 'needs_fixes', 'generating', 'ready', 'ordered', 'failed'], active: ['queued'] },
  { key: 'checked', done: ['generating', 'ready', 'ordered'], active: ['validating'] },
  { key: 'sheet', done: ['ready', 'ordered'], active: ['generating'] },
  { key: 'ordered', done: ['ordered'], active: [] },
];

function IssueList({ items, tone }: { items: BulkIssue[]; tone: 'error' | 'warning' }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 12);
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 text-sm">
        {shown.map((issue, i) => (
          <li key={i} className="flex gap-3">
            <span className={cn('w-20 shrink-0 text-xs font-semibold tabular-nums', tone === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-warning')}>
              {issue.row ? t('bulk.row', { n: issue.row }) : t('bulk.file')}
            </span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
      {items.length > 12 && (
        <button className="text-sm font-medium text-primary hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? t('bulk.showLess') : t('bulk.showAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}

export default function BulkJobPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const l = useLocalized();
  const navigate = useNavigate();
  const institution = useAuthStore((s) => (s.principal?.kind === 'institution' ? s.principal.institution : null));
  const { data: job, isLoading, error, refetch } = useBulkJob(id);
  const { data: settings } = usePublicSettings();
  const place = usePlaceBulkOrder(id);
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'online' | 'counter'>('counter');
  useDocumentTitle(t('bulk.jobTitle'));

  const cards = job?.output?.cards ?? job?.report.rows ?? 0;
  const { data: quote } = useQuote(job?.product && job.status === 'ready' ? { productId: job.product._id, options: {}, quantity: cards } : null);

  if (isLoading) return <PageLoader />;
  if (error || !job) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const busy = ['queued', 'validating', 'generating'].includes(job.status);
  const errors = job.report.errors ?? [];
  const warnings = job.report.warnings ?? [];
  const columns = (job.report.columns ?? []).filter((c) => c !== 'photo');
  const canDeliver = settings?.delivery.enabled && institution?.address;

  const order = () =>
    place.mutate(
      {
        fulfilment: method === 'delivery' && institution ? { method, address: { ...institution.address, name: institution.contactName, phone: institution.phone } } : { method: 'pickup' },
        paymentMethod: payment,
      },
      {
        onSuccess: (o) => {
          toast.success(t('bulk.ordered'));
          navigate(`/account/orders/${o._id}`);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <div className="container-page max-w-5xl py-10">
      <Link to="/institution" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" /> {t('nav.dashboard')}
      </Link>
      <h1 className="text-3xl font-bold">{t('bulk.jobTitle')}</h1>
      <p className="mt-1 text-muted-foreground">
        {job.template?.name} · {t(`templates.kinds.${job.kind}`)} · {job.dataFile?.originalName}
      </p>

      {/* Progress */}
      <ol className="my-8 grid grid-cols-4 gap-2">
        {STEPS.map((s) => {
          const done = s.done.includes(job.status);
          const active = s.active.includes(job.status);
          return (
            <li key={s.key} className="space-y-2">
              <div className={cn('h-1.5 rounded-full', done ? 'bg-success' : active ? 'animate-pulse bg-primary' : 'bg-muted')} />
              <p className={cn('flex items-center gap-1 text-xs font-medium sm:text-sm', done ? 'text-foreground' : 'text-muted-foreground')}>
                {done ? <IconCheck className="size-4 text-success" /> : active ? <IconLoader2 className="size-4 animate-spin text-primary" /> : null}
                {t(`bulk.steps.${s.key}`)}
              </p>
            </li>
          );
        })}
      </ol>

      {busy && (
        <Alert variant="info" className="mb-6">
          <IconLoader2 className="animate-spin" />
          <AlertTitle>{t(`bulk.status.${job.status}`)}</AlertTitle>
          <AlertDescription>{t('bulk.busyHint')}</AlertDescription>
        </Alert>
      )}
      {job.status === 'failed' && (
        <Alert variant="destructive" className="mb-6">
          <IconAlertCircle />
          <AlertTitle>{t('bulk.status.failed')}</AlertTitle>
          <AlertDescription>{t('bulk.failedHint')}</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardContent>
            <p className="text-xs text-muted-foreground">{t('bulk.rows')}</p>
            <p className="text-2xl font-bold tabular-nums">{formatNumber(job.report.rows)}</p>
            <p className="text-xs text-muted-foreground">{t('bulk.validRows', { count: job.report.validRows })}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent>
            <p className="text-xs text-muted-foreground">{t('bulk.photos')}</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(job.report.photosMatched)}/{formatNumber(job.report.photosInZip)}
            </p>
            <p className="text-xs text-muted-foreground">{t('bulk.photosMatched')}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent>
            <p className="text-xs text-muted-foreground">{t('bulk.sheet')}</p>
            <p className="text-2xl font-bold tabular-nums">{job.output?.sheets ? `${job.output.sheets} × A4` : '—'}</p>
            {job.output?.file && (
              <button className="text-xs font-medium text-primary hover:underline" onClick={() => void openFile(job.output!.file!).catch((e) => toast.error(getErrorMessage(e)))}>
                <IconFileTypePdf className="mr-1 inline size-3.5" />
                {t('bulk.downloadSheet')}
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {errors.length > 0 && (
        <Card className="mb-6 border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconAlertCircle className="size-5 text-destructive" /> {t('bulk.errors', { count: errors.length })}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t('bulk.errorsHint')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <IssueList items={errors} tone="error" />
            <Button asChild>
              <Link to={`/institution/bulk/new?template=${job.template?._id ?? ''}`}>
                <IconRefresh /> {t('bulk.uploadFixed')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {warnings.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconAlertTriangle className="size-5 text-amber-600 dark:text-warning" /> {t('bulk.warnings', { count: warnings.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <IssueList items={warnings} tone="warning" />
          </CardContent>
        </Card>
      )}

      {job.status === 'ready' && (
        <Card className="mb-6 border-primary/40">
          <CardHeader>
            <CardTitle>{t('bulk.orderTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('bulk.orderHint')}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-baseline justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
              <span className="text-sm">
                {job.product ? l(job.product.name) : ''} × {formatNumber(cards)}
              </span>
              <span className="text-2xl font-bold tabular-nums">{quote?.valid ? formatINR(quote.subtotal) : '—'}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t('checkout.fulfilment')}</p>
                <RadioGroup value={method} onValueChange={(v) => setMethod(v as 'pickup' | 'delivery')}>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="pickup" /> {t('checkout.pickup')}
                  </label>
                  <label className={cn('flex items-center gap-2 text-sm', !canDeliver && 'opacity-50')}>
                    <RadioGroupItem value="delivery" disabled={!canDeliver} /> {t('checkout.delivery')}
                  </label>
                </RadioGroup>
                {method === 'delivery' && institution && (
                  <p className="text-xs text-muted-foreground">{[institution.address.line1, institution.address.city, institution.address.pincode].join(', ')}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t('checkout.payment')}</p>
                <RadioGroup value={payment} onValueChange={(v) => setPayment(v as 'online' | 'counter')}>
                  <label className={cn('flex items-center gap-2 text-sm', !settings?.payments.counterEnabled && 'opacity-50')}>
                    <RadioGroupItem value="counter" disabled={!settings?.payments.counterEnabled} /> {t('checkout.payCounter')}
                  </label>
                  <label className={cn('flex items-center gap-2 text-sm', !settings?.payments.onlineEnabled && 'opacity-50')}>
                    <RadioGroupItem value="online" disabled={!settings?.payments.onlineEnabled} /> {t('checkout.payOnline')}
                  </label>
                </RadioGroup>
              </div>
            </div>
            <Button size="lg" variant="brand" className="w-full" disabled={place.isPending} onClick={order}>
              {place.isPending ? <Spinner className="size-4 text-current" /> : <IconShoppingBag />} {t('bulk.placeOrder')}
            </Button>
          </CardContent>
        </Card>
      )}

      {job.order && (
        <Alert variant="success" className="mb-6">
          <IconCheck />
          <AlertTitle>{t('bulk.orderedAs', { number: job.order.orderNumber })}</AlertTitle>
          <AlertDescription>
            <Link to={`/account/orders/${job.order._id}`} className="font-semibold text-primary hover:underline">
              {t('bulk.viewOrder')} →
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {job.preview && job.preview.length > 0 && (
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle>{t('bulk.previewTitle', { count: job.preview.length })}</CardTitle>
            {(job.report.ignoredColumns?.length ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">{t('bulk.ignored', { columns: job.report.ignoredColumns!.join(', ') })}</p>
            )}
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">#</TableHead>
                {columns.map((c) => (
                  <TableHead key={c}>{t(`templates.fieldNames.${c}`, { defaultValue: c })}</TableHead>
                ))}
                <TableHead className="pr-5">{t('bulk.photo')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.preview.map((r) => (
                <TableRow key={r.row}>
                  <TableCell className="pl-5 text-muted-foreground tabular-nums">{r.row}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} className="max-w-48 truncate">
                      {r.data[c] ?? ''}
                    </TableCell>
                  ))}
                  <TableCell className="pr-5 text-xs text-muted-foreground">{r.photo ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
