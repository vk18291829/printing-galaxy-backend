import { IconBuildingStore, IconPackage, IconRefresh, IconSearch, IconTruckDelivery } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageBanner } from '@/components/common/page-banner';
import { PageNav } from '@/components/common/page-nav';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/features/auth/components/otp-input';
import { useAuthStore } from '@/features/auth/auth-store';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { OrderTracking } from '@/features/orders/components/order-progress';
import type { LocalizedString, Order, OrderStatus, PaymentStatus } from '@/types/api';

interface TrackedOrder {
  orderNumber: string;
  status: OrderStatus;
  fulfilment: 'pickup' | 'delivery';
  total: number;
  payment: { status: PaymentStatus; method: 'online' | 'counter' };
  items: { productName: LocalizedString; quantity: number; units: number; unit: string }[];
  history: { status: OrderStatus; at: string }[];
  createdAt: string;
}

/** What the shared tracking steps read, from the smaller tracked-order reply. */
function asOrder(o: TrackedOrder): Order {
  const proof = o.history.some((h) => h.status === 'proof_sent' || h.status === 'approved');
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    fulfilment: { method: o.fulfilment },
    statusHistory: o.history,
    items: [{ workflow: proof ? 'design' : 'standard', proofs: [] }],
  } as unknown as Order;
}

