import { IconAlertCircle, IconPaperclip, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { SafeImage } from '@/components/common/safe-image';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { Quote } from '@/types/api';
import { useCartStore, type CartItem } from '../cart-store';

export function CartThumb({ item, className = 'size-14' }: { item: Pick<CartItem, 'image' | 'icon'>; className?: string }) {
  return (
    <SafeImage
      src={item.image}
      alt=""
      className={`${className} shrink-0 rounded-lg shadow-card object-cover`}
      fallback={
        <span className={`${className} grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary`}>
          <DynamicIcon name={item.icon} className="size-7" stroke={1.6} />
        </span>
      }
    />
  );
}

/**
 * "Design 2" when the same product is in the cart more than once (two key chains with different
 * photos or sizes), so each one can be told apart; nothing for a single one.
 */
export function DesignBadge({ item }: { item: Pick<CartItem, 'id' | 'productId'> }) {
  const { t } = useTranslation();
  // Plain numbers from the store: a selector that returns a new array on every call makes the
  // store look changed each render and React loops until the page crashes.
  const count = useCartStore((s) => s.items.reduce((n, i) => n + (i.productId === item.productId ? 1 : 0), 0));
  const n = useCartStore((s) => s.items.filter((i) => i.productId === item.productId).findIndex((i) => i.id === item.id) + 1);
  // n is 0 for items checked out without the cart ("Order again").
  if (count < 2 || n < 1) return null;
  return (
    <span className="ml-1.5 inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-primary">
      {t('cart.design', { n })}
    </span>
  );
}

export function CartLine({
  item,
  quote,
  amount,
  onRemove,
  compact = false,
}: {
  item: CartItem;
  quote?: Quote;
  amount: number;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const qtyText =
    item.unit === 'page'
      ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies ?? 1} ${t('units.copy', { count: item.copies ?? 1 })}`
      : `${formatNumber(item.quantity ?? 0)} ${t(`units.${item.unit}`, { count: item.quantity ?? 0 })}`;

  return (
    <div className="flex gap-4 py-4">
      <CartThumb item={item} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/products/${item.slug}`} className="leading-snug font-semibold hover:text-primary">
            {l(item.name)}
          </Link>
          <DesignBadge item={item} />
          <span className="ml-auto shrink-0 font-bold tabular-nums">
            {item.workflow === 'quote' ? <span className="text-sm text-primary">{t('product.quoteRequired')}</span> : formatINR(amount)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {qtyText}
          {quote?.valid && !quote.requiresQuote && (
            <span className="tabular-nums">
              {' · '}
              {formatINR(quote.unitPrice)}/{t(`units.${item.unit}`, { count: 1 })}
              {quote.fixedFees > 0 && ` + ${formatINR(quote.fixedFees)}`}
            </span>
          )}
        </p>
        {!compact && item.optionLabels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {item.optionLabels.map((o) => `${l(o.label)}: ${l(o.value)}`).join(' · ')}
          </p>
        )}
        {!compact && item.notes && <p className="line-clamp-2 text-xs text-muted-foreground italic">“{item.notes}”</p>}
        <div className="flex items-center gap-4 pt-1">
          {item.files.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconPaperclip className="size-3.5" /> {t('cart.files', { count: item.files.length })}
            </span>
          )}
          {onRemove && (
            <button onClick={onRemove} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive">
              <IconTrash className="size-3.5" /> {t('common.remove')}
            </button>
          )}
        </div>
        {quote && !quote.valid && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <IconAlertCircle className="size-3.5" />
            {t(`product.errors.${quote.errors[0]?.code}`, {
              ...quote.errors[0]?.params,
              unitLabel: t(`units.${item.unit}`, { count: Number(quote.errors[0]?.params?.min ?? 2) }),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
