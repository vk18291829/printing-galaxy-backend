import {
  IconAlertCircle,
  IconBuildingCommunity,
  IconCircleCheck,
  IconClipboardList,
  IconClock,
  IconBrandWhatsapp,
  IconLock,
  IconPalette,
  IconPhone,
  IconSchool,
  IconShoppingBagPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageNav } from '@/components/common/page-nav';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { QuantityStepper as Stepper } from '@/components/common/quantity-stepper';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useAudience, useAuthStore } from '@/features/auth/auth-store';
import { sectionOf, useProduct, useQuote, type QuoteInput } from '@/features/catalog/api';
import { OptionPicker } from '@/features/catalog/components/option-picker';
import { ProductGallery } from '@/features/catalog/components/product-gallery';
import { PriceTierTable } from '@/features/catalog/components/price-tier-table';
import { RangeRails } from '@/features/catalog/components/range-rails';
import { RelatedProducts } from '@/features/catalog/components/related-products';
import { useCartStore, type CartFile } from '@/features/cart/cart-store';
import { CardCropUploader } from '@/features/crop/card-crop-uploader';
import { ProductReviews, RatingSummaryLink } from '@/features/reviews/product-reviews';
import { FileUploader } from '@/features/uploads/file-uploader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { breadcrumbLd, productLd } from '@/lib/seo';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Product, Quote } from '@/types/api';
import { categoryHome } from '@/features/catalog/sections';

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
  orderLink,
  inCart,
}: {
  product: Product;
  quote?: Quote;
  loading: boolean;
  extraErrors: string[];
  onAdd: () => void;
  canAdd: boolean;
  /** Institutions configure and place orders in the order builder instead of a cart. */
  orderLink?: string;
  /** How many of this product are already in the cart (each with its own photos and choices). */
  inCart: number;
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
                <dd className="text-2xl font-semibold tracking-tight sm:text-3xl tabular-nums">{formatINR(quote.subtotal)}</dd>
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

        {orderLink ? (
          <Button size="lg" variant="brand" className="w-full" asChild>
            <Link to={orderLink}>
              <IconClipboardList /> {t('product.orderThis')}
            </Link>
          </Button>
        ) : (
          <Button size="lg" variant="brand" className="w-full" onClick={onAdd} disabled={!canAdd}>
            <IconShoppingBagPlus /> {inCart > 0 ? t('product.addAnother') : t('product.addToCart')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Call or WhatsApp about this product: its own number, or the shop's. */
function ProductContact({ product }: { product: Product }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: settings } = usePublicSettings();
  const phone = product.contactPhone || settings?.shop.phone;
  const whatsapp = product.contactPhone || settings?.shop.whatsapp || settings?.shop.phone;
  if (!phone && !whatsapp) return null;
  const message = encodeURIComponent(t('product.whatsappMessage', { product: l(product.name) }));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl shadow-card bg-muted/50 px-3 py-2.5">
      <span className="mr-auto text-sm font-medium text-brand-navy">{t('product.questions')}</span>
      {phone && (
        <Button variant="outline" size="sm" asChild>
          <a href={`tel:+91${phone}`}>
            <IconPhone /> {t('product.call')}
          </a>
        </Button>
      )}
      {whatsapp && (
        <Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" asChild>
          <a href={`https://wa.me/91${whatsapp}?text=${message}`} target="_blank" rel="noopener noreferrer">
            <IconBrandWhatsapp /> WhatsApp
          </a>
        </Button>
      )}
    </div>
  );
}

/** Why this visitor can't order the product, with the way forward. */
function LockedCard({ forInstitutions, className }: { forInstitutions: boolean; className?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
      <div className={cn('rounded-2xl shadow-card bg-card/95 p-6 text-center backdrop-blur sm:p-8', className)}>
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          {forInstitutions ? <IconSchool className="size-7" /> : <IconLock className="size-7" />}
        </span>
        <h2 className="text-xl font-semibold">{t(forInstitutions ? 'product.lockedInstitutionTitle' : 'product.lockedRetailTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t(forInstitutions ? 'product.lockedInstitutionDesc' : 'product.lockedRetailDesc')}</p>
        {forInstitutions && (
          <ul className="mt-4 space-y-1.5 text-left text-sm">
            {(['schoolStep1', 'schoolStep2', 'schoolStep3'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> {t(`product.${k}`)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {forInstitutions ? (
            <>
              <Button asChild>
                <Link to="/login?tab=institution" state={{ from: location.pathname }}>
                  <IconBuildingCommunity /> {t('nav.institutionLogin')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/institutions/register">{t('institutions.register')}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild>
                <Link to="/institutions">{t('product.lockedSchoolProducts')}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/products">{t('nav.products')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
  );
}

/** Lock over a blurred page: a signed-in account of the other kind can't even browse it. */
function LockedOverlay({ forInstitutions }: { forInstitutions: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex justify-center px-2">
      <LockedCard forInstitutions={forInstitutions} className="sticky top-40 mt-16 h-fit w-full max-w-md border" />
    </div>
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
  const cartItems = useCartStore((s) => s.items);
  const { data: product, isLoading, error, refetch } = useProduct(slug);

  const [options, setOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [copies, setCopies] = useState(1);
  const [manualPages, setManualPages] = useState(0);
  const [files, setFiles] = useState<CartFile[]>([]);
  const [notes, setNotes] = useState('');
  // Crop tool by default; plain upload for customers with a ready file.
  const [plainUpload, setPlainUpload] = useState(false);

  // Search and share tags: the product's own photo, description, price range and breadcrumb.
  const seoPrices = product ? (product.pricing[sectionOf(product)].enabled ? product.pricing[sectionOf(product)].tiers.map((tier) => tier.unitPrice) : []) : [];
  const seoHome = product ? categoryHome(product.category.slug) : '/products';
  useDocumentTitle(product ? l(product.name) : undefined, {
    description: product ? `${l(product.shortDescription)} ${l(product.description)}`.trim() : undefined,
    image: product?.images[0],
    type: 'product',
    jsonLd: product
      ? [
          productLd(product, product.name.en, product.shortDescription?.en ?? '', seoPrices),
          breadcrumbLd([
            ...(seoHome.startsWith('/products') ? [{ name: 'Products', path: '/products' }] : []),
            { name: product.category.name.en, path: seoHome },
            { name: product.name.en, path: `/products/${product.slug}` },
          ]),
        ]
      : undefined,
  });

  const book = product ? (product.pricing[audience].enabled ? product.pricing[audience] : product.pricing[sectionOf(product)]) : null;
  // School products are for institutions only, everyday products for individuals only.
  const audienceBlocked = product ? !product.pricing[audience].enabled || !product.category.audiences?.includes(audience) : false;

  useEffect(() => {
    if (!product) return;
    setOptions(defaultOptions(product));
    const minQty = product.pricing[audience].enabled ? product.pricing[audience].minQty : product.pricing[sectionOf(product)].minQty;
    setQuantity(product.unit === 'page' ? 1 : minQty);
    setManualPages(product.unit === 'page' ? minQty : 0);
    setCopies(1);
    setFiles([]);
    setNotes('');
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

  const useCropper = product.workflow === 'identity' && !plainUpload;
  const needsUpload = product.requiresUpload && product.workflow !== 'quote';
  const inCart = cartItems.filter((i) => i.productId === product._id).length;
  const photosOnly = product.acceptedFileTypes.length > 0 && product.acceptedFileTypes.every((x) => ['jpg', 'jpeg', 'png', 'webp'].includes(x));
  const extraErrors = needsUpload && files.length === 0 ? [t('product.errors.UPLOAD_REQUIRED')] : [];
  const stale = debouncedInput !== quoteInput;
  // Guests may browse everything; only a signed-in account of the wrong kind gets the blurred lock.
  const locked = audienceBlocked && Boolean(principal);
  const canAdd = Boolean(quote?.valid) && extraErrors.length === 0 && !stale && !audienceBlocked;
  const orderLink = principal?.kind === 'institution' ? `/institution/orders/new?product=${product.slug}` : undefined;

  const handleAdd = () => {
    if (!quote) return;
    addToCart({
      productId: product._id,
      slug: product.slug,
      name: product.name,
      icon: product.icon,
      image: product.images[0],
      unit: product.unit,
      workflow: product.workflow,
      options,
      optionLabels: quote.selectedOptions.map((o) => ({ label: o.label, value: o.valueLabel })),
      ...(isPageBased ? { pageCount, copies } : { quantity }),
      notes: notes.trim() || undefined,
      files,
      estimate: quote.subtotal,
    });
    toast.success(t('product.added'), {
      description: t('toast.addedDesc', { product: l(product.name), price: formatINR(quote.subtotal) }),
      action: { label: t('product.goToCart'), onClick: () => navigate('/cart') },
    });
    setFiles([]);
    setNotes('');
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
          {useCropper ? t('crop.title') : t('product.upload')}{' '}
          {!needsUpload && <span className="text-sm font-normal text-muted-foreground">({t('common.optional')})</span>}
        </CardTitle>
        {!useCropper && l(product.uploadHint) && <p className="text-sm text-muted-foreground">{l(product.uploadHint)}</p>}
        {!useCropper && photosOnly && <p className="text-sm text-muted-foreground">{t('product.photosHint')}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!principal ? (
          signInButton
        ) : useCropper ? (
          <CardCropUploader productId={product._id} files={files} onChange={setFiles} />
        ) : (
          <FileUploader productId={product._id} accepted={product.acceptedFileTypes} files={files} onChange={setFiles} />
        )}
        {principal && product.workflow === 'identity' && (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setPlainUpload((v) => !v)}>
            {plainUpload ? t('crop.useCropper') : t('crop.orUpload')}
          </button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container-page pt-6 sm:pt-8 lg:pb-8">
      <PageNav
        items={
          sectionOf(product) === 'institution'
            ? [{ label: t('nav.institutions'), to: '/institutions' }, { label: l(product.name) }]
            : [
                ...(categoryHome(product.category.slug).startsWith('/products')
                  ? [{ label: t('nav.products'), to: '/products' }]
                  : []),
                { label: l(product.category.name), to: categoryHome(product.category.slug) },
                { label: l(product.name) },
              ]
        }
      />

      <div className="relative">
      {locked && <LockedOverlay forInstitutions={sectionOf(product) === 'institution'} />}
      <div
        className={cn('grid gap-8 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px]', locked && 'pointer-events-none max-h-[900px] overflow-hidden blur-md select-none')}
        aria-hidden={locked || undefined}
        inert={locked}
      >
        <div className="space-y-6">
          <header className="grid gap-6 *:min-w-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start">
            <ProductGallery product={product} />
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <DynamicIcon name={product.icon} className="size-4" /> {l(product.category.name)}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{l(product.name)}</h1>
              <RatingSummaryLink slug={product.slug} />
              <p className="text-lg leading-relaxed text-foreground/90">{l(product.shortDescription)}</p>
              {l(product.description) && <p className="text-base leading-relaxed text-foreground/75">{l(product.description)}</p>}
              <div className="flex flex-wrap gap-2">
                {audience === 'institution' && product.pricing.institution.enabled && (
                  <Badge variant="success">
                    <IconBuildingCommunity /> {t('product.institutionPricing')}
                  </Badge>
                )}
                {product.specs.map((s) => (
                  <Badge key={s} variant="outline">{s}</Badge>
                ))}
                {!audienceBlocked && sectionOf(product) === 'retail' && (
                  <Badge variant="outline">
                    <IconClock /> {t('product.leadTime')}:{' '}
                    {product.leadTimeDays === 0 ? t('products.sameDay') : t('products.leadTime', { count: product.leadTimeDays })}
                  </Badge>
                )}
              </div>
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
              <ProductContact product={product} />
            </div>
          </header>

          {!audienceBlocked && (
          <>
          {inCart > 0 && !orderLink && (
            <Alert variant="success">
              <IconShoppingBagPlus />
              <AlertDescription className="text-foreground">
                <span className="font-semibold">{t('product.inCartCount', { count: inCart })}</span> {t('product.makeAnother')}{' '}
                <Link to="/cart" className="font-medium text-primary underline-offset-4 hover:underline">{t('product.goToCart')}</Link>
              </AlertDescription>
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
                      <div className="flex h-11 items-center gap-2 rounded-xl shadow-card bg-muted/50 px-3">
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

          {(product.requiresUpload || product.acceptedFileTypes.length > 0) && uploadCard}

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
          </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          {audienceBlocked ? (
            <LockedCard forInstitutions={sectionOf(product) === 'institution'} className="p-5 sm:p-6" />
          ) : (
            <PriceSummary
              product={product}
              quote={quote}
              loading={quoting || stale}
              extraErrors={extraErrors}
              onAdd={handleAdd}
              canAdd={canAdd}
              orderLink={orderLink}
              inCart={inCart}
            />
          )}
          {!audienceBlocked && book.tiers.length > 0 && (
            <PriceTierTable book={book} unit={product.unit} activeUnits={quote?.units} />
          )}
        </aside>
      </div>

      </div>

      {!locked && (
        <>
          <ProductReviews slug={product.slug} />
          <RelatedProducts product={product} />
          <RangeRails product={product} />
        </>
      )}

      {/* Phones & tablets: keep the price and the add button in reach while choosing options. */}
      <div className={cn('sticky bottom-0 z-30 -mx-4 mt-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:-mx-6 lg:hidden', audienceBlocked && 'hidden')}>
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
          {orderLink ? (
            <Button size="lg" variant="brand" className="shrink-0 px-4 sm:px-6" asChild>
              <Link to={orderLink}>
                <IconClipboardList /> <span className="max-[359px]:sr-only">{t('product.orderThis')}</span>
              </Link>
            </Button>
          ) : (
            <Button size="lg" variant="brand" className="shrink-0 px-4 sm:px-6" onClick={handleAdd} disabled={!canAdd}>
              <IconShoppingBagPlus /> <span className="max-[359px]:sr-only">{inCart > 0 ? t('product.addAnother') : t('product.addToCart')}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
