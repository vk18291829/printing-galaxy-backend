import crypto from 'node:crypto';
import type { Request } from 'express';
import { ApiError } from '@/common/errors';
import { logEvent } from '@/config/logger';
import { notifications } from '@/modules/notifications/notification.service';
import { recordPayment } from '@/modules/payments/payment.service';
import { getSettings } from '@/modules/settings/settings.model';
import { DELIVERY_MAX_ATTEMPTS, HANDOVER_MAX_ATTEMPTS, OrderModel, type OrderDoc } from './order.model';
import { amountDue, changeStatus, ensureHandoverCode } from './order.service';

export interface HandoverInput {
  /** The customer's 4-digit code. */
  code?: string;
  /** Admin only: hand over without the code, with a reason. */
  overrideReason?: string;
  /** Money collected at the handover. */
  collected?: number;
  provider?: 'cash' | 'upi_counter';
  note?: string;
  idempotencyKey?: string;
}

const sameCode = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Checks the customer's code; wrong codes are counted and lock the handover after a few tries. */
async function verifyCode(order: OrderDoc, code: string | undefined) {
  if (!code || !/^\d{4}$/.test(code)) throw ApiError.badRequest("Enter the customer's 4-digit code");
  if ((order.handover?.wrongAttempts ?? 0) >= HANDOVER_MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many wrong codes. Ask the shop owner to confirm this handover.');
  }
  const expected = await ensureHandoverCode(order._id);
  if (sameCode(expected, code)) return;

  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id },
    { $inc: { 'handover.wrongAttempts': 1, __v: 1 } },
    { new: true },
  ).lean();
  const left = HANDOVER_MAX_ATTEMPTS - (updated?.handover?.wrongAttempts ?? HANDOVER_MAX_ATTEMPTS);
  logEvent('handover.wrong_code', { orderNumber: order.orderNumber, left }, 'warn');
  throw ApiError.badRequest(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong code. The handover is now locked; ask the shop owner.');
}

/**
 * Completes a pickup (`picked_up`) or delivery (`delivered`).
 * Requires the customer's code (or an admin override) and a settled balance: whatever is due
 * must be collected now, except for institutions, who are billed on account.
 * Repeating the same handover returns the order unchanged.
 */
export async function completeHandover(req: Request, orderId: string, to: 'picked_up' | 'delivered', input: HandoverInput, scope: Record<string, unknown> = {}) {
  const order = await OrderModel.findOne({ _id: orderId, ...scope });
  if (!order) throw ApiError.notFound(to === 'delivered' ? 'Delivery' : 'Order');
  if (order.status === to) return order;

  const method = order.fulfilment?.method ?? 'pickup';
  if (to === 'picked_up' && (method !== 'pickup' || order.status !== 'ready')) {
    throw ApiError.conflict(method !== 'pickup' ? 'This is a delivery order' : 'This order is not ready for pickup yet');
  }
  if (to === 'delivered' && order.status !== 'out_for_delivery') throw ApiError.conflict('Start the delivery first');

  const override = input.overrideReason?.trim();
  if (override) {
    if (req.auth?.role !== 'admin') throw ApiError.forbidden('Only the owner can hand over without the code');
    if (override.length < 5) throw ApiError.badRequest('Write a reason (at least 5 characters)');
  } else {
    await verifyCode(order, input.code);
  }

  const collected = Math.max(0, input.collected ?? 0);
  const due = amountDue(order);
  if (collected > due + 0.009) throw ApiError.badRequest(`Only ₹${due} is due on this order`);
  const remaining = due - collected;
  if (remaining > 0.009 && order.audience !== 'institution' && !override) {
    throw ApiError.conflict(`₹${Math.round(remaining * 100) / 100} is still due. Collect it before handing over.`);
  }

  // Status first (version-checked), so two taps cannot both record the cash.
  order.handover.verifiedAt = new Date();
  order.handover.verifiedBy = req.auth?.id as unknown as typeof order.handover.verifiedBy;
  if (override) order.handover.overrideReason = override;
  const note = [override ? `Handed over without code: ${override}` : 'Handover code verified', input.note].filter(Boolean).join('. ');
  await changeStatus(req, order, to, { note });

  if (collected > 0) {
    await recordPayment(req, order._id, {
      amount: collected,
      provider: input.provider ?? 'cash',
      note: to === 'delivered' ? 'Collected on delivery' : 'Collected at pickup',
      idempotencyKey: input.idempotencyKey,
    });
  }
  logEvent('order.handover', { orderNumber: order.orderNumber, to, collected, override: Boolean(override) });
  return OrderModel.findById(order._id);
}

/** Nobody home, wrong address…: back to "ready", the customer is told, the shop is alerted after repeated failures. */
export async function failDelivery(req: Request, order: OrderDoc, reason: string) {
  if (order.status !== 'out_for_delivery') throw ApiError.conflict('This delivery is not on the way');
  order.deliveryAttempts = (order.deliveryAttempts ?? 0) + 1;
  const attempt = order.deliveryAttempts;
  await changeStatus(req, order, 'ready', { note: `Delivery attempt ${attempt} failed: ${reason}`, notify: false });

  void notifications.orderStatus({
    phone: order.contact?.phone,
    email: order.contact?.email,
    name: order.contact?.name,
    customer: order.customer,
    institution: order.institution,
    orderNumber: order.orderNumber,
    status: 'delivery_failed',
    orderId: order._id,
    // Fits one 30-character SMS variable; the reason stays in the order history.
    note: attempt >= DELIVERY_MAX_ATTEMPTS ? 'Please call the shop.' : 'We will try again.',
    dedupeKey: `delivery-failed:${order.id}:${attempt}`,
  });
  if (attempt >= DELIVERY_MAX_ATTEMPTS) {
    const settings = await getSettings();
    void notifications.staffAlert(settings.shop, 'delivery_failed', `Delivery failed ${attempt} times`, order.orderNumber);
  }
  logEvent('delivery.failed', { orderNumber: order.orderNumber, attempt, reason }, 'warn');
  return order;
}
