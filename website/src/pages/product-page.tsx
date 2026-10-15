import {
  IconAlertCircle,
  IconBuildingCommunity,
  IconChevronRight,
  IconClock,
  IconLock,
  IconMinus,
  IconPalette,
  IconPlus,
  IconShoppingBagPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useAudience, useAuthStore } from '@/features/auth/auth-store';
import { useProduct, useQuote, type QuoteInput } from '@/features/catalog/api';
import { OptionPicker } from '@/features/catalog/components/option-picker';
import { PriceTierTable } from '@/features/catalog/components/price-tier-table';
import { useCartStore, type CartFile } from '@/features/cart/cart-store';
import { CardCropUploader } from '@/features/crop/card-crop-uploader';
import { DesignStudio, type AttachedDesign } from '@/features/design/design-studio';
import { DESIGN_FOR_SLUG } from '@/features/design/designs';
import { FileUploader } from '@/features/uploads/file-uploader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { Product, Quote } from '@/types/api';

function Stepper({
  value,
  onChange,
  min = 1,
  step = 1,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  id?: string;
}) {
  return (
    <div className="flex h-11 w-full max-w-[220px] items-center rounded-xl border bg-background">
      <button
        type="button"
        className="grid h-full w-11 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <IconMinus className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className="grid h-full w-11 place-items-center text-muted-foreground hover:text-foreground"
        onClick={() => onChange(value + step)}
        aria-label="Increase"
      >
        <IconPlus className="size-4" />
      </button>
    </div>
  );
}

function defaultOptions(product: Product) {
  return Object.fromEntries(
    product.options.map((o) => [o.key, (o.values.find((v) => v.isDefault) ?? o.values[0])?.value ?? '']),
  );
}

