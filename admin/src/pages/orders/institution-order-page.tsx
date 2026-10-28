import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBuildingStore,
  IconCheck,
  IconClockHour4,
  IconFileInvoice,
  IconMinus,
  IconPackage,
  IconPalette,
  IconPencil,
  IconPlus,
  IconRulerMeasure,
  IconSchool,
  IconSearch,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { EmptyState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useInstitution, useInstitutions } from '@/features/management/api';
import { useCreateInstitutionOrder, useInstitutionProducts, useInstitutionQuote, type InstitutionQuoteInput } from '@/features/orders/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { newIdempotencyKey } from '@/lib/api-client';
import { formatINR, formatNumber } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { Institution, Product, Quote, SizeUnit } from '@/types/api';

type StepId = 'school' | 'product' | 'size' | 'options' | 'quantity' | 'review';

const STEP_LABEL: Record<StepId, string> = {
  school: 'School',
  product: 'Product',
  size: 'Size',
  options: 'Options',
  quantity: 'Quantity',
  review: 'Review',
};

/** `custom` is a size typed in by hand; every other value is a listed size (or "standard"). */
const CUSTOM = 'custom';
const STANDARD = 'standard';
const SIZE_UNITS: SizeUnit[] = ['mm', 'cm', 'in'];

const sizeOption = (product: Product) => product.options.find((o) => o.key === 'size');

function defaultOptions(product: Product) {
  return Object.fromEntries(
    product.options.map((o) => [o.key, (o.values.find((v) => v.isDefault) ?? o.values[0])?.value ?? '']),
  );
}

/** Same steps as the school's own order screen, with the school picked first. */
function stepsFor(product: Product | undefined): StepId[] {
  const hasOptions = Boolean(product?.options.some((o) => o.key !== 'size'));
  return ['school', 'product', 'size', ...(hasOptions ? (['options'] as const) : []), 'quantity', 'review'];
}

