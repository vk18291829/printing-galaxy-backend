import type { OrderStatus } from '@/types/api';

/**
 * Same table as the API (backend order.model.ts): the manual moves. Every other status follows
 * from an action (sending a quote or proof, the customer approving, the rider, the handover code).
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  quote_pending: ['cancelled'],
  quote_sent: ['cancelled'],
  awaiting_payment: ['cancelled'],
  received: ['printing', 'cancelled'],
  proof_sent: ['cancelled'],
  approved: ['printing', 'cancelled'],
  printing: ['ready', 'cancelled'],
  ready: ['printing', 'cancelled'],
  out_for_delivery: ['cancelled'],
  delivered: [],
  picked_up: [],
  cancelled: [],
};

/** What the owner can still pick with an override: reopen an order, or the shop-floor steps. */
export const OVERRIDE_STATUSES: OrderStatus[] = ['received', 'printing', 'ready', 'cancelled'];

/** A design item without an approved proof: printing waits for the customer. */
export const awaitingProofApproval = (order: { items: { workflow: string; proofs: { status: string }[] }[] }) =>
  order.items.some((i) => i.workflow === 'design' && i.proofs.at(-1)?.status !== 'approved');

export const isClosed = (s: OrderStatus) => s === 'delivered' || s === 'picked_up' || s === 'cancelled';

export const netPaid = (p: { amountPaid: number; amountRefunded?: number }) =>
  Math.round((p.amountPaid - (p.amountRefunded ?? 0)) * 100) / 100;
