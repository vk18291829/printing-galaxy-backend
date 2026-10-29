import {
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCash,
  IconCreditCard,
  IconInfoCircle,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
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
import { useReorderStore } from '@/features/cart/reorder-store';
import { FileUploader } from '@/features/uploads/file-uploader';
import { useLocalized } from '@/lib/i18n';
import { CartLine } from '@/features/cart/components/cart-line';
import { OrderReview } from '@/features/cart/components/order-review';
import { useCartQuotes } from '@/features/cart/use-cart-quotes';
import { useCreateOrder } from '@/features/orders/api';
import { payWithRazorpay } from '@/features/orders/razorpay';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
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
        'flex items-start gap-3 rounded-xl shadow-card p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
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

/** Files the earlier order's items take again; the server checks each against the product. */
const REORDER_FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'ppt', 'pptx'];

/** Short, stable fingerprint (FNV-1a) of the checkout details, for the checkout key. */
function shortHash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const EMPTY_ADDRESS: Address = { line1: '', line2: '', city: '', state: 'Uttar Pradesh', pincode: '' };

export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  useDocumentTitle(t('checkout.title'));
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);
  const cartItems = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  // "Order again" checks out the earlier order's items on their own; the cart is not touched.
  const [params] = useSearchParams();
  const reorder = useReorderStore();
  const isReorder = params.get('from') === 'reorder' && reorder.items.length > 0;
  const items = isReorder ? reorder.items : cartItems;
  const clearItems = isReorder ? reorder.clear : clearCart;
  // Kept with the items (see cart-store): double taps, retries and coming back later never create a second order.
  const cartKey = useCartStore((s) => s.checkoutKey);
  const itemsKey = isReorder ? reorder.checkoutKey : cartKey;
  const filesMissing = isReorder ? reorder.items.filter((i) => reorder.needsFiles.includes(i.id) && i.files.length === 0) : [];
  const { lines, subtotal, hasQuoteItems, invalid } = useCartQuotes(items);
  const { data: settings, isLoading } = usePublicSettings({ fresh: true });
  const createOrder = useCreateOrder();

  const savedAddress =
    principal?.kind === 'institution' ? principal.institution.address : principal?.user.addresses?.[0];
  const needsName = principal?.kind === 'user' && !principal.user.name;
  // Customers who signed in by email must add a mobile number so the shop or rider can call.
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
  if (items.length === 0 && !createOrder.isSuccess) return <Navigate to={params.get('from') === 'reorder' ? '/account/orders' : '/cart'} replace />;

  // Approved institutions are invoiced on account, so paying at the shop always stays open to them.
  const counterAllowed = settings.payments.counterEnabled || principal?.kind === 'institution';
  const onlineAllowed = settings.payments.onlineEnabled;
  // Items priced on request are paid after the shop confirms the price: at the shop when that is
  // offered, otherwise online from the order page.
  const paymentMethod: 'online' | 'counter' = hasQuoteItems
    ? counterAllowed ? 'counter' : 'online'
    : payment && (payment === 'online' ? onlineAllowed : counterAllowed)
      ? payment
      : onlineAllowed ? 'online' : 'counter';
  /** Paid now, in the Razorpay window, before the order is placed. */
  const payNow = paymentMethod === 'online' && !hasQuoteItems;
  const noPaymentMethod = !hasQuoteItems && !onlineAllowed && !counterAllowed;
  const deliveryFee =
    method === 'delivery' && subtotal < settings.delivery.freeAbove ? settings.delivery.fee : 0;
  const taxable = subtotal + deliveryFee;
  const taxAdded = settings.tax.enabled && !settings.tax.pricesIncludeTax ? (taxable * settings.tax.rate) / 100 : 0;
  const total = taxable + taxAdded;
  // GST already inside the prices, shown so the customer sees it (same formula as the invoice).
  const taxIncludedAmount =
    settings.tax.enabled && settings.tax.pricesIncludeTax ? Math.round((taxable - taxable / (1 + settings.tax.rate / 100)) * 100) / 100 : 0;

  const addressValid =
    method === 'pickup' || (address.line1.trim().length >= 3 && address.city.trim() && /^\d{6}$/.test(address.pincode));
  const nameValid = !needsName || contactName.trim().length > 0;
  const cleanPhone = contactPhone.replace(/\D/g, '').slice(-10);
  const phoneValid = !needsPhone || /^[6-9]\d{9}$/.test(cleanPhone);
  const canReview = !invalid && !noPaymentMethod && filesMissing.length === 0 && addressValid && nameValid && phoneValid;
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
      confirmLabel: payNow ? t('checkout.placeAndPay', { amount: formatINR(total) }) : t('checkout.placeOrder'),
    });
    if (!ok) return;
    createOrder.mutate(
      {
        // Same items and same details: the same checkout. Changing pickup/delivery, the address,
        // payment or the note after closing the payment window starts a fresh one instead of
        // bringing back the old one with the old details.
        idempotencyKey: `${itemsKey}-${shortHash(JSON.stringify({ method, address: method === 'delivery' ? address : null, paymentMethod, note: note.trim(), contactName, cleanPhone }))}`,
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
        contactPhone: needsPhone ? cleanPhone : undefined,
      },
      {
        onSuccess: async (order) => {
          // The number was saved to the account; refresh it so the next checkout does not ask again.
          if (needsPhone) void authApi.me().then(useAuthStore.getState().setPrincipal).catch(() => undefined);

          // Paying online first: the order is placed only once the payment goes through. Until then the
          // cart stays, and paying again reuses the same checkout (same key).
          if (order.status === 'awaiting_payment') {
            setPaying(true);
            let paid = false;
            try {
              paid = await payWithRazorpay(order._id, i18n.language);
            } catch (e) {
              toast.error(getErrorMessage(e));
              return;
            } finally {
              setPaying(false);
            }
            if (!paid) {
              toast.info(t('toast.paymentLaterTitle'), { description: t('checkout.paymentLater') });
              return;
            }
            clearItems();
            toast.success(t('checkout.success'), { description: t('toast.paymentSuccessDesc', { number: order.orderNumber }) });
            navigate(`/account/orders/${order._id}`, { replace: true });
            return;
          }

          clearItems();
          toast.success(t('checkout.success'), { description: t('toast.orderPlacedDesc', { number: order.orderNumber, total: formatINR(order.totals.total) }) });
          // Approved institutions may also pay online, but their order starts either way. Nothing to
          // pay (this checkout was already paid, e.g. a UPI payment confirmed after the window closed):
          // no payment window, the order is simply placed.
          if (paymentMethod === 'online' && order.status !== 'quote_pending' && order.payment.status !== 'paid') {
            setPaying(true);
            try {
              const paid = await payWithRazorpay(order._id, i18n.language);
              if (paid) toast.success(t('checkout.paymentSuccess'), { description: t('toast.paymentSuccessDesc', { number: order.orderNumber }) });
              else toast.info(t('checkout.paymentCancelled'));
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
      <PageNav
        items={
          isReorder && reorder.from
            ? [{ label: t('nav.myOrders'), to: '/account/orders' }, { label: reorder.from.number, to: `/account/orders/${reorder.from.id}` }, { label: t('checkout.title') }]
            : [{ label: t('cart.title'), to: '/cart' }, { label: t('checkout.title') }]
        }
      />
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
      <div className="grid gap-8 *:min-w-0 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        {step === 'review' ? (
          <OrderReview
            lines={lines}
            method={method}
            address={address}
            payment={paymentMethod}
            note={note}
            contact={contact}
            settings={settings}
            onEditItems={() => (isReorder && reorder.from ? navigate(`/account/orders/${reorder.from.id}`) : navigate('/cart'))}
            onEditDetails={() => goTo('details')}
          />
        ) : (
        <div className="space-y-6">
          {isReorder && reorder.needsFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkout.reorderFilesTitle')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('checkout.reorderFilesHint')}</p>
              </CardHeader>
              <CardContent className="space-y-5">
                {reorder.items
                  .filter((i) => reorder.needsFiles.includes(i.id))
                  .map((i) => (
                    <div key={i.id} className="space-y-2">
                      <p className="text-sm font-semibold">{l(i.name)}</p>
                      <FileUploader
                        productId={i.productId}
                        accepted={REORDER_FILE_TYPES}
                        files={i.files}
                        onChange={(files) => reorder.setFiles(i.id, files)}
                      />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.fulfilment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2" role="radiogroup">
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
                <div className="grid gap-4 rounded-xl shadow-card bg-muted/30 p-4 sm:grid-cols-2">
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
              {hasQuoteItems ? (
                <Alert variant="info">
                  <IconInfoCircle />
                  <AlertDescription className="text-foreground">
                    {t(paymentMethod === 'online' ? 'checkout.quoteNoticeOnline' : 'checkout.quoteNotice')}
                  </AlertDescription>
                </Alert>
              ) : noPaymentMethod ? (
                <Alert variant="destructive">
                  <IconInfoCircle />
                  <AlertDescription>{t('checkout.noPaymentMethod')}</AlertDescription>
                </Alert>
              ) : (
                // Only the methods the shop offers right now; a switched-off one is not shown at all.
                <div className={cn('grid gap-3', onlineAllowed && counterAllowed && 'sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2')} role="radiogroup">
                  {onlineAllowed && (
                    <ChoiceCard
                      selected={paymentMethod === 'online'}
                      onSelect={() => setPayment('online')}
                      icon={<IconCreditCard className="size-5" />}
                      title={t('checkout.payOnline')}
                      description={t('checkout.payOnlineDesc')}
                    />
                  )}
                  {counterAllowed && (
                    <ChoiceCard
                      selected={paymentMethod === 'counter'}
                      onSelect={() => setPayment('counter')}
                      icon={<IconCash className="size-5" />}
                      title={t('checkout.payCounter')}
                      description={t('checkout.payCounterDesc')}
                    />
                  )}
                </div>
              )}
              {needsName && (
                <div className="space-y-2">
                  <Label htmlFor="contactName">{t('checkout.contactName')}</Label>
                  <Input id="contactName" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
              )}
              {needsPhone && (
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">
                    {t('checkout.contactPhone')} <span className="text-destructive">*</span>
                  </Label>
                  <PrefixedInput
                    id="contactPhone"
                    prefix="+91"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={contactPhone}
                    required
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

        <aside className="md:sticky md:top-32 md:self-start">
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
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{method === 'delivery' ? t('checkout.deliveryFee') : t('checkout.pickup')}</dt>
                  <dd className="tabular-nums">{deliveryFee ? formatINR(deliveryFee) : t('common.free')}</dd>
                </div>
                {settings.tax.enabled && settings.tax.rate > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t('checkout.tax', { rate: settings.tax.rate })}
                      {settings.tax.pricesIncludeTax && <span className="ml-1 text-xs">({t('checkout.taxIncluded')})</span>}
                    </dt>
                    <dd className="tabular-nums">{formatINR(taxAdded || taxIncludedAmount)}</dd>
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
                      {invalid ? t('cart.invalid') : filesMissing.length > 0 ? t('checkout.reorderFilesNeeded') : noPaymentMethod ? t('checkout.noPaymentMethod') : !nameValid ? t('checkout.needName') : !phoneValid ? t('checkout.needPhone') : t('checkout.needAddress')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label htmlFor="confirm" className="flex items-start gap-2.5 rounded-lg shadow-card bg-muted/40 p-3 text-sm">
                    <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                    {t('checkout.confirmCheck')}
                  </label>
                  <Button size="lg" variant="brand" className="w-full" disabled={!canSubmit} onClick={() => void placeOrder()}>
                    {(createOrder.isPending || paying) && <Spinner className="size-4 text-current" />}
                    {createOrder.isPending
                      ? t('checkout.placing')
                      : payNow
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
