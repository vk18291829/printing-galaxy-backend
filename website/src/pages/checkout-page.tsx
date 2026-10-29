import {
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCash,
  IconCreditCard,
  IconCheck,
  IconInfoCircle,
  IconLock,
  IconMapPin,
  IconTruckDelivery,
  IconUpload,
  IconUser,
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
import { CartThumb, DesignBadge } from '@/features/cart/components/cart-line';
import { OrderReview } from '@/features/cart/components/order-review';
import { useCartQuotes } from '@/features/cart/use-cart-quotes';
import { useCreateOrder } from '@/features/orders/api';
import { payWithRazorpay } from '@/features/orders/razorpay';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Address } from '@/types/api';

function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  tag,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  /** A short note on the right, like "Free" or the fee. */
  tag?: ReactNode;
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
        'flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5', selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{title}</span>
          {tag}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-primary bg-primary text-white' : 'border-border')}
      >
        {selected && <IconCheck className="size-3" stroke={3} />}
      </span>
    </button>
  );
}

/** A numbered part of the details step. */
function StepSection({ n, title, description, children }: { n: number; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white tabular-nums">{n}</span>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Cart → Details → Review & pay, with what is done ticked off. */
function CheckoutSteps({ step, canReview, onStep, cartTo }: { step: 'details' | 'review'; canReview: boolean; onStep: (s: 'details' | 'review') => void; cartTo: string }) {
  const { t } = useTranslation();
  const steps = [
    { key: 'cart', label: t('checkout.steps.cart'), done: true },
    { key: 'details', label: t('checkout.steps.details'), done: step === 'review' },
    { key: 'review', label: t('checkout.steps.review'), done: false },
  ] as const;
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label={t('checkout.title')}>
      {steps.map((s, i) => {
        const current = s.key === step;
        const inner = (
          <>
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums transition-colors',
                current ? 'bg-brand-navy text-white ring-4 ring-brand-navy/12' : s.done ? 'bg-brand-amber text-brand-navy' : 'bg-muted text-muted-foreground',
              )}
            >
              {s.done && !current ? <IconCheck className="size-3.5" stroke={3} /> : i + 1}
            </span>
            <span className={cn('text-sm font-semibold whitespace-nowrap', current ? 'text-foreground' : 'text-muted-foreground', !current && 'max-sm:sr-only')}>{s.label}</span>
          </>
        );
        return (
          <li key={s.key} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 && <span className={cn('h-0.5 w-5 rounded-full sm:w-10', s.done || current ? 'bg-brand-amber' : 'bg-border')} />}
            {s.key === 'cart' ? (
              <Link to={cartTo} className="flex items-center gap-2 rounded-full pr-1 hover:opacity-80">
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                disabled={current || (s.key === 'review' && !canReview)}
                onClick={() => onStep(s.key)}
                aria-current={current ? 'step' : undefined}
                className="flex items-center gap-2 rounded-full pr-1 disabled:cursor-default"
              >
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ol>
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

  const blocker = invalid
    ? t('cart.invalid')
    : filesMissing.length > 0
      ? t('checkout.reorderFilesNeeded')
      : noPaymentMethod
        ? t('checkout.noPaymentMethod')
        : !nameValid
          ? t('checkout.needName')
          : !phoneValid
            ? t('checkout.needPhone')
            : t('checkout.needAddress');
  const cartTo = isReorder && reorder.from ? `/account/orders/${reorder.from.id}` : '/cart';
  const busy = createOrder.isPending || paying;
  const actionLabel = createOrder.isPending ? t('checkout.placing') : payNow ? t('checkout.placeAndPay', { amount: formatINR(total) }) : t('checkout.placeOrder');
  // On the review step the button first asks for the tick, then places the order.
  const onPlace = () => {
    if (!confirmed) {
      const box = document.getElementById('confirm');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box?.focus();
      toast.info(t('checkout.tickFirst'));
      return;
    }
    void placeOrder();
  };
  const freeTag = <span className="rounded-full bg-success/12 px-2 py-0.5 text-xs font-semibold text-success">{t('common.free')}</span>;
  const deliveryTag = settings.delivery.enabled ? (
    subtotal >= settings.delivery.freeAbove ? (
      freeTag
    ) : (
      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">{formatINR(settings.delivery.fee)}</span>
    )
  ) : undefined;

  return (
    <div className="container-page max-w-7xl pt-8 sm:pt-10 md:pb-12">
      <PageNav
        items={
          isReorder && reorder.from
            ? [{ label: t('nav.myOrders'), to: '/account/orders' }, { label: reorder.from.number, to: `/account/orders/${reorder.from.id}` }, { label: t('checkout.title') }]
            : [{ label: t('cart.title'), to: '/cart' }, { label: t('checkout.title') }]
        }
      />
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{step === 'review' ? t('checkout.reviewTitle') : t('checkout.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{step === 'review' ? t('checkout.reviewHint') : t('checkout.detailsHint')}</p>
        </div>
        <CheckoutSteps step={step} canReview={Boolean(canReview)} onStep={goTo} cartTo={cartTo} />
      </div>

      <div className="grid gap-6 *:min-w-0 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        {step === 'review' ? (
          <OrderReview
            lines={lines}
            method={method}
            address={address}
            payment={paymentMethod}
            note={note}
            contact={contact}
            settings={settings}
            onEditItems={() => navigate(cartTo)}
            onEditDetails={() => goTo('details')}
          />
        ) : (
          <div className="space-y-5">
            {isReorder && reorder.needsFiles.length > 0 && (
              <section className="rounded-2xl border border-brand-amber/50 bg-brand-amber/5 p-5 sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-amber text-brand-navy">
                    <IconUpload className="size-4" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{t('checkout.reorderFilesTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('checkout.reorderFilesHint')}</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {reorder.items
                    .filter((i) => reorder.needsFiles.includes(i.id))
                    .map((i) => (
                      <div key={i.id} className="space-y-2">
                        <p className="text-sm font-semibold">{l(i.name)}</p>
                        <FileUploader productId={i.productId} accepted={REORDER_FILE_TYPES} files={i.files} onChange={(files) => reorder.setFiles(i.id, files)} />
                      </div>
                    ))}
                </div>
              </section>
            )}

            <StepSection n={1} title={t('checkout.fulfilment')}>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2" role="radiogroup" aria-label={t('checkout.fulfilment')}>
                <ChoiceCard
                  selected={method === 'pickup'}
                  onSelect={() => setMethod('pickup')}
                  icon={<IconBuildingStore />}
                  title={t('checkout.pickup')}
                  tag={freeTag}
                  description={[t('checkout.pickupDesc'), settings.shop.address].filter(Boolean).join(' ')}
                />
                <ChoiceCard
                  selected={method === 'delivery'}
                  onSelect={() => setMethod('delivery')}
                  disabled={!settings.delivery.enabled}
                  icon={<IconTruckDelivery />}
                  title={t('checkout.delivery')}
                  tag={deliveryTag}
                  description={
                    settings.delivery.enabled
                      ? t('checkout.deliveryDesc', { fee: settings.delivery.fee, free: settings.delivery.freeAbove })
                      : t('checkout.deliveryUnavailable')
                  }
                />
              </div>

              {method === 'delivery' && (
                <div className="mt-4 grid gap-4 rounded-xl bg-secondary/50 p-4 sm:grid-cols-2 sm:p-5">
                  <p className="flex items-center gap-2 font-semibold sm:col-span-2">
                    <IconMapPin className="size-4.5 text-primary" /> {t('checkout.address')}
                  </p>
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
            </StepSection>

            <StepSection n={2} title={t('checkout.payment')}>
              {hasQuoteItems ? (
                <Alert variant="info">
                  <IconInfoCircle />
                  <AlertDescription className="text-foreground">{t(paymentMethod === 'online' ? 'checkout.quoteNoticeOnline' : 'checkout.quoteNotice')}</AlertDescription>
                </Alert>
              ) : noPaymentMethod ? (
                <Alert variant="destructive">
                  <IconInfoCircle />
                  <AlertDescription>{t('checkout.noPaymentMethod')}</AlertDescription>
                </Alert>
              ) : (
                // Only the methods the shop offers right now; a switched-off one is not shown at all.
                <div className={cn('grid gap-3', onlineAllowed && counterAllowed && 'sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2')} role="radiogroup" aria-label={t('checkout.payment')}>
                  {onlineAllowed && (
                    <ChoiceCard
                      selected={paymentMethod === 'online'}
                      onSelect={() => setPayment('online')}
                      icon={<IconCreditCard />}
                      title={t('checkout.payOnline')}
                      description={t('checkout.payOnlineDesc')}
                    />
                  )}
                  {counterAllowed && (
                    <ChoiceCard
                      selected={paymentMethod === 'counter'}
                      onSelect={() => setPayment('counter')}
                      icon={<IconCash />}
                      title={t('checkout.payCounter')}
                      description={t('checkout.payCounterDesc')}
                    />
                  )}
                </div>
              )}
              {payNow && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconLock className="size-3.5" /> {t('checkout.securePayment')}
                </p>
              )}
            </StepSection>

            <StepSection n={3} title={t('checkout.contactAndNote')} description={t('checkout.contactAndNoteDesc')}>
              <div className="space-y-4">
                {!needsName && !needsPhone && (
                  <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-4 text-sm">
                    <IconUser className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{contact.name}</p>
                      <p className="truncate text-muted-foreground">{[contact.phone && `+91 ${contact.phone}`, contact.email].filter(Boolean).join(' · ')}</p>
                    </div>
                    {principal?.kind === 'user' && (
                      <Link to="/account/profile" className="shrink-0 text-sm font-semibold text-primary hover:underline">
                        {t('common.edit')}
                      </Link>
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
                  <Textarea id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('checkout.notePlaceholder')} />
                </div>
              </div>
            </StepSection>
          </div>
        )}

        <aside className="md:sticky md:top-32 md:self-start">
          <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('cart.summary')}</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">{t('checkout.itemCount', { count: lines.length })}</span>
            </div>
            <ul className="max-h-72 space-y-3 overflow-y-auto">
              {lines.map(({ item, amount }) => (
                <li key={item.id} className="flex items-center gap-3">
                  <CartThumb item={item} className="size-12 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">
                      {l(item.name)}
                      <DesignBadge item={item} />
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {item.unit === 'page'
                        ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies ?? 1}`
                        : `${formatNumber(item.quantity ?? 0)} ${t(`units.${item.unit}`, { count: item.quantity ?? 0 })}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{item.workflow === 'quote' ? '—' : formatINR(amount)}</span>
                </li>
              ))}
            </ul>
            <Separator />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
                <dd className="tabular-nums">{formatINR(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{method === 'delivery' ? t('checkout.deliveryFee') : t('checkout.pickup')}</dt>
                <dd className="tabular-nums">{deliveryFee ? formatINR(deliveryFee) : <span className="font-medium text-success">{t('common.free')}</span>}</dd>
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
            </dl>
            <div className="flex items-end justify-between gap-3 rounded-xl bg-brand-navy px-4 py-3.5 text-white">
              <span className="font-semibold">
                {t('checkout.total')}
                {settings.tax.enabled && settings.tax.pricesIncludeTax && <span className="block text-xs font-normal text-white/70">{t('checkout.taxIncluded')}</span>}
              </span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">{formatINR(total)}</span>
            </div>

            {step === 'details' ? (
              <div className="space-y-3 max-md:hidden">
                <Button size="lg" variant="brand" className="w-full" disabled={!canReview} onClick={() => goTo('review')}>
                  {t('checkout.reviewOrder')} <IconArrowRight />
                </Button>
                {!canReview && <p className="text-center text-sm text-destructive">{blocker}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <label
                  htmlFor="confirm"
                  className={cn('flex items-start gap-2.5 rounded-xl border p-3.5 text-sm transition-colors', confirmed ? 'border-success/40 bg-success/5' : 'bg-secondary/40')}
                >
                  <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                  {t('checkout.confirmCheck')}
                </label>
                <Button size="lg" variant="brand" className="w-full max-md:hidden" disabled={!canSubmit} onClick={() => void placeOrder()}>
                  {busy && <Spinner className="size-4 text-current" />}
                  {payNow && !busy && <IconLock />}
                  {actionLabel}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {t('checkout.policyPrefix')}{' '}
                  <Link to="/terms" className="underline hover:text-foreground">
                    {t('legal.terms.title')}
                  </Link>
                  {' · '}
                  <Link to="/refund-policy" className="underline hover:text-foreground">
                    {t('legal.refund.title')}
                  </Link>
                </p>
                <Button variant="outline" className="w-full max-md:hidden" onClick={() => goTo('details')}>
                  <IconArrowLeft /> {t('checkout.backToDetails')}
                </Button>
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">{t('cart.estimatedNote')}</p>
          </div>
        </aside>
      </div>

      {/* Phones: the total and the next step always in reach. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t bg-card/95 px-4 sm:-mx-6 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step === 'review' && (
            <Button variant="outline" size="icon" className="size-12 shrink-0" onClick={() => goTo('details')} aria-label={t('checkout.backToDetails')}>
              <IconArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t('checkout.total')}</p>
            <p className="text-xl leading-tight font-bold tabular-nums">{formatINR(total)}</p>
          </div>
          {step === 'details' ? (
            <Button size="lg" variant="brand" className="h-12" disabled={!canReview} onClick={() => (canReview ? goTo('review') : toast.error(blocker))}>
              {t('checkout.reviewOrder')} <IconArrowRight />
            </Button>
          ) : (
            <Button size="lg" variant="brand" className="h-12 max-w-[62%]" disabled={!canReview || busy} onClick={onPlace}>
              {busy && <Spinner className="size-4 text-current" />}
              <span className="truncate">{payNow && !createOrder.isPending ? t('checkout.payShort', { amount: formatINR(total) }) : actionLabel}</span>
            </Button>
          )}
        </div>
        {step === 'details' && !canReview && <p className="mx-auto mt-1.5 max-w-xl text-xs text-destructive">{blocker}</p>}
      </div>
    </div>
  );
}
