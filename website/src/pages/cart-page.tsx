import {
  IconArrowRight,
  IconInfoCircle,
  IconLock,
  IconPaperclip,
  IconPencil,
  IconShieldCheck,
  IconShoppingBag,
  IconTrash,
  IconTruckDelivery,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { PageNav } from '@/components/common/page-nav';
import { QuantityStepper } from '@/components/common/quantity-stepper';
import { Rail } from '@/components/common/section';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCategories, useProducts } from '@/features/catalog/api';
import { ProductCard } from '@/features/catalog/components/product-card';
import { useCartStore, type CartItem } from '@/features/cart/cart-store';
import { CartThumb, DesignBadge } from '@/features/cart/components/cart-line';
import { EditItemDialog } from '@/features/cart/components/edit-item-dialog';
import { useCartQuotes } from '@/features/cart/use-cart-quotes';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Quote } from '@/types/api';
import { categoryHome } from '@/features/catalog/sections';

const RAIL_ITEM = 'w-[72%] min-[480px]:w-[46%] md:w-[31%] lg:w-[calc(25%-9px)]';

/** Cart → details → review; the cart page shows where the visitor is. */
function Steps() {
  const { t } = useTranslation();
  const steps = [t('cart.title'), t('checkout.steps.details'), t('checkout.steps.review')];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-6 place-items-center rounded-full text-xs font-semibold',
              i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className={cn('hidden sm:inline', i === 0 ? 'font-medium' : 'text-muted-foreground')}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-6 bg-border sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

function Line({ item, quote, amount, index }: { item: CartItem; quote?: Quote; amount: number; index: number }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const remove = useCartStore((s) => s.remove);
  const restore = useCartStore((s) => s.restore);
  const update = useCartStore((s) => s.update);
  const [editing, setEditing] = useState(false);
  const isPage = item.unit === 'page';
  const unitPrice = quote?.valid && quote.unitPrice ? `${formatINR(quote.unitPrice)} / ${t(`units.${item.unit}`, { count: 1 })}` : null;

  // Asks first; the toast still offers Undo in case of a slip.
  const removeItem = async () => {
    const ok = await confirmAction({
      tone: 'danger',
      title: t('confirm.removeItemTitle', { name: l(item.name) }),
      description: item.files.length ? t('confirm.removeItemDescFiles') : t('confirm.removeItemDesc'),
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    remove(item.id);
    toast(t('cart.removed', { name: l(item.name) }), {
      description: item.files.length ? t('cart.removeDescFiles') : undefined,
      action: { label: t('cart.undo'), onClick: () => restore(item, index) },
    });
  };

  return (
    <li className="flex gap-4 p-4 sm:gap-5 sm:p-5">
      <Link to={`/products/${item.slug}`} className="shrink-0">
        <CartThumb item={item} className="size-20 sm:size-28" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/products/${item.slug}`} className="leading-snug font-semibold hover:text-primary sm:text-lg">
              {l(item.name)}
            </Link>
            <DesignBadge item={item} />
            {unitPrice && <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{unitPrice}</p>}
          </div>
          <p className="shrink-0 text-right text-lg font-bold tabular-nums">
            {item.workflow === 'quote' ? <span className="text-sm font-semibold text-primary">{t('product.quoteRequired')}</span> : formatINR(amount)}
          </p>
        </div>

        {item.optionLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.optionLabels.map((o) => (
              <Badge key={l(o.label)} variant="secondary" className="font-normal">
                <span className="text-muted-foreground">{l(o.label)}:</span> {l(o.value)}
              </Badge>
            ))}
          </div>
        )}
        {(item.notes || item.files.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.files.length > 0 && (
              <span className="flex items-center gap-1">
                <IconPaperclip className="size-3.5" /> {t('cart.files', { count: item.files.length })}
              </span>
            )}
            {item.notes && <span className="line-clamp-1 italic">“{item.notes}”</span>}
          </div>
        )}
        {quote && !quote.valid && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <IconAlertCircle className="size-3.5" />
            {t(`product.errors.${quote.errors[0]?.code}`, {
              ...quote.errors[0]?.params,
              unitLabel: t(`units.${item.unit}`, { count: Number(quote.errors[0]?.params?.min ?? 2) }),
            })}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {/* Quantity right here; pages counted from a PDF stay as they are. */}
          <div className="w-36">
            <QuantityStepper
              value={isPage ? (item.copies ?? 1) : (item.quantity ?? 1)}
              onChange={(n) => update(item.id, isPage ? { copies: Math.max(1, n) } : { quantity: Math.max(1, n) })}
              min={1}
            />
          </div>
          {isPage && <span className="text-xs text-muted-foreground">{t('cart.copiesOf', { pages: formatNumber(item.pageCount ?? 0) })}</span>}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <IconPencil /> {t('cart.change')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void removeItem()} aria-label={t('cart.removeLabel', { name: l(item.name) })}>
              <IconTrash /> <span className="max-sm:sr-only">{t('common.remove')}</span>
            </Button>
          </div>
        </div>
      </div>
      <EditItemDialog item={item} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

/**
 * The full picture before checkout: every item, the subtotal, what pickup and delivery cost, GST
 * as the shop charges it, and the total. Delivery is chosen at checkout, so the total is for pickup.
 */
function OrderSummary({ lines, subtotal, loading }: { lines: { item: CartItem; amount: number }[]; subtotal: number; loading: boolean }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: settings } = usePublicSettings();
  const tax = settings?.tax;
  const delivery = settings?.delivery;
  const taxRate = tax?.enabled ? tax.rate : 0;
  const taxIncluded = Boolean(tax?.pricesIncludeTax);
  const taxAmount = taxRate ? Math.round((taxIncluded ? subtotal - subtotal / (1 + taxRate / 100) : (subtotal * taxRate) / 100) * 100) / 100 : 0;
  const total = subtotal + (taxIncluded ? 0 : taxAmount);
  const deliveryFree = delivery ? subtotal >= delivery.freeAbove : false;
  const files = lines.reduce((n, x) => n + x.item.files.length, 0);
  const qtyOf = (item: CartItem) =>
    item.unit === 'page'
      ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies ?? 1}`
      : `${formatNumber(item.quantity ?? 0)} ${t(`units.${item.unit}`, { count: item.quantity ?? 0 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('cart.summary')}</h2>
        {loading && <Spinner className="size-4" />}
      </div>

      <ul className="space-y-2.5 text-sm">
        {lines.map(({ item, amount }) => (
          <li key={item.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="line-clamp-1 font-medium">
                {l(item.name)}
                <DesignBadge item={item} />
              </span>
              <span className="block text-xs text-muted-foreground tabular-nums">{qtyOf(item)}</span>
            </span>
            <span className="shrink-0 tabular-nums">{item.workflow === 'quote' ? '—' : formatINR(amount)}</span>
          </li>
        ))}
      </ul>

      <Separator />
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
          <dd className="font-medium tabular-nums">{formatINR(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('checkout.pickup')}</dt>
          <dd className="text-success">{t('common.free')}</dd>
        </div>
        {delivery?.enabled && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('checkout.delivery')}</dt>
            <dd className="tabular-nums">{deliveryFree ? <span className="text-success">{t('common.free')}</span> : formatINR(delivery.fee)}</dd>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {t('checkout.tax', { rate: taxRate })} {taxIncluded && <span className="text-xs">({t('checkout.taxIncluded')})</span>}
            </dt>
            <dd className="tabular-nums">{formatINR(taxAmount)}</dd>
          </div>
        )}
        {files > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('cart.filesAttached')}</dt>
            <dd className="tabular-nums">{files}</dd>
          </div>
        )}
      </dl>
      <Separator />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-semibold">{t('cart.estimatedTotal')}</p>
          <p className="text-xs text-muted-foreground">{delivery?.enabled ? t('cart.totalForPickup') : t('cart.totalPickupOnly')}</p>
        </div>
        <span className="text-3xl font-bold tracking-tight tabular-nums">{formatINR(total)}</span>
      </div>
    </div>
  );
}

function FreeDeliveryMeter({ subtotal }: { subtotal: number }) {
  const { t } = useTranslation();
  const { data } = usePublicSettings();
  const delivery = data?.delivery;
  if (!delivery?.enabled || !delivery.freeAbove) return null;
  const left = Math.max(0, delivery.freeAbove - subtotal);
  const pct = Math.min(100, (subtotal / delivery.freeAbove) * 100);
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-3">
      <p className="flex items-center gap-2 text-sm">
        <IconTruckDelivery className={cn('size-4 shrink-0', left === 0 ? 'text-success' : 'text-muted-foreground')} />
        {left === 0 ? (
          <span className="font-medium text-success">{t('cart.freeDeliveryUnlocked')}</span>
        ) : (
          <span>{t('cart.freeDeliveryLeft', { amount: formatINR(left) })}</span>
        )}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className={cn('h-full rounded-full transition-all', left === 0 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Recommended({ exclude, title }: { exclude: Set<string>; title: string }) {
  const { data } = useProducts({ featured: true });
  const items = (data ?? []).filter((p) => !exclude.has(p.slug)).slice(0, 10);
  if (!items.length) return null;
  return (
    <section className="mt-14">
      <h2 className="mb-5 text-xl font-semibold tracking-tight">{title}</h2>
      <Rail label={title} itemClassName={RAIL_ITEM}>
        {items.map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </Rail>
    </section>
  );
}

function EmptyCart() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: categories } = useCategories();
  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('nav.home'), to: '/' }, { label: t('cart.title') }]} />
      <div className="flex flex-col items-center rounded-3xl shadow-card bg-card px-6 py-14 text-center">
        <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <IconShoppingBag className="size-8" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t('cart.empty')}</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{t('cart.emptyDesc')}</p>
        <Button size="lg" variant="brand" className="mt-6" asChild>
          <Link to="/products">
            {t('cart.browse')} <IconArrowRight />
          </Link>
        </Button>
        {categories && categories.length > 0 && (
          <div className="mt-10 w-full max-w-3xl">
            <p className="mb-3 text-sm font-medium text-muted-foreground">{t('products.browseCategories')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <Link
                  key={c._id}
                  to={categoryHome(c.slug)}
                  className="flex h-9 items-center gap-2 rounded-full bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <DynamicIcon name={c.icon} className="size-4" /> {l(c.name)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      <Recommended exclude={new Set()} title={t('home.highlightsTitle')} />
    </div>
  );
}

export default function CartPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('cart.title'));
  const items = useCartStore((s) => s.items);
  const { lines, subtotal, invalid, hasQuoteItems, loading } = useCartQuotes(items);

  if (items.length === 0) return <EmptyCart />;
  const trust = t('cart.trust', { returnObjects: true }) as string[];
  const trustIcons = [IconLock, IconShieldCheck, IconTruckDelivery];

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('nav.home'), to: '/' }, { label: t('cart.title') }]} />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('cart.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('cart.itemsCount', { count: items.length })}</p>
        </div>
        <Steps />
      </div>

      <div className="grid items-start gap-6 *:min-w-0 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <ul className="divide-y overflow-hidden rounded-2xl shadow-card bg-card">
          {lines.map(({ item, quote, amount }, index) => (
            <Line key={item.id} item={item} quote={quote} amount={amount} index={index} />
          ))}
        </ul>

        <aside className="space-y-4 md:sticky md:top-32">
          <div className="space-y-4 rounded-2xl shadow-card bg-card p-5 sm:p-6">
            <OrderSummary lines={lines} subtotal={subtotal} loading={loading} />
            <FreeDeliveryMeter subtotal={subtotal} />
            {hasQuoteItems && (
              <Alert variant="info">
                <IconInfoCircle />
                <AlertDescription className="text-foreground">{t('cart.quoteItems')}</AlertDescription>
              </Alert>
            )}
            {invalid && <p className="text-sm text-destructive">{t('cart.invalid')}</p>}
            <Button size="lg" variant="brand" className="w-full" disabled={invalid} asChild={!invalid}>
              {invalid ? (
                <span>{t('cart.checkout')}</span>
              ) : (
                <Link to="/checkout">
                  {t('cart.checkout')} <IconArrowRight />
                </Link>
              )}
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/products">{t('cart.continueShopping')}</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('cart.estimatedNote')}</p>
          </div>
          <ul className="grid gap-2.5 rounded-2xl shadow-card bg-card p-5 text-sm">
            {trust.map((line, i) => {
              const Icon = trustIcons[i % trustIcons.length]!;
              return (
                <li key={line} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
                    <Icon className="size-4" />
                  </span>
                  {line}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <Recommended exclude={new Set(items.map((i) => i.slug))} title={t('product.relatedTitle')} />
    </div>
  );
}
