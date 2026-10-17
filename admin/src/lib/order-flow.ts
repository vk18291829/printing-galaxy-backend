import type { OrderStatus } from '@/types/api';

/** Same table as the API (backend order.model.ts): moves staff can make without an override. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  quote_pending: ['cancelled'],
  awaiting_payment: ['cancelled'],
  received: ['proof_sent', 'approved', 'printing', 'cancelled'],
  proof_sent: ['received', 'approved', 'cancelled'],
  approved: ['proof_sent', 'printing', 'cancelled'],
  printing: ['ready', 'approved', 'cancelled'],
  ready: ['printing', 'out_for_delivery', 'cancelled'],
  out_for_delivery: ['ready', 'cancelled'],
  delivered: [],
  picked_up: [],
  cancelled: [],
};

export const ALL_STATUSES: OrderStatus[] = [
  'received', 'proof_sent', 'approved', 'printing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'cancelled',
];

export const isClosed = (s: OrderStatus) => s === 'delivered' || s === 'picked_up' || s === 'cancelled';

export const netPaid = (p: { amountPaid: number; amountRefunded?: number }) =>
  Math.round((p.amountPaid - (p.amountRefunded ?? 0)) * 100) / 100;
