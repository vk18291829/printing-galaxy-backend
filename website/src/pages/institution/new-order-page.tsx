import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCheck,
  IconClockHour4,
  IconFileInvoice,
  IconPackage,
  IconPalette,
  IconPencil,
  IconRulerMeasure,
  IconShoppingCartPlus,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageBanner } from '@/components/common/page-banner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { PageNav } from '@/components/common/page-nav';
import { QuantityStepper } from '@/components/common/quantity-stepper';
import { EmptyState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth-store';
import type { CartFile } from '@/features/cart/cart-store';
import { useProducts, useQuote, type QuoteInput } from '@/features/catalog/api';
import { OptionPicker } from '@/features/catalog/components/option-picker';
import { PriceTierTable } from '@/features/catalog/components/price-tier-table';
import { useCreateOrder } from '@/features/orders/api';
import { usePublicSettings } from '@/features/settings/api';
import { FileUploader } from '@/features/uploads/file-uploader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { newIdempotencyKey } from '@/lib/api-client';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Order, Product, Quote, SizeUnit } from '@/types/api';

type StepId = 'product' | 'size' | 'options' | 'quantity' | 'review';

/** `custom` is a size the institution types in; every other value is a listed size (or "standard"). */
const CUSTOM = 'custom';
const STANDARD = 'standard';
const SIZE_UNITS: SizeUnit[] = ['mm', 'cm', 'in'];

const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_SAMPLES = 5;

const sizeOption = (product: Product) => product.options.find((o) => o.key === 'size');

function defaultOptions(product: Product) {
  return Object.fromEntries(
    product.options.map((o) => [o.key, (o.values.find((v) => v.isDefault) ?? o.values[0])?.value ?? '']),
  );
}

/** The step list depends on the product: options are skipped when there is nothing to choose. */
function stepsFor(product: Product | undefined): StepId[] {
  const hasOptions = Boolean(product?.options.some((o) => o.key !== 'size'));
  return ['product', 'size', ...(hasOptions ? (['options'] as const) : []), 'quantity', 'review'];
}

function StepBar({ steps, current, reached, onGo }: { steps: StepId[]; current: StepId; reached: number; onGo: (s: StepId) => void }) {
  const { t } = useTranslation();
  const index = steps.indexOf(current);
  return (
    <ol className="mb-8 flex items-center gap-2 overflow-x-auto pb-1 sm:gap-3" aria-label={t('newOrder.progress')}>
      {steps.map((step, i) => {
        const done = i < index;
        const active = i === index;
        const canGo = i <= reached && !active;
        return (
          <li key={step} className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={!canGo}
              onClick={() => onGo(step)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-semibold transition-colors',
                active ? 'bg-brand-navy text-white' : done ? 'text-brand-navy hover:bg-muted' : 'text-muted-foreground',
                canGo && 'cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full text-xs',
                  active ? 'bg-primary text-primary-foreground' : done ? 'bg-success text-white' : 'border bg-background',
                )}
              >
                {done ? <IconCheck className="size-4" stroke={3} /> : i + 1}
              </span>
              {t(`newOrder.steps.${step}`)}
            </button>
            {i < steps.length - 1 && <span className={cn('h-px w-4 sm:w-8', done ? 'bg-success' : 'bg-border')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  desc,
  aside,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  desc?: ReactNode;
  aside?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl shadow-card bg-card p-4 text-left transition-[border-color,box-shadow]',
        selected && 'border-primary ring-2 ring-primary/20',
      )}
    >
      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-primary' : 'border-muted-foreground/40')}>
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-navy">{title}</span>
        {desc && <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span>}
      </span>
      {aside && <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">{aside}</span>}
    </button>
  );
}

function ProductThumb({ product, className }: { product: Product; className?: string }) {
  return product.images[0] ? (
    <img src={product.images[0]} alt="" className={cn('rounded-lg object-cover', className)} />
  ) : (
    <span className={cn('grid place-items-center rounded-lg bg-primary/10 text-primary', className)}>
      <DynamicIcon name={product.icon} className="size-1/2" />
    </span>
  );
}

const fromPrice = (product: Product) => {
  const tiers = product.pricing.institution.tiers;
  return tiers.length ? Math.min(...tiers.map((t) => t.unitPrice)) : null;
};

export default function NewOrderPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const principal = useAuthStore((s) => s.principal);
  const institution = principal?.kind === 'institution' ? principal.institution : null;
  const { data: products, isLoading } = useProducts({ section: 'institution' });
  const { data: settings } = usePublicSettings();
  const createOrder = useCreateOrder();
  useDocumentTitle(t('newOrder.title'));

  const product = products?.find((p) => p.slug === params.get('product'));
  const steps = stepsFor(product);
  const [step, setStep] = useState<StepId>('product');
  // Furthest step reached, so finished steps can be revisited from the step bar.
  const [reached, setReached] = useState(0);

  const [size, setSize] = useState(STANDARD);
  const [custom, setCustom] = useState({ width: '', height: '', unit: 'mm' as SizeUnit });
  const [options, setOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [copies, setCopies] = useState(1);
  const [files, setFiles] = useState<CartFile[]>([]);
  const [instructions, setInstructions] = useState('');
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  // One key per order being built, so a double tap or retry never creates two orders.
  const idempotencyKey = useRef(newIdempotencyKey());

  // A product chosen (or linked from a product page) resets the configuration to its defaults.
  useEffect(() => {
    if (!product) return;
    const defaults = defaultOptions(product);
    setOptions(defaults);
    setSize(sizeOption(product) ? defaults.size! : STANDARD);
    setCustom({ width: '', height: '', unit: 'mm' });
    const minQty = product.pricing.institution.minQty;
    setQuantity(product.unit === 'page' ? 1 : minQty);
    setPageCount(product.unit === 'page' ? minQty : 1);
    setCopies(1);
    setFiles([]);
    setInstructions('');
    // Coming from the student list: the head-count and which class it is for.
    const qty = Number(params.get('qty'));
    if (qty > 0 && product.unit !== 'page') setQuantity(Math.max(qty, minQty));
    const note = params.get('note');
    if (note) setInstructions(note.slice(0, 1000));
    idempotencyKey.current = newIdempotencyKey();
  }, [product]);

  // Arriving with ?product=… skips the picker.
  useEffect(() => {
    if (product && step === 'product' && reached === 0) {
      setStep('size');
      setReached(1);
    }
  }, [product]);

  const isPageBased = product?.unit === 'page';
  const isCustom = size === CUSTOM;
  const quoteInput = useMemo<QuoteInput | null>(
    () =>
      product
        ? isPageBased
          ? { productId: product._id, options, pageCount, copies }
          : { productId: product._id, options, quantity }
        : null,
    [product, isPageBased, options, pageCount, copies, quantity],
  );
  const debounced = useDebouncedValue(quoteInput, 250);
  const { data: quote, isFetching } = useQuote(debounced);
  const stale = debounced !== quoteInput;

  if (isLoading || !settings) return <PageLoader />;
  if (!institution) return null;

  const approved = institution.status === 'approved';
  const go = (next: StepId) => {
    setStep(next);
    setReached((r) => Math.max(r, steps.indexOf(next)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => go(steps[steps.indexOf(step) + 1]!);
  const back = () => go(steps[steps.indexOf(step) - 1]!);

  const pickProduct = (p: Product) => {
    setParams({ product: p.slug }, { replace: true });
    setReached(1);
    setStep('size');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const customValid = !isCustom || (Number(custom.width) > 0 && Number(custom.height) > 0);
  const unitLabel = (count: number) => (product ? t(`units.${product.unit}`, { count }) : '');
  const quoteErrors = (quote?.errors ?? []).map((e) =>
    t(`product.errors.${e.code}`, { ...e.params, unitLabel: unitLabel(Number(e.params?.min ?? 2)) }),
  );
  const quoteValid = Boolean(quote?.valid) && !stale;
  const priceOnRequest = Boolean(quote?.requiresQuote) || isCustom;

  const sizeLabel = (() => {
    if (!product) return '';
    if (isCustom) return `${custom.width || '?'} × ${custom.height || '?'} ${t(`newOrder.sizeUnits.${custom.unit}`)}`;
    const opt = sizeOption(product);
    const value = opt?.values.find((v) => v.value === size);
    return value ? l(value.label) : product.specs[0] ?? t('newOrder.standard');
  })();
  const otherOptions = quote?.selectedOptions.filter((o) => o.key !== 'size') ?? [];
  const qtyLabel = isPageBased
    ? `${formatNumber(pageCount)} ${t('units.page', { count: pageCount })} × ${formatNumber(copies)} ${t('units.copy', { count: copies })}`
    : `${formatNumber(quantity)} ${unitLabel(quantity)}`;

  const deliveryAvailable = settings.delivery.enabled && Boolean(institution.address?.line1);
  const subtotal = quote?.subtotal ?? 0;
  const deliveryFee = method === 'delivery' && subtotal < settings.delivery.freeAbove ? settings.delivery.fee : 0;
  const taxable = subtotal + deliveryFee;
  const tax = settings.tax.enabled && !settings.tax.pricesIncludeTax ? (taxable * settings.tax.rate) / 100 : 0;
  const total = taxable + tax;

  const canContinue =
    step === 'size' ? customValid : step === 'options' ? Boolean(quote) && !quote?.errors.some((e) => e.code.startsWith('OPTION')) : step === 'quantity' ? quoteValid : true;

  const submit = async (asQuote: boolean) => {
    if (!product || !quote) return;
    let created: Order | undefined;
    const ok = await confirmAction({
      title: t(asQuote ? 'newOrder.confirmQuoteTitle' : 'newOrder.confirmOrderTitle'),
      description: t(asQuote ? 'newOrder.confirmQuoteDesc' : 'newOrder.confirmOrderDesc', {
        product: l(product.name),
        qty: qtyLabel,
        total: formatINR(total),
      }),
      confirmLabel: t(asQuote ? 'newOrder.getQuote' : 'newOrder.createOrder'),
      action: async () => {
        created = await createOrder.mutateAsync({
          idempotencyKey: idempotencyKey.current,
          items: [
            {
              productId: product._id,
              options,
              ...(isPageBased ? { pageCount, copies } : { quantity }),
              notes: instructions.trim() || undefined,
              fileIds: files.map((f) => f.id),
              ...(isCustom ? { customSize: { width: Number(custom.width), height: Number(custom.height), unit: custom.unit } } : {}),
            },
          ],
          fulfilment: method === 'delivery' ? { method, address: institution.address } : { method },
          // Institutions are invoiced on their account.
          paymentMethod: 'counter',
          requestQuote: asQuote,
          reference: reference.trim() || undefined,
          customerNote: note.trim() || undefined,
        });
      },
    });
    if (ok && created) {
      toast.success(t(asQuote ? 'newOrder.quoteSent' : 'newOrder.orderPlaced', { number: created.orderNumber }));
      navigate(`/account/orders/${created._id}`);
    }
  };

  const summary = product && step !== 'product' && (
    <Card className="gap-4 overflow-hidden pt-0">
      <div className="h-1 bg-primary" />
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-brand-navy">{t('newOrder.summaryTitle')}</CardTitle>
        {(isFetching || stale) && <Spinner className="size-4" />}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <ProductThumb product={product} className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-brand-navy">{l(product.name)}</p>
            <p className="truncate text-xs text-muted-foreground">{l(product.category.name)}</p>
          </div>
        </div>
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('newOrder.steps.size')}</dt>
            <dd className="text-right font-medium">{sizeLabel}</dd>
          </div>
          {otherOptions.map((o) => (
            <div key={o.key} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{l(o.label)}</dt>
              <dd className="text-right font-medium">{l(o.valueLabel)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('newOrder.steps.quantity')}</dt>
            <dd className="text-right font-medium">{qtyLabel}</dd>
          </div>
        </dl>
        <Separator />
        {quote?.requiresQuote ? (
          <p className="rounded-lg bg-primary/8 p-3 font-medium text-primary">{t('newOrder.priceOnRequest')}</p>
        ) : (
          quote && (
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('newOrder.pricePerUnit', { unit: unitLabel(1) })}</dt>
                <dd className="font-semibold tabular-nums">{formatINR(quote.unitPrice)}</dd>
              </div>
              {quote.fixedFees > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('product.extras')}</dt>
                  <dd className="tabular-nums">{formatINR(quote.fixedFees)}</dd>
                </div>
              )}
              {quote.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>{t('product.discount')}</dt>
                  <dd className="tabular-nums">−{formatINR(quote.discount)}</dd>
                </div>
              )}
              {step === 'review' && deliveryFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('checkout.deliveryFee')}</dt>
                  <dd className="tabular-nums">{formatINR(deliveryFee)}</dd>
                </div>
              )}
              {step === 'review' && tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('checkout.tax', { rate: settings.tax.rate })}</dt>
                  <dd className="tabular-nums">{formatINR(tax)}</dd>
                </div>
              )}
              <div className="flex items-end justify-between pt-2">
                <dt className="font-semibold">{t(isCustom ? 'newOrder.estimate' : 'newOrder.total')}</dt>
                <dd className="text-2xl font-bold tracking-tight text-brand-navy tabular-nums">{formatINR(step === 'review' ? total : subtotal)}</dd>
              </div>
              {isCustom && <p className="text-xs text-muted-foreground">{t('newOrder.estimateHint')}</p>}
            </dl>
          )
        )}
        {quote?.nextTier && quote.valid && !priceOnRequest && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
            {t('product.nextTier', { qty: formatNumber(quote.nextTier.minQty), price: formatINR(quote.nextTier.unitPrice) })}
          </p>
        )}

        {step === 'review' && (
          <div className="space-y-2 pt-1">
            <Button
              size="lg"
              variant="brand"
              className="w-full"
              disabled={!approved || !quoteValid || priceOnRequest || createOrder.isPending}
              onClick={() => void submit(false)}
            >
              <IconCheck /> {t('newOrder.createOrder')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              disabled={!approved || !quoteValid || createOrder.isPending}
              onClick={() => void submit(true)}
            >
              <IconFileInvoice /> {t('newOrder.getQuote')}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {priceOnRequest ? t(isCustom ? 'newOrder.customOnlyQuote' : 'newOrder.priceOnRequestHint') : t('newOrder.actionsHint')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container-page py-8 sm:py-10">
      <PageNav items={[{ label: t('nav.dashboard'), to: '/institution' }, { label: t('newOrder.title') }]} />
      <PageBanner className="mb-6" icon={<IconShoppingCartPlus />} title={t('newOrder.title')} description={t('newOrder.subtitle')} />

      {!approved && (
        <Alert variant="warning" className="mb-6">
          <IconClockHour4 />
          <AlertTitle>{t(`status.institution.${institution.status}`)}</AlertTitle>
          <AlertDescription>{t('newOrder.pendingApproval')}</AlertDescription>
        </Alert>
      )}

      <StepBar steps={steps} current={step} reached={reached} onGo={go} />

      {step === 'product' ? (
        <ProductPicker products={products ?? []} selected={product?._id} onPick={pickProduct} />
      ) : (
        product && (
          <div className="grid items-start gap-6 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {step === 'size' && (
                <>
                  <ProductDetails product={product} onChange={() => go('product')} />
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-brand-navy">{t('newOrder.sizeTitle')}</CardTitle>
                      <p className="text-sm text-muted-foreground">{t('newOrder.sizeSubtitle')}</p>
                    </CardHeader>
                    <CardContent className="space-y-3" role="radiogroup">
                      {sizeOption(product) ? (
                        sizeOption(product)!.values.map((v) => (
                          <ChoiceCard
                            key={v.value}
                            selected={size === v.value}
                            onSelect={() => {
                              setSize(v.value);
                              setOptions((o) => ({ ...o, size: v.value }));
                            }}
                            title={l(v.label)}
                            aside={v.unitDelta ? `+${formatINR(v.unitDelta)}/${unitLabel(1)}` : t('newOrder.included')}
                          />
                        ))
                      ) : (
                        <ChoiceCard
                          selected={size === STANDARD}
                          onSelect={() => setSize(STANDARD)}
                          title={t('newOrder.standard')}
                          desc={product.specs.join(' · ') || t('newOrder.standardDesc')}
                          aside={t('newOrder.included')}
                        />
                      )}
                      <ChoiceCard
                        selected={isCustom}
                        onSelect={() => setSize(CUSTOM)}
                        icon={<IconRulerMeasure />}
                        title={t('newOrder.customSize')}
                        desc={t('newOrder.customSizeDesc')}
                        aside={t('newOrder.onQuote')}
                      />
                      {isCustom && (
                        <div className="space-y-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:grid-cols-[1fr_auto_1fr_120px] sm:gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="w">{t('newOrder.width')}</Label>
                              <Input id="w" type="number" inputMode="decimal" min={0} value={custom.width} onChange={(e) => setCustom((c) => ({ ...c, width: e.target.value }))} />
                            </div>
                            <span className="pb-3 text-muted-foreground">×</span>
                            <div className="space-y-1.5">
                              <Label htmlFor="h">{t('newOrder.height')}</Label>
                              <Input id="h" type="number" inputMode="decimal" min={0} value={custom.height} onChange={(e) => setCustom((c) => ({ ...c, height: e.target.value }))} />
                            </div>
                            <div className="col-span-3 flex gap-1 rounded-xl shadow-card bg-background p-1 sm:col-span-1" role="radiogroup" aria-label={t('newOrder.unit')}>
                              {SIZE_UNITS.map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  role="radio"
                                  aria-checked={custom.unit === u}
                                  onClick={() => setCustom((c) => ({ ...c, unit: u }))}
                                  className={cn('h-8 flex-1 rounded-lg text-sm font-semibold', custom.unit === u ? 'bg-brand-navy text-white' : 'text-muted-foreground hover:text-foreground')}
                                >
                                  {t(`newOrder.sizeUnits.${u}`)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="flex gap-2 text-sm text-brand-navy/80">
                            <IconFileInvoice className="mt-0.5 size-4 shrink-0 text-primary" /> {t('newOrder.customNote')}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}

              {step === 'options' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-brand-navy">{t('newOrder.optionsTitle', { product: l(product.name) })}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('newOrder.optionsSubtitle')}</p>
                  </CardHeader>
                  <CardContent>
                    <OptionPicker
                      options={product.options.filter((o) => o.key !== 'size')}
                      value={options}
                      onChange={(k, v) => setOptions((o) => ({ ...o, [k]: v }))}
                    />
                  </CardContent>
                </Card>
              )}

              {step === 'quantity' && (
                <QuantityStep
                  product={product}
                  quote={quote}
                  isPageBased={isPageBased}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  pageCount={pageCount}
                  setPageCount={setPageCount}
                  copies={copies}
                  setCopies={setCopies}
                  errors={stale ? [] : quoteErrors}
                />
              )}

              {step === 'review' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-brand-navy">{t('newOrder.reviewTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y text-sm">
                      {[
                        { label: t('newOrder.steps.product'), value: l(product.name), to: 'product' as const },
                        { label: t('newOrder.steps.size'), value: sizeLabel, to: 'size' as const },
                        ...(steps.includes('options')
                          ? [{ label: t('newOrder.steps.options'), value: otherOptions.map((o) => `${l(o.label)}: ${l(o.valueLabel)}`).join(' · '), to: 'options' as const }]
                          : []),
                        { label: t('newOrder.steps.quantity'), value: qtyLabel, to: 'quantity' as const },
                      ].map((row) => (
                        <div key={row.to} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{row.label}</p>
                            <p className="font-medium text-brand-navy">{row.value}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => go(row.to)}>
                            <IconPencil /> {t('newOrder.edit')}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-brand-navy">
                        {t('newOrder.samplesTitle')} <span className="text-sm font-normal text-muted-foreground">({t('common.optional')})</span>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{t('newOrder.samplesHint', { count: MAX_SAMPLES })}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FileUploader productId={product._id} accepted={IMAGE_TYPES} files={files} onChange={setFiles} max={MAX_SAMPLES} />
                      <div className="space-y-1.5">
                        <Label htmlFor="instructions">{t('newOrder.instructions')}</Label>
                        <Textarea
                          id="instructions"
                          value={instructions}
                          maxLength={1000}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder={t('newOrder.instructionsPlaceholder')}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-brand-navy">{t('newOrder.deliveryTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                      <ChoiceCard
                        selected={method === 'pickup'}
                        onSelect={() => setMethod('pickup')}
                        icon={<IconBuildingStore />}
                        title={t('checkout.pickup')}
                        desc={t('newOrder.pickupDesc')}
                      />
                      <ChoiceCard
                        selected={method === 'delivery'}
                        onSelect={() => deliveryAvailable && setMethod('delivery')}
                        icon={<IconTruckDelivery />}
                        title={t('newOrder.delivery')}
                        desc={
                          deliveryAvailable
                            ? [institution.address?.line1, institution.address?.city, institution.address?.pincode].filter(Boolean).join(', ')
                            : settings.delivery.enabled
                              ? t('newOrder.noAddress')
                              : t('checkout.deliveryUnavailable')
                        }
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ref">{t('newOrder.referenceLabel')}</Label>
                        <Input id="ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder={t('newOrder.referencePlaceholder')} />
                        <p className="text-xs text-muted-foreground">{t('newOrder.referenceHint')}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="note">{t('checkout.note')}</Label>
                        <Textarea id="note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-11" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {step !== 'review' && (
                <div className="flex items-center justify-between gap-3">
                  <Button variant="outline" size="lg" onClick={back}>
                    <IconArrowLeft /> {t('newOrder.back')}
                  </Button>
                  <Button variant="brand" size="lg" onClick={next} disabled={!canContinue}>
                    {t('newOrder.continue')} <IconArrowRight />
                  </Button>
                </div>
              )}
              {step === 'review' && (
                <Button variant="outline" size="lg" onClick={back}>
                  <IconArrowLeft /> {t('newOrder.back')}
                </Button>
              )}
            </div>

            <aside className="lg:sticky lg:top-28">{summary}</aside>
          </div>
        )
      )}
    </div>
  );
}

function ProductPicker({ products, selected, onPick }: { products: Product[]; selected?: string; onPick: (p: Product) => void }) {
  const { t } = useTranslation();
  const l = useLocalized();
  if (products.length === 0) return <EmptyState icon={<IconPackage />} title={t('newOrder.noProducts')} />;

  // Group by category, keeping the catalogue order.
  const groups = new Map<string, { name: string; items: Product[] }>();
  for (const p of products) {
    const g = groups.get(p.category._id) ?? { name: l(p.category.name), items: [] };
    g.items.push(p);
    groups.set(p.category._id, g);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-brand-navy">{t('newOrder.pickTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('newOrder.pickSubtitle')}</p>
      </div>
      {[...groups.entries()].map(([id, group]) => (
        <section key={id}>
          {groups.size > 1 && <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.name}</h3>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((p) => {
              const from = fromPrice(p);
              const book = p.pricing.institution;
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => onPick(p)}
                  className={cn(
                    'group flex items-center gap-4 rounded-xl shadow-card bg-card p-4 text-left transition-[border-color,box-shadow]',
                    selected === p._id && 'border-primary ring-2 ring-primary/20',
                  )}
                >
                  <ProductThumb product={p} className="size-14 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-brand-navy">{l(p.name)}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{l(p.shortDescription)}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-primary">
                        {from !== null ? t('newOrder.from', { price: formatINR(from), unit: t(`units.${p.unit}`, { count: 1 }) }) : t('product.quoteRequired')}
                      </span>
                      {book.minQty > 1 && (
                        <span className="text-muted-foreground">{t('newOrder.minQty', { count: book.minQty, unit: t(`units.${p.unit}`, { count: book.minQty }) })}</span>
                      )}
                    </span>
                  </span>
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ProductDetails({ product, onChange }: { product: Product; onChange: () => void }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row">
        <ProductThumb product={product} className="aspect-square w-full shrink-0 sm:size-36" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-primary">{l(product.category.name)}</p>
              <h2 className="text-xl font-bold text-brand-navy sm:text-2xl">{l(product.name)}</h2>
            </div>
            <Button variant="outline" size="sm" onClick={onChange}>
              {t('newOrder.change')}
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{l(product.shortDescription)}</p>
          {l(product.description) && <p className="text-sm leading-relaxed text-muted-foreground">{l(product.description)}</p>}
          <div className="flex flex-wrap gap-2">
            {product.specs.map((s) => (
              <Badge key={s} variant="outline">{s}</Badge>
            ))}
            <Badge variant="outline">
              <IconClockHour4 /> {t('newOrder.leadTime', { count: product.leadTimeDays })}
            </Badge>
            {product.workflow === 'design' && (
              <Badge variant="outline">
                <IconPalette /> {t('newOrder.proofIncluded')}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuantityStep({
  product,
  quote,
  isPageBased,
  quantity,
  setQuantity,
  pageCount,
  setPageCount,
  copies,
  setCopies,
  errors,
}: {
  product: Product;
  quote?: Quote;
  isPageBased: boolean;
  quantity: number;
  setQuantity: (n: number) => void;
  pageCount: number;
  setPageCount: (n: number) => void;
  copies: number;
  setCopies: (n: number) => void;
  errors: string[];
}) {
  const { t } = useTranslation();
  const book = product.pricing.institution;
  const unit = (count: number) => t(`units.${product.unit}`, { count });
  // The table shows prices with the chosen options included, so it matches the summary.
  const delta = quote?.optionUnitDelta ?? 0;
  const pricedBook = { ...book, tiers: book.tiers.map((tier) => ({ ...tier, unitPrice: tier.unitPrice + delta })) };
  // Each price break is a natural quantity to suggest.
  const presets = [...new Set(book.tiers.map((tier) => tier.minQty))].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-brand-navy">{t('newOrder.qtyTitle')}</CardTitle>
        {book.minQty > 1 && <p className="text-sm text-muted-foreground">{t('common.minOrder', { count: book.minQty, unit: unit(book.minQty) })}</p>}
      </CardHeader>
      <CardContent className="space-y-6">
        {isPageBased ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pages">{t('product.pages')}</Label>
              <QuantityStepper id="pages" value={pageCount} onChange={setPageCount} min={1} step={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="copies">{t('product.copies')}</Label>
              <QuantityStepper id="copies" value={copies} onChange={setCopies} min={1} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="qty" className="capitalize">{unit(2)}</Label>
            <QuantityStepper id="qty" value={quantity} onChange={setQuantity} min={1} step={book.minQty >= 50 ? 10 : 1} />
            {presets.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('newOrder.qtyQuick')}</span>
                {presets.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(q)}
                    className={cn(
                      'rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums transition-colors hover:border-primary/50',
                      quantity === q ? 'border-primary bg-primary/8 text-primary' : 'text-brand-navy',
                    )}
                  >
                    {formatNumber(q)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {quote && !quote.requiresQuote && quote.valid && (
          <div className="grid grid-cols-3 divide-x rounded-xl shadow-card bg-muted/40 text-center">
            <div className="p-3">
              <p className="text-xs text-muted-foreground">{t('newOrder.pricePerUnit', { unit: unit(1) })}</p>
              <p className="mt-0.5 text-lg font-bold text-brand-navy tabular-nums">{formatINR(quote.unitPrice)}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground">{t('newOrder.steps.quantity')}</p>
              <p className="mt-0.5 text-lg font-bold text-brand-navy tabular-nums">{formatNumber(quote.units)}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground">{t('newOrder.total')}</p>
              <p className="mt-0.5 text-lg font-bold text-primary tabular-nums">{formatINR(quote.subtotal)}</p>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="space-y-1.5">
            {[...new Set(errors)].map((e) => (
              <li key={e} className="flex items-start gap-2 text-sm text-destructive">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" /> {e}
              </li>
            ))}
          </ul>
        )}

        {book.tiers.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-navy">{t('newOrder.priceBreaks')}</p>
            <PriceTierTable book={pricedBook} unit={product.unit} activeUnits={quote?.units} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
