import { IconAlertCircle, IconBuildingStore, IconCash, IconCreditCard, IconFileText, IconPencil, IconTruckDelivery, IconUser } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { Address, PublicSettings, Quote } from '@/types/api';
import type { CartItem } from '../cart-store';
import { CartThumb } from './cart-line';

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <IconPencil /> {t('common.edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[140px_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
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
    <div className="space-y-6">
      <Section title={`${t('orders.items')} (${lines.length})`} onEdit={onEditItems}>
        <ul className="divide-y">
          {lines.map(({ item, quote, amount }) => (
            <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <CartThumb item={item} className="size-20" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="leading-snug font-semibold">{l(item.name)}</p>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {item.workflow === 'quote' ? <span className="text-sm text-primary">{t('product.quoteRequired')}</span> : formatINR(amount)}
                  </p>
                </div>
                <dl className="space-y-1.5">
                  <Detail label={t('product.quantity')}>
                    {item.unit === 'page'
                      ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies ?? 1} ${t('units.copy', { count: item.copies ?? 1 })}`
                      : `${formatNumber(item.quantity ?? 0)} ${t(`units.${item.unit}`, { count: item.quantity ?? 0 })}`}
                    {quote && quote.valid && item.workflow !== 'quote' && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        @ {formatINR(quote.unitPrice)}
                        {quote.fixedFees > 0 && ` + ${formatINR(quote.fixedFees)}`}
                      </span>
                    )}
                  </Detail>
                  {item.optionLabels.map((o) => (
                    <Detail key={l(o.label)} label={l(o.label)}>
                      {l(o.value)}
                    </Detail>
                  ))}
                  <Detail label={t('orders.files')}>
                    {item.files.length ? (
                      <ul className="space-y-1">
                        {item.files.map((f) => (
                          <li key={f.id} className="flex items-center gap-1.5">
                            <IconFileText className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{f.name}</span>
                            <span className="shrink-0 font-normal text-muted-foreground">
                              {formatFileSize(f.size)}
                              {f.pageCount ? ` · ${t('upload.pages', { count: f.pageCount })}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="font-normal text-muted-foreground">—</span>
                    )}
                  </Detail>
                  {item.notes && (
                    <Detail label={t('orders.notes')}>
                      <span className="font-normal whitespace-pre-line">{item.notes}</span>
                    </Detail>
                  )}
                </dl>
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
      </Section>

      <div className="grid items-start gap-6 *:min-w-0 md:grid-cols-2">
        <Section title={t('checkout.fulfilment')} onEdit={onEditDetails}>
          <div className="flex gap-3 text-sm">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              {method === 'delivery' ? <IconTruckDelivery className="size-5" /> : <IconBuildingStore className="size-5" />}
            </span>
            <div>
              <p className="font-semibold">{method === 'delivery' ? t('checkout.delivery') : t('checkout.pickup')}</p>
              <p className="text-muted-foreground">
                {method === 'delivery'
                  ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ')
                  : [settings.shop.address, settings.shop.hours].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </Section>
        <Section title={t('checkout.payment')} onEdit={onEditDetails}>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                {payment === 'online' ? <IconCreditCard className="size-5" /> : <IconCash className="size-5" />}
              </span>
              <div>
                <p className="font-semibold">{payment === 'online' ? t('checkout.payOnline') : t('checkout.payCounter')}</p>
                <p className="text-muted-foreground">{payment === 'online' ? t('checkout.payOnlineDesc') : t('checkout.payCounterDesc')}</p>
              </div>
            </div>
          </div>
        </Section>
        <Section title={t('checkout.contact')} onEdit={onEditDetails}>
          <div className="flex gap-3 text-sm">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              <IconUser className="size-5" />
            </span>
            <div>
              <p className="font-semibold">{contact.name || '—'}</p>
              {contact.phone && <p className="text-muted-foreground">+91 {contact.phone}</p>}
              {contact.email && <p className="text-muted-foreground">{contact.email}</p>}
            </div>
          </div>
        </Section>
        <Section title={t('checkout.note')} onEdit={onEditDetails}>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{note.trim() || '—'}</p>
        </Section>
      </div>
    </div>
  );
}
