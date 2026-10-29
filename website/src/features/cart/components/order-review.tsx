import { IconAlertCircle, IconBuildingStore, IconCash, IconCreditCard, IconFileText, IconMessage, IconPencil, IconTruckDelivery, IconUser } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { Address, PublicSettings, Quote } from '@/types/api';
import type { CartItem } from '../cart-store';
import { CartThumb, DesignBadge } from './cart-line';

function EditButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" className="text-primary" onClick={onClick}>
      <IconPencil /> {t('common.edit')}
    </Button>
  );
}

/** One thing the customer chose (pickup, payment, contact, note), with a way back to change it. */
function Tile({ icon, label, onEdit, children }: { icon: ReactNode; label: string; onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 rounded-xl bg-secondary/50 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="pt-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
          <button type="button" onClick={onEdit} className="-mt-0.5 shrink-0 text-xs font-semibold text-primary hover:underline">
            {t('common.edit')}
          </button>
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** Everything about the order on one screen, so the customer can check it before placing it. */
export function OrderReview({
  lines,
  method,
  address,
  payment,
  note,
  contact,
  settings,
  onEditItems,
  onEditDetails,
}: {
  lines: { item: CartItem; quote?: Quote; amount: number }[];
  method: 'pickup' | 'delivery';
  address: Address;
  payment: 'online' | 'counter';
  note: string;
  contact: { name?: string; phone?: string; email?: string };
  settings: PublicSettings;
  onEditItems: () => void;
  onEditDetails: () => void;
}) {
  const { t } = useTranslation();
  const l = useLocalized();

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <h2 className="font-semibold">
            {t('checkout.itemsTitle')} <span className="text-muted-foreground">({lines.length})</span>
          </h2>
          <EditButton onClick={onEditItems} />
        </div>
        <ul className="divide-y">
          {lines.map(({ item, quote, amount }) => (
            <li key={item.id} className="flex gap-4 p-5 sm:p-6">
              <CartThumb item={item} className="size-16 sm:size-20" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="leading-snug font-semibold">
                      {l(item.name)}
                      <DesignBadge item={item} />
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                      {item.unit === 'page'
                        ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies ?? 1} ${t('units.copy', { count: item.copies ?? 1 })}`
                        : `${formatNumber(item.quantity ?? 0)} ${t(`units.${item.unit}`, { count: item.quantity ?? 0 })}`}
                      {quote && quote.valid && item.workflow !== 'quote' && (
                        <>
                          {' · '}
                          {formatINR(quote.unitPrice)} / {t(`units.${item.unit}`, { count: 1 })}
                          {quote.fixedFees > 0 && ` + ${formatINR(quote.fixedFees)}`}
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold tabular-nums">
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

                {item.files.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label={t('checkout.uploaded')}>
                    {item.files.map((f) => (
                      <li key={f.id} className="flex max-w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs">
                        <IconFileText className="size-4 shrink-0 text-primary" />
                        <span className="truncate font-medium">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatFileSize(f.size)}
                          {f.pageCount ? ` · ${t('upload.pages', { count: f.pageCount })}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {item.notes && (
                  <p className="rounded-lg border-l-2 border-brand-amber bg-brand-amber/5 px-3 py-2 text-sm whitespace-pre-line text-muted-foreground">{item.notes}</p>
                )}

                {quote && !quote.valid && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <IconAlertCircle className="size-4" />
                    {t(`product.errors.${quote.errors[0]?.code}`, {
                      ...quote.errors[0]?.params,
                      unitLabel: t(`units.${item.unit}`, { count: Number(quote.errors[0]?.params?.min ?? 2) }),
                    })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">{t('checkout.detailsTitle')}</h2>
        <div className="grid gap-3 *:min-w-0 sm:grid-cols-2">
          <Tile icon={method === 'delivery' ? <IconTruckDelivery /> : <IconBuildingStore />} label={t('checkout.receiveLabel')} onEdit={onEditDetails}>
            <p className="font-semibold">{method === 'delivery' ? t('checkout.delivery') : t('checkout.pickup')}</p>
            <p className="text-muted-foreground">
              {method === 'delivery'
                ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ')
                : [settings.shop.address, settings.shop.hours].filter(Boolean).join(' · ')}
            </p>
          </Tile>
          <Tile icon={payment === 'online' ? <IconCreditCard /> : <IconCash />} label={t('checkout.payment')} onEdit={onEditDetails}>
            <p className="font-semibold">{payment === 'online' ? t('checkout.payOnline') : t('checkout.payCounter')}</p>
            <p className="text-muted-foreground">{payment === 'online' ? t('checkout.payOnlineDesc') : t('checkout.payCounterDesc')}</p>
          </Tile>
          <Tile icon={<IconUser />} label={t('checkout.contact')} onEdit={onEditDetails}>
            <p className="truncate font-semibold">{contact.name || '—'}</p>
            {contact.phone && <p className="text-muted-foreground">+91 {contact.phone}</p>}
            {contact.email && <p className="truncate text-muted-foreground">{contact.email}</p>}
          </Tile>
          <Tile icon={<IconMessage />} label={t('checkout.yourNote')} onEdit={onEditDetails}>
            <p className="line-clamp-4 whitespace-pre-line text-muted-foreground">{note.trim() || t('checkout.noNote')}</p>
          </Tile>
        </div>
      </section>
    </div>
  );
}
