import { IconBuildingStore, IconCash, IconCreditCard, IconInfoCircle, IconTruckDelivery } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth-store';
import { useCartStore } from '@/features/cart/cart-store';
import { CartLine } from '@/features/cart/components/cart-line';
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
  const { lines, subtotal, hasQuoteItems, invalid } = useCartQuotes(items);
  const { data: settings, isLoading } = usePublicSettings();
  const createOrder = useCreateOrder();

  const savedAddress =
    principal?.kind === 'institution' ? principal.institution.address : principal?.user.addresses?.[0];
  const needsName = principal?.kind === 'user' && !principal.user.name;

  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'online' | 'counter' | null>(null);
  const [address, setAddress] = useState<Address>(savedAddress ?? EMPTY_ADDRESS);
  const [contactName, setContactName] = useState('');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);

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
  const canSubmit = !invalid && addressValid && nameValid && !createOrder.isPending && !paying;

  const placeOrder = () => {
    createOrder.mutate(
      {
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
      },
      {
        onSuccess: async (order) => {
          clearCart();
          toast.success(t('checkout.success'), { description: order.orderNumber });
          if (paymentMethod === 'online' && order.status !== 'quote_pending') {
            setPaying(true);
            try {
              const paid = await payWithRazorpay(order._id, i18n.language);
              if (paid) toast.success(t('checkout.paymentSuccess'));
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
      <h1 className="mb-8 text-3xl font-bold">{t('checkout.title')}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
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
              <div className="space-y-2">
                <Label htmlFor="note">
                  {t('checkout.note')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
                </Label>
                <Textarea id="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
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
              <Button size="lg" variant="brand" className="w-full" disabled={!canSubmit} onClick={placeOrder}>
                {(createOrder.isPending || paying) && <Spinner className="size-4 text-current" />}
                {createOrder.isPending
                  ? t('checkout.placing')
                  : paymentMethod === 'online'
                    ? t('checkout.placeAndPay', { amount: formatINR(total) })
                    : t('checkout.placeOrder')}
              </Button>
              <p className="text-center text-xs text-muted-foreground">{t('cart.estimatedNote')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