function StepBar({ steps, current, reached, onGo }: { steps: StepId[]; current: StepId; reached: number; onGo: (s: StepId) => void }) {
  const index = steps.indexOf(current);
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 sm:gap-3" aria-label="Progress">
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
              {STEP_LABEL[step]}
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
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  desc?: ReactNode;
  aside?: ReactNode;
  icon?: ReactNode;
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
        'flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
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

function Stepper({ id, value, onChange, step = 1 }: { id: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div className="flex w-full max-w-60 items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onChange(Math.max(1, value - step))} aria-label="Less">
        <IconMinus />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        className="text-center text-base font-semibold tabular-nums"
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
      />
      <Button variant="outline" size="icon" onClick={() => onChange(value + step)} aria-label="More">
        <IconPlus />
      </Button>
    </div>
  );
}

const fromPrice = (product: Product) => {
  const tiers = product.pricing.institution.tiers;
  return tiers.length ? Math.min(...tiers.map((t) => t.unitPrice)) : null;
};

const addressLine = (i: Institution) => [i.address?.line1, i.address?.city, i.address?.pincode].filter(Boolean).join(', ');

export default function InstitutionOrderPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const institutionId = params.get('institution') ?? '';
  const { data: institution } = useInstitution(institutionId);
  const { data: products, isLoading } = useInstitutionProducts();
  const createOrder = useCreateInstitutionOrder();

  const product = products?.find((p) => p.slug === params.get('product'));
  const steps = stepsFor(product);
  const [step, setStep] = useState<StepId>('school');
  // Furthest step reached, so finished steps can be revisited from the step bar.
  const [reached, setReached] = useState(0);

  const [size, setSize] = useState(STANDARD);
  const [custom, setCustom] = useState({ width: '', height: '', unit: 'mm' as SizeUnit });
  const [options, setOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [copies, setCopies] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  // One key per order being built, so a double click or retry never creates two orders.
  const idempotencyKey = useRef(newIdempotencyKey());

  // A product chosen resets the configuration to its defaults.
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
    setInstructions('');
    idempotencyKey.current = newIdempotencyKey();
  }, [product]);

  // Arriving from an institution's page skips the school picker.
  useEffect(() => {
    if (institution?.status === 'approved' && step === 'school' && reached === 0) {
      setStep(product ? 'size' : 'product');
      setReached(product ? 2 : 1);
    }
  }, [institution]);

  const isPageBased = product?.unit === 'page';
  const isCustom = size === CUSTOM;
  const quoteInput = useMemo<InstitutionQuoteInput | null>(
    () =>
      product && institution?.status === 'approved'
        ? isPageBased
          ? { institutionId: institution._id, productId: product._id, options, pageCount, copies, method }
          : { institutionId: institution._id, productId: product._id, options, quantity, method }
        : null,
    [product, institution, isPageBased, options, pageCount, copies, quantity, method],
  );
  const debounced = useDebouncedValue(quoteInput, 250);
  const { data: quote, isFetching } = useInstitutionQuote(debounced);
  const stale = debounced !== quoteInput;

  if (isLoading || (institutionId && !institution)) return <PageLoader />;

  const approved = institution?.status === 'approved';
  const go = (next: StepId) => {
    setStep(next);
    setReached((r) => Math.max(r, steps.indexOf(next)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => go(steps[steps.indexOf(step) + 1]!);
  const back = () => go(steps[steps.indexOf(step) - 1]!);

  const pickInstitution = (i: Institution) => {
    setParams((p) => ({ ...Object.fromEntries(p), institution: i._id }), { replace: true });
    setMethod('pickup');
    idempotencyKey.current = newIdempotencyKey();
    go('product');
  };
  const pickProduct = (p: Product) => {
    setParams({ institution: institutionId, product: p.slug }, { replace: true });
    setReached((r) => Math.max(r, 2));
    setStep('size');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const customValid = !isCustom || (Number(custom.width) > 0 && Number(custom.height) > 0);
  const unit = (count: number) => (product ? unitLabel(product.unit, count) : '');
  const quoteErrors = (quote?.errors ?? []).map((e) => e.message);
  const quoteValid = Boolean(quote?.valid) && !stale;
  const priceOnRequest = Boolean(quote?.requiresQuote) || isCustom;

  const sizeLabel = (() => {
    if (!product) return '';
    if (isCustom) return `${custom.width || '?'} × ${custom.height || '?'} ${custom.unit}`;
    const value = sizeOption(product)?.values.find((v) => v.value === size);
    return value ? en(value.label) : product.specs[0] ?? 'Standard';
  })();
  const otherOptions = quote?.selectedOptions.filter((o) => o.key !== 'size') ?? [];
  const qtyLabel = isPageBased
    ? `${formatNumber(pageCount)} ${unitLabel('page', pageCount)} × ${formatNumber(copies)} ${unitLabel('copy', copies)}`
    : `${formatNumber(quantity)} ${unit(quantity)}`;

  const deliveryAvailable = Boolean(institution?.address?.line1);
  const totals = quote?.totals;

  const canContinue =
    step === 'school'
      ? approved
      : step === 'size'
        ? customValid
        : step === 'options'
          ? Boolean(quote) && !quote?.errors.some((e) => e.code.startsWith('OPTION'))
          : step === 'quantity'
            ? quoteValid
            : true;

  const submit = async (asQuote: boolean) => {
    if (!product || !quote || !institution) return;
    let orderId = '';
    const ok = await confirmAction({
      title: asQuote ? `Send a quote request for ${institution.name}?` : `Place this order for ${institution.name}?`,
      description: asQuote
        ? `${en(product.name)}, ${qtyLabel}. The shop sets the final price and the institution accepts it from its dashboard.`
        : `${en(product.name)}, ${qtyLabel}, total ${formatINR(totals?.total ?? 0)}. Invoiced on the institution's account; they are notified.`,
      confirmLabel: asQuote ? 'Request quote' : 'Place order',
      action: async () => {
        const order = await createOrder.mutateAsync({
          key: idempotencyKey.current,
          institutionId: institution._id,
          items: [
            {
              productId: product._id,
              options,
              ...(isPageBased ? { pageCount, copies } : { quantity }),
              notes: instructions.trim() || undefined,
              fileIds: [],
              ...(isCustom ? { customSize: { width: Number(custom.width), height: Number(custom.height), unit: custom.unit } } : {}),
            },
          ],
          fulfilment: { method },
          requestQuote: asQuote,
          reference: reference.trim() || undefined,
          customerNote: note.trim() || undefined,
          internalNote: internalNote.trim() || undefined,
        });
        orderId = order._id;
      },
      successTitle: asQuote ? 'Quote request created' : 'Order placed',
    });
    if (ok && orderId) navigate(`/orders/${orderId}`);
  };

  const summary = product && institution && step !== 'school' && step !== 'product' && (
    <Card className="gap-4 overflow-hidden pt-0">
      <div className="h-1 bg-primary" />
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Order summary</CardTitle>
        {(isFetching || stale) && <Spinner className="size-4" />}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 font-medium text-secondary-foreground">
          <IconSchool className="size-4 shrink-0" /> <span className="truncate">{institution.name}</span>
        </p>
        <div className="flex items-center gap-3">
          <ProductThumb product={product} className="size-12 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-brand-navy">{en(product.name)}</p>
            <p className="truncate text-xs text-muted-foreground">{en(product.category.name)}</p>
          </div>
        </div>
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Size</dt>
            <dd className="text-right font-medium">{sizeLabel}</dd>
          </div>
          {otherOptions.map((o) => (
            <div key={o.key} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{en(o.label)}</dt>
              <dd className="text-right font-medium">{en(o.valueLabel)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="text-right font-medium">{qtyLabel}</dd>
          </div>
        </dl>
        <Separator />
        {quote?.requiresQuote ? (
          <p className="rounded-lg bg-primary/8 p-3 font-medium text-primary">Price on request: the shop sets it.</p>
        ) : (
          quote && (
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Price per {unit(1)}</dt>
                <dd className="font-semibold tabular-nums">{formatINR(quote.unitPrice)}</dd>
              </div>
              {quote.fixedFees > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Extras</dt>
                  <dd className="tabular-nums">{formatINR(quote.fixedFees)}</dd>
                </div>
              )}
              {quote.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Discount ({quote.discountPercent}%)</dt>
                  <dd className="tabular-nums">−{formatINR(quote.discount)}</dd>
                </div>
              )}
              {step === 'review' && totals && totals.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="tabular-nums">{formatINR(totals.deliveryFee)}</dd>
                </div>
              )}
              {step === 'review' && totals && totals.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST ({totals.taxRate}%)</dt>
                  <dd className="tabular-nums">{formatINR(totals.tax)}</dd>
                </div>
              )}
              <div className="flex items-end justify-between pt-2">
                <dt className="font-semibold">{isCustom ? 'Estimate' : 'Total'}</dt>
                <dd className="text-2xl font-bold tracking-tight text-brand-navy tabular-nums">
                  {formatINR(step === 'review' ? (totals?.total ?? quote.subtotal) : quote.subtotal)}
                </dd>
              </div>
              {isCustom && <p className="text-xs text-muted-foreground">Custom sizes are priced by the shop; this is the listed-size estimate.</p>}
            </dl>
          )
        )}
        {quote?.nextTier && quote.valid && !priceOnRequest && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
            Order {formatNumber(quote.nextTier.minQty)} or more for {formatINR(quote.nextTier.unitPrice)} each.
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
              <IconCheck /> Place order
            </Button>
            <Button size="lg" variant="outline" className="w-full" disabled={!approved || !quoteValid || createOrder.isPending} onClick={() => void submit(true)}>
              <IconFileInvoice /> Request quote
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {priceOnRequest
                ? 'This needs a price from the shop, so it goes as a quote request. The institution accepts it from its dashboard.'
                : 'Placed orders start straight away and are invoiced on the institution’s account. A quote request lets the shop set the price first.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader title="School / college order" description="Place an order for an institution, the same way they do from their dashboard. Uses their school prices." />

      <StepBar steps={steps} current={step} reached={reached} onGo={go} />

      {step === 'school' ? (
        <div className="space-y-6">
          <InstitutionPicker selected={institution} onPick={pickInstitution} />
          {institution && !approved && (
            <Alert variant="warning">
              <IconClockHour4 />
              <AlertTitle>{institution.name} is {institution.status}</AlertTitle>
              <AlertDescription>Approve the institution first; orders use school prices, which only approved institutions get.</AlertDescription>
            </Alert>
          )}
        </div>
      ) : step === 'product' ? (
        <div className="space-y-6">
          <ProductPicker products={products ?? []} selected={product?._id} onPick={pickProduct} />
          <Button variant="outline" size="lg" onClick={back}>
            <IconArrowLeft /> Back
          </Button>
        </div>
      ) : (
        product &&
        institution && (
          <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {step === 'size' && (
                <>
                  <ProductDetails product={product} onChange={() => go('product')} />
                  <Card>
                    <CardHeader>
                      <CardTitle>Choose a size</CardTitle>
                      <p className="text-sm text-muted-foreground">Pick a listed size, or type in a custom one.</p>
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
                            title={en(v.label)}
                            aside={v.unitDelta ? `+${formatINR(v.unitDelta)}/${unit(1)}` : 'Included'}
                          />
                        ))
                      ) : (
                        <ChoiceCard
                          selected={size === STANDARD}
                          onSelect={() => setSize(STANDARD)}
                          title="Standard"
                          desc={product.specs.join(' · ') || 'The usual size for this product'}
                          aside="Included"
                        />
                      )}
                      <ChoiceCard
                        selected={isCustom}
                        onSelect={() => setSize(CUSTOM)}
                        icon={<IconRulerMeasure />}
                        title="Custom size"
                        desc="Type in the width and height"
                        aside="On quote"
                      />
                      {isCustom && (
                        <div className="space-y-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:grid-cols-[1fr_auto_1fr_120px] sm:gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="w">Width</Label>
                              <Input id="w" type="number" inputMode="decimal" min={0} value={custom.width} onChange={(e) => setCustom((c) => ({ ...c, width: e.target.value }))} />
                            </div>
                            <span className="pb-3 text-muted-foreground">×</span>
                            <div className="space-y-1.5">
                              <Label htmlFor="h">Height</Label>
                              <Input id="h" type="number" inputMode="decimal" min={0} value={custom.height} onChange={(e) => setCustom((c) => ({ ...c, height: e.target.value }))} />
                            </div>
                            <div className="col-span-3 flex gap-1 rounded-xl border bg-background p-1 sm:col-span-1" role="radiogroup" aria-label="Unit">
                              {SIZE_UNITS.map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  role="radio"
                                  aria-checked={custom.unit === u}
                                  onClick={() => setCustom((c) => ({ ...c, unit: u }))}
                                  className={cn('h-8 flex-1 rounded-lg text-sm font-semibold', custom.unit === u ? 'bg-brand-navy text-white' : 'text-muted-foreground hover:text-foreground')}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="flex gap-2 text-sm text-brand-navy/80">
                            <IconFileInvoice className="mt-0.5 size-4 shrink-0 text-primary" /> Custom sizes go as a quote request; the shop sets the price.
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
                    <CardTitle>Options for {en(product.name)}</CardTitle>
                    <p className="text-sm text-muted-foreground">Prices update as you choose.</p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {product.options
                      .filter((o) => o.key !== 'size')
                      .map((o) => (
                        <div key={o.key} className="space-y-2">
                          <Label>{en(o.label)}</Label>
                          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={en(o.label)}>
                            {o.values.map((v) => {
                              const on = options[o.key] === v.value;
                              return (
                                <button
                                  key={v.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => setOptions((cur) => ({ ...cur, [o.key]: v.value }))}
                                  className={cn(
                                    'rounded-xl border px-3.5 py-2 text-left text-sm transition-colors hover:border-primary/40',
                                    on && 'border-primary bg-primary/8 ring-2 ring-primary/20',
                                  )}
                                >
                                  <span className="font-semibold text-brand-navy">{en(v.label)}</span>
                                  {(v.unitDelta > 0 || v.fixedFee > 0) && (
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                      {v.unitDelta > 0 ? `+${formatINR(v.unitDelta)}/${unit(1)}` : `+${formatINR(v.fixedFee)}`}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
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
                      <CardTitle>Check the order</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y text-sm">
                      {[
                        { label: 'School', value: institution.name, to: 'school' as const },
                        { label: 'Product', value: en(product.name), to: 'product' as const },
                        { label: 'Size', value: sizeLabel, to: 'size' as const },
                        ...(steps.includes('options')
                          ? [{ label: 'Options', value: otherOptions.map((o) => `${en(o.label)}: ${en(o.valueLabel)}`).join(' · '), to: 'options' as const }]
                          : []),
                        { label: 'Quantity', value: qtyLabel, to: 'quantity' as const },
                      ].map((row) => (
                        <div key={row.to} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{row.label}</p>
                            <p className="font-medium text-brand-navy">{row.value}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => go(row.to)}>
                            <IconPencil /> Edit
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Instructions</CardTitle>
                      <p className="text-sm text-muted-foreground">The institution can add its files to this order from its dashboard, or hand them over at the shop.</p>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        id="instructions"
                        value={instructions}
                        maxLength={1000}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Class and section, names to print, colours…"
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Pickup or delivery</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                      <ChoiceCard
                        selected={method === 'pickup'}
                        onSelect={() => setMethod('pickup')}
                        icon={<IconBuildingStore />}
                        title="Pickup from shop"
                        desc="Someone from the institution collects it"
                      />
                      <ChoiceCard
                        selected={method === 'delivery'}
                        onSelect={() => setMethod('delivery')}
                        disabled={!deliveryAvailable}
                        icon={<IconTruckDelivery />}
                        title="Delivery"
                        desc={deliveryAvailable ? addressLine(institution) : 'No address on file for this institution'}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ref">Their reference / PO number</Label>
                        <Input id="ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-2026-14" />
                        <p className="text-xs text-muted-foreground">Printed on the invoice.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="note">Note from the institution</Label>
                        <Textarea id="note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-11" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="internal">
                          Internal note <span className="font-normal text-muted-foreground">(staff only)</span>
                        </Label>
                        <Textarea id="internal" value={internalNote} maxLength={2000} onChange={(e) => setInternalNote(e.target.value)} className="min-h-11" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" size="lg" onClick={back}>
                  <IconArrowLeft /> Back
                </Button>
                {step !== 'review' && (
                  <Button variant="brand" size="lg" onClick={next} disabled={!canContinue}>
                    Continue <IconArrowRight />
                  </Button>
                )}
              </div>
            </div>

            <aside className="xl:sticky xl:top-24">{summary}</aside>
          </div>
        )
      )}

      {step === 'school' && (
        <div className="mt-6 flex justify-end">
          <Button variant="brand" size="lg" onClick={() => go('product')} disabled={!canContinue}>
            Continue <IconArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function InstitutionPicker({ selected, onPick }: { selected?: Institution; onPick: (i: Institution) => void }) {
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q.trim(), 250);
  const { data, isFetching } = useInstitutions({ status: 'approved', q: query || undefined });
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Which school or college is this for?</CardTitle>
        <p className="text-sm text-muted-foreground">Only approved institutions are listed; they get school prices.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email or city" className="pl-9" />
          {isFetching && <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2" />}
        </div>
        {selected && !items.some((i) => i._id === selected._id) && (
          <ChoiceCard selected onSelect={() => onPick(selected)} icon={<IconSchool />} title={selected.name} desc={addressLine(selected) || selected.phone} />
        )}
        {items.length === 0 && !isFetching ? (
          <EmptyState icon={<IconSchool />} title="No approved institutions found" description={query ? 'Try another search.' : undefined} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
            {items.map((i) => (
              <ChoiceCard
                key={i._id}
                selected={selected?._id === i._id}
                onSelect={() => onPick(i)}
                icon={<IconSchool />}
                title={i.name}
                desc={[i.contactName, i.phone, i.address?.city].filter(Boolean).join(' · ')}
                aside={i.extraDiscountPercent ? `−${i.extraDiscountPercent}%` : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductPicker({ products, selected, onPick }: { products: Product[]; selected?: string; onPick: (p: Product) => void }) {
  if (products.length === 0) return <EmptyState icon={<IconPackage />} title="No products are offered to schools yet" />;

  // Group by category, keeping the catalogue order.
  const groups = new Map<string, { name: string; items: Product[] }>();
  for (const p of products) {
    const g = groups.get(p.category._id) ?? { name: en(p.category.name), items: [] };
    g.items.push(p);
    groups.set(p.category._id, g);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-brand-navy">What would they like printed?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Prices shown are school prices, before any extra discount.</p>
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
                    'group flex items-center gap-4 rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-primary/40',
                    selected === p._id && 'border-primary ring-2 ring-primary/20',
                  )}
                >
                  <ProductThumb product={p} className="size-14 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-brand-navy">{en(p.name)}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{en(p.shortDescription)}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-primary">
                        {from !== null ? `From ${formatINR(from)}/${unitLabel(p.unit, 1)}` : 'Price on quote'}
                      </span>
                      {book.minQty > 1 && <span className="text-muted-foreground">Min {formatNumber(book.minQty)} {unitLabel(p.unit, book.minQty)}</span>}
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
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row">
        <ProductThumb product={product} className="aspect-square w-full shrink-0 sm:size-36" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-primary">{en(product.category.name)}</p>
              <h2 className="text-xl font-bold text-brand-navy sm:text-2xl">{en(product.name)}</h2>
            </div>
            <Button variant="outline" size="sm" onClick={onChange}>
              Change
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{en(product.shortDescription)}</p>
          <div className="flex flex-wrap gap-2">
            {product.specs.map((s) => (
              <Badge key={s} variant="outline">{s}</Badge>
            ))}
            <Badge variant="outline">
              <IconClockHour4 /> {product.leadTimeDays} working day{product.leadTimeDays === 1 ? '' : 's'}
            </Badge>
            {product.workflow === 'design' && (
              <Badge variant="outline">
                <IconPalette /> Design proof included
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
  const book = product.pricing.institution;
  const unit = (count: number) => unitLabel(product.unit, count);
  // Tier prices with the chosen options included, so they match the summary.
  const delta = quote?.optionUnitDelta ?? 0;
  const tiers = [...book.tiers].sort((a, b) => a.minQty - b.minQty);
  // Each price break is a natural quantity to suggest.
  const presets = [...new Set(tiers.map((tier) => tier.minQty))];
  const activeTier = quote ? [...tiers].reverse().find((t) => quote.units >= t.minQty) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>How many?</CardTitle>
        {book.minQty > 1 && <p className="text-sm text-muted-foreground">Minimum order {formatNumber(book.minQty)} {unit(book.minQty)}</p>}
      </CardHeader>
      <CardContent className="space-y-6">
        {isPageBased ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pages">Pages per copy</Label>
              <Stepper id="pages" value={pageCount} onChange={setPageCount} step={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="copies">Copies</Label>
              <Stepper id="copies" value={copies} onChange={setCopies} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="qty" className="capitalize">{unit(2)}</Label>
            <Stepper id="qty" value={quantity} onChange={setQuantity} step={book.minQty >= 50 ? 10 : 1} />
            {presets.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Quick pick</span>
                {presets.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(q)}
                    className={cn(
                      'rounded-full border bg-muted px-3 py-1 text-sm font-semibold tabular-nums transition-colors hover:border-primary/50',
                      quantity === q ? 'border-primary bg-primary/8 text-primary' : 'border-transparent text-brand-navy',
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
          <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/40 text-center">
            <div className="p-3">
              <p className="text-xs text-muted-foreground">Per {unit(1)}</p>
              <p className="mt-0.5 text-lg font-bold text-brand-navy tabular-nums">{formatINR(quote.unitPrice)}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="mt-0.5 text-lg font-bold text-brand-navy tabular-nums">{formatNumber(quote.units)}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground">Total</p>
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

        {tiers.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-navy">Price breaks</p>
            <div className="overflow-hidden rounded-xl border text-sm">
              {tiers.map((tier, i) => {
                const upTo = tiers[i + 1] ? tiers[i + 1]!.minQty - 1 : null;
                const on = activeTier === tier;
                return (
                  <div key={tier.minQty} className={cn('flex justify-between px-4 py-2 not-last:border-b', on && 'bg-primary/8 font-semibold text-primary')}>
                    <span className="tabular-nums">
                      {formatNumber(tier.minQty)}
                      {upTo === null ? '+' : upTo > tier.minQty ? `–${formatNumber(upTo)}` : ''} {unit(2)}
                    </span>
                    <span className="tabular-nums">{formatINR(tier.unitPrice + delta)} each</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