/** Order status without an account: order number + email (or phone on the SMS channel), confirmed with a code. */
export default function TrackPage() {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  useDocumentTitle(t('track.title'));
  const signedIn = Boolean(useAuthStore((s) => s.principal));
  const [orderNumber, setOrderNumber] = useState('');
  const byEmail = usePublicSettings().data?.messaging !== 'sms';
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [step, setStep] = useState<'lookup' | 'code' | 'done'>('lookup');

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const lookup = {
    orderNumber: orderNumber.trim().toUpperCase(),
    ...(byEmail ? { email: cleanEmail } : { phone: cleanPhone }),
  };
  const request = useMutation({
    mutationFn: async () => (await api.post<{ sent: boolean; devCode?: string }>('/track/request', { ...lookup, lang: i18n.language })).data,
    onSuccess: (data) => {
      setDevCode(data.devCode);
      setStep('code');
    },
  });
  const verify = useMutation({
    mutationFn: async () => (await api.post<TrackedOrder>('/track/verify', { ...lookup, code })).data,
    onSuccess: () => setStep('done'),
  });
  const order = verify.data;
  const contactValid = byEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) : /^[6-9]\d{9}$/.test(cleanPhone);
  const lookupValid = /^PG\d{6}-[A-Z0-9]{4}$/.test(lookup.orderNumber) && contactValid;

  const restart = () => {
    setStep('lookup');
    setCode('');
    verify.reset();
    request.reset();
  };

  return (
    <div className="container-page py-8 sm:py-10">
      <PageNav items={[{ label: t('track.title') }]} />
      <PageBanner className="mb-6" icon={<IconTruckDelivery />} title={t('track.title')} description={byEmail ? t('track.subtitleEmail') : t('track.subtitle')} />

      {step !== 'done' && (
        <div className="grid items-start gap-6 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardContent className="pt-6">
            {step === 'lookup' ? (
              <form
                className="space-y-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (lookupValid) request.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="order">{t('track.orderNumber')}</Label>
                  <Input id="order" autoFocus className="h-11 font-mono uppercase" placeholder="PG261017-AB12" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                  <p className="text-xs text-muted-foreground">{t('track.orderNumberHint')}</p>
                </div>
                {byEmail ? (
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('track.email')}</Label>
                    <Input id="email" type="email" inputMode="email" autoComplete="email" className="h-11" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('track.phone')}</Label>
                    <PrefixedInput id="phone" prefix="+91" inputMode="numeric" autoComplete="tel-national" className="h-11" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                )}
                {request.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>{getErrorMessage(request.error)}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" size="lg" variant="brand" className="w-full" disabled={!lookupValid || request.isPending}>
                  {request.isPending ? <Spinner className="size-4 text-current" /> : <IconSearch />}
                  {t('track.sendCode')}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  verify.mutate();
                }}
              >
                <Alert variant="info">
                  <AlertDescription className="text-foreground">{byEmail ? t('track.codeSentEmail', { email: cleanEmail }) : t('track.codeSent', { phone: cleanPhone })}</AlertDescription>
                </Alert>
                {devCode && <p className="text-center text-xs text-muted-foreground">{t('auth.devCode', { code: devCode })}</p>}
                <div className="space-y-2">
                  <Label>{t('track.code')}</Label>
                  <OtpInput value={code} onChange={setCode} />
                </div>
                {verify.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>{getErrorMessage(verify.error)}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" size="lg" variant="brand" className="flex-1" disabled={code.length !== 6 || verify.isPending}>
                    {verify.isPending ? <Spinner className="size-4 text-current" /> : <IconPackage />}
                    {t('track.verify')}
                  </Button>
                  <Button type="button" size="lg" variant="outline" onClick={restart}>
                    {t('auth.changeNumber')}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* How it works, so first-time visitors know what the code is for. */}
        <aside className="rounded-2xl border bg-card p-5 sm:p-6">
          <p className="mb-4 font-semibold">{t('track.howTitle')}</p>
          <ol className="space-y-4">
            {(['how1', 'how2', 'how3'] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums',
                    (step === 'lookup' ? 0 : 1) === i ? 'bg-brand-amber text-brand-navy' : (step === 'lookup' ? 0 : 1) > i ? 'bg-brand-navy text-white' : 'bg-secondary text-primary',
                  )}
                >
                  {i + 1}
                </span>
                <p className="pt-1 text-sm text-foreground/80">{t(`track.${k}`)}</p>
              </li>
            ))}
          </ol>
        </aside>
        </div>
      )}

      {step === 'done' && order && (
        // Phones: order, then progress, then the rest. Wide screens: progress in its own column.
        <div className="grid items-start gap-6 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section className="rounded-2xl border bg-card lg:col-start-1">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-primary/70 uppercase">{t('orders.order')}</p>
                  <p className="font-mono text-2xl font-bold text-brand-navy">{order.orderNumber}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t('track.placed', { date: formatDate(order.createdAt, i18n.language, true) })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <OrderStatusBadge status={order.status} />
                  <PaymentStatusBadge status={order.payment.status} />
                </div>
              </div>
              <ul className="divide-y">
                {order.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                      <IconPackage className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{l(item.productName)}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {formatNumber(item.unit === 'page' ? item.units : item.quantity)} {t(`units.${item.unit}`, { count: item.unit === 'page' ? item.units : item.quantity })}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-3 border-t bg-muted/30 p-5 sm:grid-cols-2 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary ring-1 ring-border">
                    {order.fulfilment === 'delivery' ? <IconTruckDelivery className="size-5" /> : <IconBuildingStore className="size-5" />}
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('orders.fulfilment')}</p>
                    <p className="font-semibold">{order.fulfilment === 'delivery' ? t('checkout.delivery') : t('checkout.pickup')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-navy px-4 py-3 text-white sm:justify-self-end sm:min-w-56">
                  <span className="text-sm text-white/75">{t('orders.total')}</span>
                  <span className="text-xl font-bold tabular-nums">{formatINR(order.total)}</span>
                </div>
              </div>
            </section>

          <section className="rounded-2xl border bg-card p-5 sm:p-6 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <p className="mb-4 font-semibold">{t('orders.timeline')}</p>
            <OrderTracking order={asOrder(order)} />
          </section>

          <div className="space-y-6 lg:col-start-1">
            {!signedIn && (
              <div className="flex flex-col gap-3 rounded-2xl border border-brand-amber/50 bg-brand-amber/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <span className="text-sm">{t('track.signInHint')}</span>
                <Button asChild size="sm" variant="brand">
                  <Link to="/login">{t('track.signIn')}</Link>
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={restart}>
              <IconRefresh /> {t('track.another')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
