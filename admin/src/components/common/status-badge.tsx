import { Badge } from '@/components/ui/badge';
import type { InstitutionStatus, OrderStatus, PaymentStatus } from '@/types/api';

type Variant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'soft' | 'outline';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  quote_pending: 'Needs quote',
  awaiting_payment: 'Awaiting payment',
  received: 'Received',
  proof_sent: 'Proof sent',
  approved: 'Approved',
  printing: 'Printing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

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

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Failed',
};

const INSTITUTION_VARIANT: Record<InstitutionStatus, Variant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  suspended: 'secondary',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_VARIANT[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={PAYMENT_VARIANT[status]}>{PAYMENT_LABEL[status]}</Badge>;
}

export function InstitutionStatusBadge({ status }: { status: InstitutionStatus }) {
  return (
    <Badge variant={INSTITUTION_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
