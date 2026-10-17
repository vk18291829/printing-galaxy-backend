import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconClockHour4,
  IconDatabase,
  IconMessageCircle,
  IconRefresh,
  IconWebhook,
  type Icon,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMessageLog, useMoneyLog, useRetryMessage, useSystemOverview, useWebhookLog } from '@/features/system/api';
import { getErrorMessage } from '@/lib/api-client';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Stat({ icon: Icon, label, value, tone = 'default', hint }: { icon: Icon; label: string; value: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; hint?: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            tone === 'good' && 'bg-success/10 text-success',
            tone === 'bad' && 'bg-destructive/10 text-destructive',
            tone === 'warn' && 'bg-warning/15 text-amber-700 dark:text-warning',
            tone === 'default' && 'bg-muted text-foreground',
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'info'> = {
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'destructive',
  processed: 'success',
  ignored: 'secondary',
  duplicate: 'secondary',
  captured: 'success',
  created: 'secondary',
  refunded: 'info',
  refund_pending: 'warning',
};

const OrderLink = ({ order }: { order?: { _id: string; orderNumber: string } }) =>
  order ? (
    <Link to={`/orders/${order._id}`} className="font-mono text-xs text-primary hover:underline">
      {order.orderNumber}
    </Link>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );

function Loading() {
  return (
    <div className="grid h-48 place-items-center">
      <Spinner />
    </div>
  );
}

function MessagesTab() {
  const [page, setPage] = useState(1);
  const [failedOnly, setFailedOnly] = useState(true);
  const { data, isLoading, error, refetch } = useMessageLog({ page, status: failedOnly ? 'failed' : undefined });
  const retry = useRetryMessage();

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-sm text-muted-foreground">WhatsApp and SMS messages sent to customers and the shop.</p>
        <Button variant="outline" size="sm" onClick={() => { setFailedOnly((v) => !v); setPage(1); }}>
          {failedOnly ? 'Show all' : 'Failed only'}
        </Button>
      </div>
      {isLoading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">When</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="hidden md:table-cell">Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="pl-5 align-top text-sm whitespace-nowrap text-muted-foreground">{formatDate(m.createdAt, 'en', true)}</TableCell>
                  <TableCell className="max-w-md align-top">
                    <p className="text-sm">
                      <span className="font-medium">{m.template.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground"> · {m.channel} · {m.to.replace(/^(\d{2})\d+(\d{4})$/, '$1****$2')}</span>
                    </p>
                    {m.body && <p className="line-clamp-2 text-xs text-muted-foreground">{m.body}</p>}
                    {m.error && <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{m.error}</p>}
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <OrderLink order={m.relatedOrder} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'secondary'}>{m.status}</Badge>
                    {m.fallbackSent && <p className="mt-1 text-xs text-muted-foreground">SMS sent instead</p>}
                  </TableCell>
                  <TableCell className="pr-5 text-right align-top">
                    {m.status === 'failed' && m.template !== 'otp' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retry.isPending}
                        onClick={() =>
                          retry.mutate(m._id, {
                            onSuccess: () => toast.success('Message sent again'),
                            onError: (e) => toast.error(getErrorMessage(e)),
                          })
                        }
                      >
                        <IconRefresh /> Retry{m.retries ? ` (${m.retries})` : ''}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon={<IconCircleCheck />} title={failedOnly ? 'No failed messages' : 'No messages yet'} description="Every customer message is listed here with its delivery status." />
      )}
    </Card>
  );
}

function WebhooksTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useWebhookLog(page);
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <Card className="gap-0 py-0">
      <p className="border-b px-5 py-3 text-sm text-muted-foreground">Events received from Razorpay and WhatsApp. Repeats of the same event are recognised and skipped.</p>
      {isLoading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="hidden md:table-cell">Order</TableHead>
                <TableHead className="pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((w) => (
                <TableRow key={w._id}>
                  <TableCell className="pl-5 text-sm whitespace-nowrap text-muted-foreground">{formatDate(w.createdAt, 'en', true)}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {w.event} <span className="font-normal text-muted-foreground">· {w.provider}</span>
                    </p>
                    {w.summary && <p className="text-xs text-muted-foreground">{w.summary}</p>}
                    {w.error && <p className="text-xs text-destructive">{w.error}</p>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <OrderLink order={w.relatedOrder} />
                  </TableCell>
                  <TableCell className="pr-5">
                    <Badge variant={STATUS_VARIANT[w.status] ?? 'secondary'}>{w.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon={<IconWebhook />} title="No webhooks yet" description="Razorpay events appear here once the webhook URL is set in the Razorpay dashboard." />
      )}
    </Card>
  );
}

