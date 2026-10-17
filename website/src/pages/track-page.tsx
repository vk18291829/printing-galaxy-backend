import { IconPackage, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageNav } from '@/components/common/page-nav';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/features/auth/components/otp-input';
import { useAuthStore } from '@/features/auth/auth-store';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { LocalizedString, OrderStatus, PaymentStatus } from '@/types/api';

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
    <div className="container-page max-w-2xl py-10">
      <PageNav items={[{ label: t('track.title') }]} />
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('track.title')}</h1>
        <p className="text-base text-muted-foreground">{byEmail ? t('track.subtitleEmail') : t('track.subtitle')}</p>
      </header>

      {step !== 'done' && (
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
      )}

      {step === 'done' && order && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-xl">{order.orderNumber}</CardTitle>
            <CardDescription>{t('track.placed', { date: formatDate(order.createdAt, i18n.language, true) })}</CardDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.payment.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="divide-y rounded-lg border">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">{l(item.productName)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(item.unit === 'page' ? item.units : item.quantity)} {t(`units.${item.unit}`, { count: item.unit === 'page' ? item.units : item.quantity })}
                  </span>
                </li>
              ))}
              <li className="flex justify-between px-4 py-3 text-sm font-semibold">
                <span>{t('orders.total')}</span>
                <span className="tabular-nums">{formatINR(order.total)}</span>
              </li>
            </ul>

            <ol className="space-y-3 border-l-2 pl-5">
              {order.history.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-primary bg-background" />
                  <p className="text-sm font-semibold">{t(`status.order.${h.status}`)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.at, i18n.language, true)}</p>
                </li>
              ))}
            </ol>

            {!signedIn && (
              <Alert variant="info">
                <AlertDescription className="flex flex-col gap-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>{t('track.signInHint')}</span>
                  <Button asChild size="sm">
                    <Link to="/login">{t('track.signIn')}</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <Button variant="outline" onClick={restart}>
              <IconRefresh /> {t('track.another')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