function PriceSummary({
  product,
  quote,
  loading,
  extraErrors,
  onAdd,
  canAdd,
}: {
  product: Product;
  quote?: Quote;
  loading: boolean;
  extraErrors: string[];
  onAdd: () => void;
  canAdd: boolean;
}) {
  const { t } = useTranslation();
  const unitLabel = (count: number) => t(`units.${product.unit}`, { count });
  const errors = [
    ...(quote?.errors.map((e) =>
      t(`product.errors.${e.code}`, { ...e.params, unitLabel: unitLabel(Number(e.params?.min ?? 2)) }),
    ) ?? []),
    ...extraErrors,
  ];
  const uniqueErrors = [...new Set(errors)];

  return (
    <Card className="gap-4 overflow-hidden pt-0">
      <div className="h-1 cmyk-strip" />
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('product.priceTitle')}</CardTitle>
        {loading && <Spinner className="size-4" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {quote?.requiresQuote ? (
          <div className="rounded-xl bg-primary/8 p-4">
            <p className="font-semibold text-primary">{t('product.quoteRequired')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('product.quoteHint')}</p>
          </div>
        ) : (
          quote && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('product.unitPrice')}</dt>
                <dd className="font-medium tabular-nums">{formatINR(quote.unitPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('product.units')}</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(quote.units)} {unitLabel(quote.units)}
                </dd>
              </div>
              {quote.fixedFees > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('product.extras')}</dt>
                  <dd className="font-medium tabular-nums">{formatINR(quote.fixedFees)}</dd>
                </div>
              )}
              {quote.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>{t('product.discount')}</dt>
                  <dd className="font-medium tabular-nums">−{formatINR(quote.discount)}</dd>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex items-end justify-between">
                <dt className="font-semibold">{t('product.subtotal')}</dt>
                <dd className="text-3xl font-bold tabular-nums">{formatINR(quote.subtotal)}</dd>
              </div>
            </dl>
          )
        )}

        {quote?.nextTier && quote.valid && !quote.requiresQuote && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
            {t('product.nextTier', { qty: formatNumber(quote.nextTier.minQty), price: formatINR(quote.nextTier.unitPrice) })}
          </p>
        )}

        {uniqueErrors.length > 0 && (
          <ul className="space-y-1.5">
            {uniqueErrors.map((e) => (
              <li key={e} className="flex items-start gap-2 text-sm text-destructive">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" /> {e}
              </li>
            ))}
          </ul>
        )}

        <Button size="lg" variant="brand" className="w-full" onClick={onAdd} disabled={!canAdd}>
          <IconShoppingBagPlus /> {t('product.addToCart')}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProductPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const l = useLocalized();
  const navigate = useNavigate();
  const location = useLocation();
  const audience = useAudience();
  const principal = useAuthStore((s) => s.principal);
  const addToCart = useCartStore((s) => s.add);
  const { data: product, isLoading, error, refetch } = useProduct(slug);

  const [options, setOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [copies, setCopies] = useState(1);
  const [manualPages, setManualPages] = useState(0);
  const [files, setFiles] = useState<CartFile[]>([]);
  const [notes, setNotes] = useState('');
  const [design, setDesign] = useState<AttachedDesign | null>(null);
  // Crop tool / design studio by default; plain upload for customers with a ready file.
  const [plainUpload, setPlainUpload] = useState(false);

  useDocumentTitle(product ? l(product.name) : undefined);

  const book = product ? (product.pricing[audience].enabled ? product.pricing[audience] : product.pricing.retail) : null;
  const audienceBlocked = product ? !product.pricing[audience].enabled : false;

  useEffect(() => {
    if (!product) return;
    setOptions(defaultOptions(product));
    const minQty = product.pricing[audience].enabled ? product.pricing[audience].minQty : product.pricing.retail.minQty;
    setQuantity(product.unit === 'page' ? 1 : minQty);
    setManualPages(product.unit === 'page' ? minQty : 0);
    setCopies(1);
    setFiles([]);
    setNotes('');
    setDesign(null);
    setPlainUpload(false);
  }, [product, audience]);

  const isPageBased = product?.unit === 'page';
  const pagesFromFiles =
    isPageBased && files.length > 0 && files.every((f) => f.pageCount)
      ? files.reduce((sum, f) => sum + (f.pageCount ?? 0), 0)
      : null;
  const pageCount = pagesFromFiles ?? manualPages;

  const quoteInput = useMemo<QuoteInput | null>(
    () =>
      product
        ? isPageBased
          ? { productId: product._id, options, pageCount, copies }
          : { productId: product._id, options, quantity }
        : null,
    [product, isPageBased, options, pageCount, copies, quantity],
  );
  const debouncedInput = useDebouncedValue(quoteInput, 250);
  const { data: quote, isFetching: quoting } = useQuote(debouncedInput);

  if (isLoading) return <PageLoader />;
  if (error || !product || !book) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error ?? new Error('Not found')} onRetry={() => void refetch()} />
      </div>
    );
  }

  const designKind = DESIGN_FOR_SLUG[product.slug];
  const useCropper = product.workflow === 'identity' && !plainUpload;
  const useStudio = Boolean(designKind) && !plainUpload;
  const allFiles = [...files, ...(design?.files ?? [])];
  const needsUpload = product.requiresUpload && product.workflow !== 'quote';
  const extraErrors = needsUpload && allFiles.length === 0 ? [t('product.errors.UPLOAD_REQUIRED')] : [];
  const stale = debouncedInput !== quoteInput;
  const canAdd = Boolean(quote?.valid) && extraErrors.length === 0 && !stale && !audienceBlocked;

  const handleAdd = () => {
    if (!quote) return;
    addToCart({
      productId: product._id,
      slug: product.slug,
      name: product.name,
      icon: product.icon,
      unit: product.unit,
      workflow: product.workflow,
      options,
      optionLabels: quote.selectedOptions.map((o) => ({ label: o.label, value: o.valueLabel })),
      ...(isPageBased ? { pageCount, copies } : { quantity }),
      notes: [design?.summary, notes.trim()].filter(Boolean).join('\n').slice(0, 1000) || undefined,
      files: allFiles,
      estimate: quote.subtotal,
    });
    toast.success(t('product.added'), {
      action: { label: t('product.goToCart'), onClick: () => navigate('/cart') },
    });
    setFiles([]);
    setNotes('');
    setDesign(null);
  };

  const signInButton = (
    <Button variant="outline" className="w-full" asChild>
      <Link to="/login" state={{ from: location.pathname }}>
        <IconLock /> {t('product.signInToUpload')}
      </Link>
    </Button>
  );

  const uploadCard = (
    <Card>
      <CardHeader>
        <CardTitle>
          {useStudio ? t('design.title') : useCropper ? t('crop.title') : t('product.upload')}{' '}
          {!needsUpload && !useStudio && <span className="text-sm font-normal text-muted-foreground">({t('common.optional')})</span>}
        </CardTitle>
        {useStudio ? (
          <p className="text-sm text-muted-foreground">{t('design.subtitle')}</p>
        ) : (
          !useCropper && l(product.uploadHint) && <p className="text-sm text-muted-foreground">{l(product.uploadHint)}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {useStudio && designKind ? (
          <DesignStudio
            kind={designKind}
            productId={product._id}
            options={options}
            attached={design}
            onAttach={setDesign}
            signIn={principal ? undefined : signInButton}
          />
        ) : !principal ? (
          signInButton
        ) : useCropper ? (
          <CardCropUploader productId={product._id} files={files} onChange={setFiles} />
        ) : (
          <FileUploader productId={product._id} accepted={product.acceptedFileTypes} files={files} onChange={setFiles} />
        )}
        {principal && (designKind || product.workflow === 'identity') && (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setPlainUpload((v) => !v)}>
            {plainUpload ? (designKind ? t('design.useStudio') : t('crop.useCropper')) : designKind ? t('design.orUpload') : t('crop.orUpload')}
          </button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container-page pt-6 sm:pt-8 lg:pb-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/products" className="hover:text-foreground">{t('nav.products')}</Link>
        <IconChevronRight className="size-4" />
        <Link to={`/products?category=${product.category.slug}`} className="hover:text-foreground">
          {l(product.category.name)}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-blue/15 to-brand-cyan/10 text-primary sm:size-20 sm:rounded-3xl">
              <DynamicIcon name={product.icon} className="size-7 sm:size-10" stroke={1.5} />
            </span>
            <div className="space-y-3">
              <h1 className="text-2xl font-bold min-[400px]:text-3xl sm:text-4xl">{l(product.name)}</h1>
              <p className="text-muted-foreground">{l(product.shortDescription)}</p>
              <div className="flex flex-wrap gap-2">
                {audience === 'institution' && product.pricing.institution.enabled && (
                  <Badge variant="success">
                    <IconBuildingCommunity /> {t('product.institutionPricing')}
                  </Badge>
                )}
                {product.specs.map((s) => (
                  <Badge key={s} variant="outline">{s}</Badge>
                ))}
                <Badge variant="outline">
                  <IconClock /> {t('product.leadTime')}:{' '}
                  {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
                </Badge>
              </div>
            </div>
          </header>

          {audienceBlocked && (
            <Alert variant="warning">
              <IconAlertCircle />
              <AlertDescription className="text-foreground">
                <p>{t('product.notAvailable')}</p>
                {audience === 'retail' && (
                  <Link to="/institutions" className="font-semibold text-primary hover:underline">
                    {t('product.retailNoteCta')} →
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          )}

          {product.workflow === 'design' && (
            <Alert variant="info">
              <IconPalette />
              <AlertDescription className="text-foreground">{t('product.designNote')}</AlertDescription>
            </Alert>
          )}
          {product.sensitive && (
            <Alert variant="success">
              <IconLock />
              <AlertDescription className="text-foreground">{t('product.sensitiveNote')}</AlertDescription>
            </Alert>
          )}

          {product.options.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('product.options')}</CardTitle>
              </CardHeader>
              <CardContent>
                <OptionPicker options={product.options} value={options} onChange={(k, v) => setOptions((o) => ({ ...o, [k]: v }))} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('product.quantity')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {isPageBased ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pages">{t('product.pages')}</Label>
                    {pagesFromFiles ? (
                      <div className="flex h-11 items-center gap-2 rounded-xl border bg-muted/50 px-3">
                        <span className="text-base font-semibold tabular-nums">{formatNumber(pagesFromFiles)}</span>
                        <span className="text-xs text-muted-foreground">{t('product.pagesFromFiles')}</span>
                      </div>
                    ) : (
                      <Stepper id="pages" value={manualPages} onChange={setManualPages} min={1} step={10} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copies">{t('product.copies')}</Label>
                    <Stepper id="copies" value={copies} onChange={setCopies} min={1} />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="qty" className="capitalize">{t(`units.${product.unit}`, { count: 2 })}</Label>
                  <Stepper id="qty" value={quantity} onChange={setQuantity} min={1} step={book.minQty >= 50 ? 10 : 1} />
                  {book.minQty > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {t('common.minOrder', { count: book.minQty, unit: t(`units.${product.unit}`, { count: book.minQty }) })}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {(product.requiresUpload || product.acceptedFileTypes.length > 0 || designKind) && uploadCard}

          <Card>
            <CardHeader>
              <CardTitle>
                <Label htmlFor="notes" className="text-base">{t('product.notes')}</Label>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                id="notes"
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('product.notesPlaceholder')}
              />
            </CardContent>
          </Card>

          {l(product.description) && <p className="leading-relaxed text-muted-foreground">{l(product.description)}</p>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <PriceSummary
            product={product}
            quote={quote}
            loading={quoting || stale}
            extraErrors={extraErrors}
            onAdd={handleAdd}
            canAdd={canAdd}
          />
          {book.tiers.length > 0 && (
            <PriceTierTable book={book} unit={product.unit} activeUnits={quote?.units} />
          )}
          {audience === 'retail' && product.pricing.institution.enabled && (
            <div className="rounded-2xl border border-dashed p-4 text-sm">
              <p className="text-muted-foreground">{t('product.retailNote')}</p>
              <Link to="/institutions" className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <IconBuildingCommunity className="size-4" /> {t('product.retailNoteCta')}
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* Phones & tablets: keep the price and the add button in reach while choosing options. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-xl sm:-mx-6 lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            {quote?.requiresQuote ? (
              <p className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('product.subtotal')}</p>
                <p className="truncate text-xl font-bold tabular-nums">
                  {quote ? formatINR(quote.subtotal) : '—'}
                  {(quoting || stale) && <Spinner className="ml-2 inline size-4" />}
                </p>
              </>
            )}
            {!canAdd && quote && (quote.errors[0] || extraErrors[0]) && (
              <p className="truncate text-xs text-destructive">
                {quote.errors[0]
                  ? t(`product.errors.${quote.errors[0].code}`, {
                      ...quote.errors[0].params,
                      unitLabel: t(`units.${product.unit}`, { count: Number(quote.errors[0].params?.min ?? 2) }),
                    })
                  : extraErrors[0]}
              </p>
            )}
          </div>
          <Button size="lg" variant="brand" className="shrink-0 px-4 sm:px-6" onClick={handleAdd} disabled={!canAdd}>
            <IconShoppingBagPlus /> <span className="max-[359px]:sr-only">{t('product.addToCart')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
