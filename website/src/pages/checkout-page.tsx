import {
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCash,
  IconCreditCard,
  IconInfoCircle,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageNav } from '@/components/common/page-nav';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { authApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useCartStore } from '@/features/cart/cart-store';
import { CartLine } from '@/features/cart/components/cart-line';
import { OrderReview } from '@/features/cart/components/order-review';
import { useCartQuotes } from '@/features/cart/use-cart-quotes';
import { useCreateOrder } from '@/features/orders/api';
import { payWithRazorpay } from '@/features/orders/razorpay';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage, newIdempotencyKey } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Address } from '@/types/api';

function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-primary bg-primary/6 ring-2 ring-primary/20' : 'hover:border-primary/40',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', selected ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

const EMPTY_ADDRESS: Address = { line1: '', line2: '', city: '', state: 'Uttar Pradesh', pincode: '' };

export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('checkout.title'));
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  // One key per checkout: double taps and network retries can never create two orders.
  const checkoutKey = useRef(newIdempotencyKey());
  const { lines, subtotal, hasQuoteItems, invalid } = useCartQuotes(items);
  const { data: settings, isLoading } = usePublicSettings();
  const createOrder = useCreateOrder();

  const savedAddress =
    principal?.kind === 'institution' ? principal.institution.address : principal?.user.addresses?.[0];
  const needsName = principal?.kind === 'user' && !principal.user.name;
  // Customers who signed in by email may add a mobile number (optional) so the shop or rider can call.
  const needsPhone = principal?.kind === 'user' && !principal.user.phone;

  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'online' | 'counter' | null>(null);
  const [address, setAddress] = useState<Address>(savedAddress ?? EMPTY_ADDRESS);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [confirmed, setConfirmed] = useState(false);
  const goTo = (next: 'details' | 'review') => {
    setStep(next);
    setConfirmed(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading || !settings) return <PageLoader />;
  if (items.length === 0 && !createOrder.isSuccess) return <Navigate to="/cart" replace />;

  const onlineEnabled = settings.payments.onlineEnabled && !hasQuoteItems;
  const paymentMethod = payment ?? (onlineEnabled ? 'online' : 'counter');
  const deliveryFee =
    method === 'delivery' && subtotal < settings.delivery.freeAbove ? settings.delivery.fee : 0;
  const taxable = subtotal + deliveryFee;
  const taxAdded = settings.tax.enabled && !settings.tax.pricesIncludeTax ? (taxable * settings.tax.rate) / 100 : 0;
  const total = taxable + taxAdded;

  const addressValid =
    method === 'pickup' || (address.line1.trim().length >= 3 && address.city.trim() && /^\d{6}$/.test(address.pincode));
  const nameValid = !needsName || contactName.trim().length > 0;
  const cleanPhone = contactPhone.replace(/\D/g, '').slice(-10);
  const phoneValid = !needsPhone || !cleanPhone || /^[6-9]\d{9}$/.test(cleanPhone);
  const canReview = !invalid && addressValid && nameValid && phoneValid;
  const canSubmit = canReview && confirmed && !createOrder.isPending && !paying;
  const contact =
    principal?.kind === 'institution'
      ? { name: `${principal.institution.contactName} (${principal.institution.name})`, phone: principal.institution.phone, email: principal.institution.email }
      : { name: principal?.user.name || contactName, phone: principal?.user.phone || cleanPhone, email: principal?.user.email };

  const placeOrder = async () => {
    const ok = await confirmAction({
      title: t('confirm.placeOrderTitle'),
      description: hasQuoteItems
        ? t('confirm.placeOrderQuote')
        : t('confirm.placeOrderDesc', { total: formatINR(total), count: items.length, method: method === 'delivery' ? t('checkout.delivery') : t('checkout.pickup') }),
      confirmLabel: paymentMethod === 'online' ? t('checkout.placeAndPay', { amount: formatINR(total) }) : t('checkout.placeOrder'),
    });
    if (!ok) return;
    createOrder.mutate(
      {
        idempotencyKey: checkoutKey.current,
        items: items.map((i) => ({
          productId: i.productId,
          options: i.options,
          quantity: i.quantity,
          pageCount: i.pageCount,
          copies: i.copies,
          notes: i.notes,
          fileIds: i.files.map((f) => f.id),
        })),
        fulfilment: { method, ...(method === 'delivery' ? { address } : {}) },
        paymentMethod,
        customerNote: note.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: needsPhone && cleanPhone ? cleanPhone : undefined,
      },
      {
        onSuccess: async (order) => {
          clearCart();
          // The number was saved to the account; refresh it so the next checkout does not ask again.
          if (needsPhone && cleanPhone) void authApi.me().then(useAuthStore.getState().setPrincipal).catch(() => undefined);
          toast.success(t('checkout.success'), { description: t('toast.orderPlacedDesc', { number: order.orderNumber, total: formatINR(order.totals.total) }) });
          if (paymentMethod === 'online' && order.status !== 'quote_pending') {
            setPaying(true);
            try {
              const paid = await payWithRazorpay(order._id, i18n.language);
              if (paid) toast.success(t('checkout.paymentSuccess'), { description: t('toast.paymentSuccessDesc', { number: order.orderNumber }) });
              else toast.info(t('toast.paymentLaterTitle'), { description: t('checkout.paymentLater', { minutes: settings.payments.onlineTimeoutMinutes ?? 30 }) });
            } catch (e) {
              toast.error(getErrorMessage(e));
            } finally {
              setPaying(false);
            }
          }
          navigate(`/account/orders/${order._id}`, { replace: true });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  const setAddr = (key: keyof Address) => (e: { target: { value: string } }) =>
    setAddress((a) => ({ ...a, [key]: e.target.value }));

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('cart.title'), to: '/cart' }, { label: t('checkout.title') }]} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{step === 'review' ? t('checkout.reviewTitle') : t('checkout.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{step === 'review' ? t('checkout.reviewHint') : t('checkout.detailsHint')}</p>
        </div>
        <ol className="flex items-center gap-2 text-sm" aria-label={t('checkout.title')}>
          {(['details', 'review'] as const).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border" />}
              <button
                type="button"
                disabled={s === 'review' && !canReview}
                onClick={() => goTo(s)}
                aria-current={step === s ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium transition-colors disabled:opacity-50',
                  step === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('grid size-5 place-items-center rounded-full text-xs', step === s ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{i + 1}</span>
                {t(`checkout.steps.${s}`)}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        {step === 'review' ? (
          <OrderReview
            lines={lines}
            method={method}
            address={address}
            payment={paymentMethod}
            note={note}
            contact={contact}
            settings={settings}
            onEditItems={() => navigate('/cart')}
            onEditDetails={() => goTo('details')}
          />
        ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.fulfilment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                <ChoiceCard
                  selected={method === 'pickup'}
                  onSelect={() => setMethod('pickup')}
                  icon={<IconBuildingStore className="size-5" />}
                  title={t('checkout.pickup')}
                  description={t('checkout.pickupDesc')}
                />
                <ChoiceCard
                  selected={method === 'delivery'}
                  onSelect={() => setMethod('delivery')}
                  disabled={!settings.delivery.enabled}
                  icon={<IconTruckDelivery className="size-5" />}
                  title={t('checkout.delivery')}
                  description={
                    settings.delivery.enabled
                      ? t('checkout.deliveryDesc', { fee: settings.delivery.fee, free: settings.delivery.freeAbove })
                      : t('checkout.deliveryUnavailable')
                  }
                />
              </div>

              {method === 'delivery' && (
                <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <p className="font-semibold sm:col-span-2">{t('checkout.address')}</p>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="line1">{t('auth.line1')}</Label>
                    <Input id="line1" autoComplete="address-line1" value={address.line1} onChange={setAddr('line1')} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="line2">{t('auth.line2')}</Label>
                    <Input id="line2" autoComplete="address-line2" value={address.line2 ?? ''} onChange={setAddr('line2')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{t('auth.city')}</Label>
                    <Input id="city" autoComplete="address-level2" value={address.city} onChange={setAddr('city')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pincode">{t('auth.pincode')}</Label>
                    <Input id="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={address.pincode} onChange={setAddr('pincode')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">{t('auth.state')}</Label>
                    <Input id="state" autoComplete="address-level1" value={address.state} onChange={setAddr('state')} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.payment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasQuoteItems && (
                <Alert variant="info">
                  <IconInfoCircle />
                  <AlertDescription className="text-foreground">{t('checkout.quoteNotice')}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                <ChoiceCard
                  selected={paymentMethod === 'online'}
                  onSelect={() => setPayment('online')}
                  disabled={!onlineEnabled}
                  icon={<IconCreditCard className="size-5" />}
                  title={t('checkout.payOnline')}
                  description={t('checkout.payOnlineDesc')}
                />
                <ChoiceCard
                  selected={paymentMethod === 'counter'}
                  onSelect={() => setPayment('counter')}
                  disabled={!settings.payments.counterEnabled}
                  icon={<IconCash className="size-5" />}
                  title={t('checkout.payCounter')}
                  description={t('checkout.payCounterDesc')}
                />
              </div>
              {needsName && (
                <div className="space-y-2">
                  <Label htmlFor="contactName">{t('checkout.contactName')}</Label>
                  <Input id="contactName" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
              )}
              {needsPhone && (
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">
                    {t('checkout.contactPhone')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
                  </Label>
                  <PrefixedInput
                    id="contactPhone"
                    prefix="+91"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
                    aria-invalid={contactPhone.length > 0 && !phoneValid}
                  />
                  <p className="text-xs text-muted-foreground">{t('checkout.contactPhoneHint')}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="note">
                  {t('checkout.note')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
                </Label>
                <Textarea id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{t('cart.summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-72 divide-y overflow-y-auto">
                {lines.map(({ item, quote, amount }) => (
                  <CartLine key={item.id} item={item} quote={quote} amount={amount} compact />
                ))}
              </div>
              <Separator />
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
                  <dd className="tabular-nums">{formatINR(subtotal)}</dd>
                </div>
                {method === 'delivery' && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('checkout.deliveryFee')}</dt>
                    <dd className="tabular-nums">{deliveryFee ? formatINR(deliveryFee) : t('common.free')}</dd>
                  </div>
                )}
                {taxAdded > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('checkout.tax', { rate: settings.tax.rate })}</dt>
                    <dd className="tabular-nums">{formatINR(taxAdded)}</dd>
                  </div>
                )}
                <div className="flex items-end justify-between pt-2">
                  <dt className="font-semibold">
                    {t('checkout.total')}
                    {settings.tax.enabled && settings.tax.pricesIncludeTax && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({t('checkout.taxIncluded')})</span>
                    )}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums">{formatINR(total)}</dd>
                </div>
              </dl>
              {step === 'details' ? (
                <>
                  <Button size="lg" variant="brand" className="w-full" disabled={!canReview} onClick={() => goTo('review')}>
                    {t('checkout.reviewOrder')} <IconArrowRight />
                  </Button>
                  {!canReview && (
                    <p className="text-center text-sm text-destructive">
                      {invalid ? t('cart.invalid') : !nameValid ? t('checkout.needName') : !phoneValid ? t('checkout.needPhone') : t('checkout.needAddress')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label htmlFor="confirm" className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
                    <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                    {t('checkout.confirmCheck')}
                  </label>
                  <Button size="lg" variant="brand" className="w-full" disabled={!canSubmit} onClick={() => void placeOrder()}>
                    {(createOrder.isPending || paying) && <Spinner className="size-4 text-current" />}
                    {createOrder.isPending
                      ? t('checkout.placing')
                      : paymentMethod === 'online'
                        ? t('checkout.placeAndPay', { amount: formatINR(total) })
                        : t('checkout.placeOrder')}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {t('checkout.policyPrefix')}{' '}
                    <Link to="/terms" className="underline hover:text-foreground">{t('legal.terms.title')}</Link>
                    {' · '}
                    <Link to="/refund-policy" className="underline hover:text-foreground">{t('legal.refund.title')}</Link>
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => goTo('details')}>
                    <IconArrowLeft /> {t('checkout.backToDetails')}
                  </Button>
                </>
              )}
              <p className="text-center text-xs text-muted-foreground">{t('cart.estimatedNote')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