const PROVIDER = { razorpay: 'Online', cash: 'Cash', upi_counter: 'UPI (counter)' } as const;

function MoneyTab() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<'all' | 'payment' | 'refund'>('all');
  const { data, isLoading, error, refetch } = useMoneyLog({ page, kind: kind === 'all' ? undefined : kind });
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-sm text-muted-foreground">Every payment and refund, newest first.</p>
        <div className="flex gap-1.5">
          {(['all', 'payment', 'refund'] as const).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => { setKind(k); setPage(1); }}>
              {k === 'all' ? 'All' : k === 'payment' ? 'Payments' : 'Refunds'}
            </Button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">When</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="pl-5 text-sm whitespace-nowrap text-muted-foreground">{formatDate(p.createdAt, 'en', true)}</TableCell>
                  <TableCell>
                    <OrderLink order={p.order} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.kind === 'refund' ? <span className="font-medium text-destructive">Refund</span> : PROVIDER[p.provider]}
                    {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{p.recordedBy?.name ?? (p.provider === 'razorpay' ? 'Razorpay' : '—')}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className={cn('pr-5 text-right font-medium tabular-nums', p.kind === 'refund' && 'text-destructive')}>
                    {p.kind === 'refund' ? '−' : ''}
                    {formatINR(p.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon={<IconArrowBackUp />} title="Nothing here yet" />
      )}
    </Card>
  );
}

/** Health, failed messages (with retry), webhooks and money movements in one place. */
export default function SystemPage() {
  const { data, error, refetch } = useSystemOverview();
  const [tab, setTab] = useState<'messages' | 'webhooks' | 'money'>('messages');

  return (
    <div className="space-y-6">
      <PageHeader title="System activity" description="Is everything working? Failed messages, payment events and the server's health." />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={IconDatabase}
              label="Server"
              value={data.health.db === 'up' ? 'Healthy' : 'Database down'}
              tone={data.health.db === 'up' ? 'good' : 'bad'}
              hint={`Up ${uptime(data.health.uptimeSeconds)} · ${data.health.memoryMb} MB · jobs ${data.health.queue}`}
            />
            <Stat icon={IconMessageCircle} label="Failed messages (24h)" value={data.counts.failedMessages} tone={data.counts.failedMessages ? 'bad' : 'good'} />
            <Stat icon={IconClockHour4} label="Awaiting online payment" value={data.counts.awaitingPayment} tone={data.counts.awaitingPayment ? 'warn' : 'default'} hint={data.counts.staleWindows ? `${data.counts.staleWindows} payment windows being re-checked` : undefined} />
            <Stat icon={IconWebhook} label="Failed webhooks (24h)" value={data.counts.failedWebhooks} tone={data.counts.failedWebhooks ? 'bad' : 'good'} hint={data.counts.pendingRefunds ? `${data.counts.pendingRefunds} refunds in progress` : undefined} />
          </div>

          {(data.readiness.errors.length > 0 || data.readiness.warnings.length > 0) && (
            <Alert variant={data.readiness.errors.length ? 'destructive' : 'warning'}>
              <IconAlertTriangle />
              <AlertTitle>{data.readiness.production ? 'Setup needs attention' : 'Development mode: setup checks for going live'}</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
                  {[...data.readiness.errors, ...data.readiness.warnings].map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <Loading />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="money">Payments & refunds</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'messages' && <MessagesTab />}
      {tab === 'money' && <MoneyTab />}
      {tab === 'webhooks' && <WebhooksTab />}
    </div>
  );
}
