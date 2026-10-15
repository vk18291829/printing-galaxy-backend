import {
  IconArrowLeft,
  IconBuildingStore,
  IconClockHour4,
  IconCreditCard,
  IconFileText,
  IconMapPin,
  IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/common/status-badge';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { orderKeys, useCancelOrder, useOrder } from '@/features/orders/api';
import { OrderProgress } from '@/features/orders/components/order-progress';
import { ProofReview } from '@/features/orders/components/proof-review';
import { payWithRazorpay } from '@/features/orders/razorpay';
import { usePublicSettings } from '@/features/settings/api';
import { openFile } from '@/features/uploads/upload-file';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
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

  const due = Math.max(0, order.totals.total - order.payment.amountPaid);
  const canPay =
    due > 0 && settings?.payments.onlineEnabled && !['quote_pending', 'cancelled'].includes(order.status);
  const canCancel = ['quote_pending', 'received'].includes(order.status) && order.payment.amountPaid === 0;

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
    <div className="container-page max-w-5xl py-10">
      <Link to="/account/orders" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" /> {t('orders.back')}
      </Link>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-bold sm:text-3xl">{order.orderNumber}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment.status} />
            <span className="text-sm text-muted-foreground">
              {t('orders.placedOn', { date: formatDate(order.createdAt, i18n.language, true) })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPay && (
            <Button variant="brand" onClick={() => void pay()} disabled={paying}>
              {paying ? <Spinner className="size-4 text-current" /> : <IconCreditCard />}
              {t('orders.payNow', { amount: formatINR(due) })}
            </Button>
          )}
          {canCancel && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <IconX /> {t('orders.cancel')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('orders.cancel')}</DialogTitle>
                  <DialogDescription>{t('orders.cancelConfirm')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">{t('common.back')}</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    disabled={cancel.isPending}
                    onClick={() =>
                      cancel.mutate(undefined, {
                        onSuccess: () => toast.success(t('orders.cancelled')),
                        onError: (e) => toast.error(getErrorMessage(e)),
                      })
                    }
                  >
                    {cancel.isPending && <Spinner className="size-4 text-current" />}
                    {t('orders.cancel')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {order.status === 'quote_pending' && (
        <Alert variant="info" className="mb-6">
          <IconClockHour4 />
          <AlertDescription className="text-foreground">{t('orders.awaitingQuote')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
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
                            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent"
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
          {order.status !== 'cancelled' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('orders.timeline')}</CardTitle>
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
