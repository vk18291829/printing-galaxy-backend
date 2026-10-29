import {
  IconAlertTriangle,
  IconBuildingStore,
  IconCheck,
  IconClockHour4,
  IconCreditCard,
  IconFileInvoice,
  IconFileText,
  IconKey,
  IconMapPin,
  IconRepeat,
  IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageNav } from '@/components/common/page-nav';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useReorderStore } from '@/features/cart/reorder-store';
import { orderKeys, useAcceptQuote, useCancelOrder, useOrder } from '@/features/orders/api';
import { OrderProgress } from '@/features/orders/components/order-progress';
import { DataSheetCard } from '@/features/orders/components/data-sheet-card';
import { ProofReview } from '@/features/orders/components/proof-review';
import { payWithRazorpay } from '@/features/orders/razorpay';
import { usePublicSettings } from '@/features/settings/api';
import { openFile } from '@/features/uploads/upload-file';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { formatDate, formatFileSize, formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import type { UploadedFile } from '@/types/api';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const queryClient = useQueryClient();
  const { data: order, isLoading, error, refetch } = useOrder(id);
  const { data: settings } = usePublicSettings();
  const cancel = useCancelOrder(id);
  const navigate = useNavigate();
  const startReorder = useReorderStore((s) => s.start);
  const acceptQuote = useAcceptQuote(id);
  const [paying, setPaying] = useState(false);
  useDocumentTitle(order ? `${t('orders.order')} ${order.orderNumber}` : t('orders.title'));

  if (isLoading) return <PageLoader />;
  if (error || !order) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const refunded = order.payment.amountRefunded ?? 0;
  const netPaid = Math.max(0, order.payment.amountPaid - refunded);
  const due = Math.max(0, order.totals.total - netPaid);
  const canPay =
    due > 0 && settings?.payments.onlineEnabled && !['quote_pending', 'quote_sent', 'cancelled'].includes(order.status);
  const quoteSent = order.status === 'quote_sent';
  // A sent quote has its own Accept / Decline buttons.
  const canCancel = ['quote_pending', 'awaiting_payment', 'received'].includes(order.status);
  const awaitingPayment = order.status === 'awaiting_payment';
  const isDelivery = order.fulfilment.method === 'delivery';

  // Same items, options and quantities, straight to checkout: the cart is left as it is. Files are
  // not copied (each file belongs to one order); checkout asks for them again where they were used.
  const orderAgain = () => {
    if (order.audience === 'institution') {
      navigate(`/institution/orders/new?product=${order.items[0]?.productSlug ?? ''}`);
      return;
    }
    startReorder(
      { id: order._id, number: order.orderNumber },
      order.items.map((item) => ({
        productId: item.product,
        slug: item.productSlug,
        name: item.productName,
        icon: 'printer',
        unit: item.unit,
        workflow: item.workflow,
        options: Object.fromEntries(item.options.map((o) => [o.key, o.value])),
        optionLabels: item.options.map((o) => ({ label: o.label, value: o.valueLabel })),
        ...(item.unit === 'page' ? { pageCount: item.pageCount, copies: item.copies } : { quantity: item.quantity }),
        notes: item.notes,
        files: [],
        estimate: item.lineTotal,
      })),
      order.items.map((item) => item.files.length > 0),
    );
    navigate('/checkout?from=reorder');
  };

  const pay = async () => {
    setPaying(true);
    try {
      const paid = await payWithRazorpay(order._id, i18n.language);
      if (paid) toast.success(t('checkout.paymentSuccess'));
      await queryClient.invalidateQueries({ queryKey: orderKeys.all });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('nav.myOrders'), to: '/account/orders' }, { label: order.orderNumber }]} />

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-bold sm:text-3xl">{order.orderNumber}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment.status} />
            <span className="text-sm text-muted-foreground">
              {t('orders.placedOn', { date: formatDate(order.createdAt, i18n.language, true) })}
            </span>
            {order.reference && (
              <span className="text-sm text-muted-foreground">
                · {t('orders.reference')}: <span className="font-mono font-medium text-foreground">{order.reference}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={orderAgain}>
            <IconRepeat /> {t('orders.orderAgain')}
          </Button>
          {!['quote_pending', 'quote_sent', 'awaiting_payment', 'cancelled'].includes(order.status) && (
            <Button
              variant="outline"
              onClick={() =>
                void fetchFile(`/orders/${order._id}/invoice`, { fallbackName: `${order.orderNumber}.pdf`, mode: 'open' }).catch((e) =>
                  toast.error(getErrorMessage(e)),
                )
              }
            >
              <IconFileInvoice /> {t('orders.invoice')}
            </Button>
          )}
          {canPay && (
            <Button variant="brand" onClick={() => void pay()} disabled={paying}>
              {paying ? <Spinner className="size-4 text-current" /> : <IconCreditCard />}
              {t('orders.payNow', { amount: formatINR(due) })}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              disabled={cancel.isPending}
              onClick={() =>
                void confirmAction({
                  tone: 'danger',
                  title: t('confirm.cancelOrderTitle', { number: order.orderNumber }),
                  description: netPaid > 0 ? t('orders.cancelPaidConfirm', { amount: formatINR(netPaid) }) : t('orders.cancelConfirm'),
                  confirmLabel: t('orders.cancel'),
                  cancelLabel: t('confirm.keepOrder'),
                  action: () => cancel.mutateAsync(undefined),
                  successTitle: t('orders.cancelled'),
                })
              }
            >
              <IconX /> {t('orders.cancel')}
            </Button>
          )}
        </div>
      </header>

      {order.status === 'quote_pending' && (
        <Alert variant="info" className="mb-6">
          <IconClockHour4 />
          <AlertDescription className="text-foreground">{t(order.quote?.requested ? 'orders.quoteInReview' : 'orders.awaitingQuote')}</AlertDescription>
        </Alert>
      )}

      {quoteSent && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl shadow-card border-primary/40 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex gap-3">
            <IconFileInvoice className="mt-0.5 size-6 shrink-0 text-primary" />
            <div>
              <p className="text-lg font-bold text-brand-navy">{t('orders.quoteReadyTitle', { amount: formatINR(order.totals.total) })}</p>
              <p className="text-sm text-muted-foreground">
                {order.quote?.validUntil
                  ? t('orders.quoteReady', { date: formatDate(order.quote.validUntil, i18n.language) })
                  : t('orders.quoteReadyNoDate')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={cancel.isPending || acceptQuote.isPending}
              onClick={() =>
                void confirmAction({
                  tone: 'danger',
                  title: t('orders.declineQuoteTitle'),
                  description: t('orders.declineQuoteDesc'),
                  confirmLabel: t('orders.declineQuote'),
                  cancelLabel: t('confirm.keepOrder'),
                  action: () => cancel.mutateAsync('Quote declined by customer'),
                  successTitle: t('orders.quoteDeclined'),
                })
              }
            >
              <IconX /> {t('orders.declineQuote')}
            </Button>
            <Button
              variant="brand"
              disabled={cancel.isPending || acceptQuote.isPending}
              onClick={() =>
                void confirmAction({
                  title: t('orders.acceptQuoteTitle', { amount: formatINR(order.totals.total) }),
                  description: t('orders.acceptQuoteDesc'),
                  confirmLabel: t('orders.acceptQuote'),
                  action: () => acceptQuote.mutateAsync(),
                  successTitle: t('orders.quoteAccepted'),
                  successDescription: t('orders.quoteAcceptedNext'),
                })
              }
            >
              <IconCheck /> {t('orders.acceptQuote')}
            </Button>
          </div>
        </div>
      )}

      {awaitingPayment && (
        <Alert variant="warning" className="mb-6">
          <IconCreditCard />
          <AlertTitle>{t('orders.awaitingPaymentTitle')}</AlertTitle>
          <AlertDescription className="text-foreground">
            {t('orders.awaitingPayment', {
              amount: formatINR(due),
              time: order.payment.dueBy ? formatDate(order.payment.dueBy, i18n.language, true) : '—',
            })}
          </AlertDescription>
        </Alert>
      )}

      {order.status === 'cancelled' && order.cancelReason?.startsWith('Online payment was not received') && (
        <Alert variant="destructive" className="mb-6">
          <IconAlertTriangle />
          <AlertDescription>{t('orders.autoCancelled')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {order.audience === 'institution' &&
            order.items.map((item) => <DataSheetCard key={item._id} order={order} item={item} />)}
          <Card>
            <CardHeader>
              <CardTitle>{t('orders.items')}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {order.items.map((item) => (
                <div key={item._id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <DynamicIcon name="printer" className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{l(item.productName)}</p>
                        <p className="font-bold tabular-nums">
                          {order.status === 'quote_pending' && item.workflow === 'quote' ? '—' : formatINR(item.lineTotal)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.unit === 'page'
                          ? `${formatNumber(item.pageCount ?? 0)} ${t('units.page', { count: item.pageCount ?? 0 })} × ${item.copies} ${t('units.copy', { count: item.copies })}`
                          : `${formatNumber(item.quantity)} ${t(`units.${item.unit}`, { count: item.quantity })}`}
                      </p>
                      {item.customSize && (
                        <p className="text-xs text-muted-foreground">
                          {t('orders.customSize')}: {item.customSize.width} × {item.customSize.height} {t(`newOrder.sizeUnits.${item.customSize.unit}`)}
                        </p>
                      )}
                      {item.options.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {item.options.map((o) => `${l(o.label)}: ${l(o.valueLabel)}`).join(' · ')}
                        </p>
                      )}
                      {item.notes && <p className="mt-1 text-xs text-muted-foreground italic">“{item.notes}”</p>}
                    </div>
                  </div>
                  {item.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-16">
                      {item.files.map((f) => {
                        const file = f as UploadedFile;
                        if (typeof f === 'string' || file.status === 'deleted') return null;
                        return (
                          <button
                            key={file._id}
                            onClick={() => void openFile(file._id).catch((e) => toast.error(getErrorMessage(e)))}
                            className="flex items-center gap-1.5 rounded-lg shadow-card px-2.5 py-1.5 text-xs hover:bg-accent"
                          >
                            <IconFileText className="size-3.5" />
                            <span className="max-w-40 truncate">{file.originalName}</span>
                            <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="sm:pl-16">
                    <ProofReview orderId={order._id} item={item} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('orders.fulfilment')}</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 text-sm">
              {order.fulfilment.method === 'delivery' ? (
                <>
                  <IconMapPin className="size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{t('orders.deliverTo')}</p>
                    <p className="text-muted-foreground">
                      {[order.fulfilment.address?.line1, order.fulfilment.address?.line2, order.fulfilment.address?.city, order.fulfilment.address?.state, order.fulfilment.address?.pincode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <IconBuildingStore className="size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{t('orders.pickupAt')}</p>
                    {settings?.shop.address && <p className="text-muted-foreground">{settings.shop.address}</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          {order.handoverCode && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconKey className="size-5 text-primary" />
                  {t(isDelivery ? 'orders.handoverDeliveryTitle' : 'orders.handoverPickupTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-mono text-4xl font-bold tracking-[0.35em] tabular-nums" aria-live="polite">
                  {order.handoverCode}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(isDelivery ? 'orders.handoverDeliveryDesc' : 'orders.handoverPickupDesc')}
                </p>
              </CardContent>
            </Card>
          )}
          {order.status !== 'cancelled' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('orders.timeline')}</CardTitle>
                {order.dueDate && !['quote_pending', 'quote_sent', 'awaiting_payment', 'delivered', 'picked_up'].includes(order.status) && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <IconClockHour4 className="size-4 text-primary" />
                    {t('orders.readyBy', { date: formatDate(order.dueDate, i18n.language) })}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <OrderProgress order={order} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                <span className="tabular-nums">{formatINR(order.totals.subtotal)}</span>
              </div>
              {order.totals.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('checkout.deliveryFee')}</span>
                  <span className="tabular-nums">{formatINR(order.totals.deliveryFee)}</span>
                </div>
              )}
              {order.totals.tax > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('checkout.tax', { rate: order.totals.taxRate })}</span>
                  <span className="tabular-nums">{formatINR(order.totals.tax)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>{t('orders.total')}</span>
                <span className="text-lg tabular-nums">{formatINR(order.totals.total)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>{t('orders.paid')}</span>
                <span className="tabular-nums">{formatINR(order.payment.amountPaid)}</span>
              </div>
              {refunded > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('status.payment.refunded')}</span>
                  <span className="tabular-nums">−{formatINR(refunded)}</span>
                </div>
              )}
              {order.refunds && order.refunds.length > 0 && (
                <div className="mt-2 space-y-1.5 rounded-lg shadow-card p-3">
                  <p className="text-xs font-semibold">{t('orders.refunds')}</p>
                  {order.refunds.map((r) => (
                    <div key={r._id} className="flex justify-between text-xs">
                      <span className={r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                        {t(r.status === 'refunded' ? 'orders.refundDone' : r.status === 'failed' ? 'orders.refundFailed' : 'orders.refundPending')}
                        {' · '}
                        {formatDate(r.createdAt, i18n.language)}
                      </span>
                      <span className="tabular-nums">{formatINR(r.amount)}</span>
                    </div>
                  ))}
                  {order.refunds.some((r) => r.provider === 'razorpay' && r.status === 'refund_pending') && (
                    <p className="pt-1 text-xs text-muted-foreground">{t('orders.refundEta')}</p>
                  )}
                </div>
              )}
              {due > 0 && order.status !== 'cancelled' && (
                <div className="flex justify-between font-semibold text-destructive">
                  <span>{t('orders.due')}</span>
                  <span className="tabular-nums">{formatINR(due)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
