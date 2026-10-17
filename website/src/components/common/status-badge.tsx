import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { OrderStatus, PaymentStatus } from '@/types/api';

type Variant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'soft' | 'outline';

const ORDER_VARIANT: Record<OrderStatus, Variant> = {
  quote_pending: 'warning',
  awaiting_payment: 'warning',
  received: 'info',
  proof_sent: 'warning',
  approved: 'soft',
  printing: 'soft',
  ready: 'success',
  out_for_delivery: 'info',
  delivered: 'success',
  picked_up: 'success',
  cancelled: 'destructive',
};

const PAYMENT_VARIANT: Record<PaymentStatus, Variant> = {
  pending: 'secondary',
  partial: 'warning',
  paid: 'success',
  refunded: 'outline',
  failed: 'destructive',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge variant={ORDER_VARIANT[status]}>{t(`status.order.${status}`)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return <Badge variant={PAYMENT_VARIANT[status]}>{t(`status.payment.${status}`)}</Badge>;
}
