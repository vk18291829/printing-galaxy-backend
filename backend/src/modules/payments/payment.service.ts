import type { Request } from 'express';
import type { Types } from 'mongoose';
import Razorpay from 'razorpay';
import { ApiError } from '@/common/errors';
import { claimKey, releaseKey } from '@/common/idempotency';
import { env, razorpayEnabled } from '@/config/env';
import { logEvent, logger } from '@/config/logger';
import { audit } from '@/modules/audit/audit.model';
import { notifications } from '@/modules/notifications/notification.service';
import { OrderModel, type OrderDoc } from '@/modules/orders/order.model';
import { amountDue, changeStatus, netPaid } from '@/modules/orders/order.service';
import { round2 } from '@/modules/pricing/pricing.service';
import { PaymentModel } from './payment.model';

/** Set as the cancel reason by the unpaid-order sweeper; such orders come back if payment arrives late. */
export const AUTO_CANCEL_REASON = 'Online payment was not received in time';

let client: Razorpay | null = null;
export function razorpay() {
  if (!razorpayEnabled()) throw ApiError.badRequest('Online payment is not configured. Please pay at the counter.');
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  return client;
}

/** Test hook: replace the Razorpay client with a fake. */
export function setRazorpayClient(fake: Razorpay | null) {
  client = fake;
}

// payment.status recomputed inside the same atomic update (aggregation pipeline), so it can
// never disagree with the amounts.
const NET = { $subtract: ['$payment.amountPaid', { $ifNull: ['$payment.amountRefunded', 0] }] };
const STATUS_STAGE = {
  $set: {
    'payment.status': {
      $switch: {
        branches: [
          { case: { $and: [{ $gt: [{ $ifNull: ['$payment.amountRefunded', 0] }, 0] }, { $lte: [NET, 0.009] }] }, then: 'refunded' },
          { case: { $lte: [NET, 0] }, then: 'pending' },
          { case: { $gte: [{ $add: [NET, 0.009] }, '$totals.total'] }, then: 'paid' },
        ],
        default: 'partial',
      },
    },
  },
};

/**
 * Adds money to (or, negative, takes it off) an order in one atomic update.
 * With `guard`, the update only happens if it would not take the order past its total
 * (payments) or refund more than was paid (refunds). Returns null when the guard fails.
 */
async function moveMoney(
  orderId: Types.ObjectId | string,
  field: 'amountPaid' | 'amountRefunded',
  amount: number,
  guard: boolean,
) {
  const filter: Record<string, unknown> = { _id: orderId };
  if (guard && field === 'amountPaid') {
    filter.$expr = { $lte: [{ $add: [NET, amount] }, { $add: ['$totals.total', 0.009] }] };
  }
  if (guard && field === 'amountRefunded') {
    filter.$expr = { $lte: [{ $add: [{ $ifNull: ['$payment.amountRefunded', 0] }, amount] }, { $add: ['$payment.amountPaid', 0.009] }] };
  }
  return OrderModel.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          [`payment.${field}`]: { $round: [{ $add: [{ $ifNull: [`$payment.${field}`, 0] }, amount] }, 2] },
          // Bumps the version so a stale copy of the order cannot be saved over this change.
          __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] },
        },
      },
      STATUS_STAGE,
    ],
    { new: true },
  );
}

/** What happens to an order once money arrives. */
async function afterPayment(req: Request | null, orderId: Types.ObjectId | string) {
  const order = await OrderModel.findById(orderId);
  if (!order) return null;
  if (order.status === 'awaiting_payment' && order.payment.status === 'paid') {
    await changeStatus(req, order, 'received', { note: 'Payment received', byKind: req ? undefined : 'system' });
  } else if (order.status === 'cancelled' && order.cancelReason === AUTO_CANCEL_REASON) {
    // Paid after the timeout: bring the order back instead of refunding.
    order.status = 'received';
    order.cancelReason = undefined;
    order.completedAt = undefined;
    order.statusHistory.push({ status: 'received', note: 'Payment received after the time limit', byKind: 'system', at: new Date() });
    await order.save();
    logEvent('order.reinstated', { orderNumber: order.orderNumber });
  }
  return order;
}

/**
 * Staff-recorded money (cash, UPI at the counter, cash on delivery).
 * A repeated `idempotencyKey` returns the order unchanged; the amount can never exceed what is due.
 */
export async function recordPayment(
  req: Request | null,
  orderId: Types.ObjectId | string,
  input: { amount: number; provider: 'cash' | 'upi_counter'; note?: string; idempotencyKey?: string },
) {
  const amount = round2(input.amount);
  let payment;
  try {
    payment = await PaymentModel.create({
      order: orderId,
      provider: input.provider,
      amount,
      status: 'captured',
      recordedBy: req?.auth?.id,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000 && input.idempotencyKey) {
      return OrderModel.findById(orderId);
    }
    throw err;
  }

  const updated = await moveMoney(orderId, 'amountPaid', amount, true);
  if (!updated) {
    await payment.deleteOne();
    const order = await OrderModel.findById(orderId).lean();
    throw ApiError.badRequest(order ? `Only ₹${amountDue(order)} is due on this order` : 'Order not found');
  }
  logEvent('payment.recorded', { orderNumber: updated.orderNumber, amount, provider: input.provider, by: req?.auth?.id });
  audit(req, {
    action: 'payment.recorded',
    entity: 'Order',
    entityId: updated._id,
    summary: `${updated.orderNumber}: ₹${amount} via ${input.provider}${input.note ? ` (${input.note})` : ''}`,
  });
  return afterPayment(req, orderId);
}

/** Records a captured Razorpay payment exactly once, whether it comes from the browser, the webhook or reconciliation. */
export async function applyCapture(razorpayOrderId: string, razorpayPaymentId: string, amountPaise: number, raw: unknown) {
  const existing = await PaymentModel.findOne({ razorpayPaymentId });
  if (existing?.status === 'captured') return existing;

  const amount = round2(amountPaise / 100);
  let payment = await PaymentModel.findOneAndUpdate(
    { razorpayOrderId, kind: 'payment', status: { $in: ['created', 'failed'] }, razorpayPaymentId: { $exists: false } },
    { $set: { status: 'captured', razorpayPaymentId, amount, raw } },
    { new: true, sort: { createdAt: -1 } },
  );
  if (!payment) {
    // A second payment against the same Razorpay order (rare) or the "created" row is missing.
    const order = await OrderModel.findOne({ 'payment.razorpayOrderId': razorpayOrderId }).select('_id').lean()
      ?? (await PaymentModel.findOne({ razorpayOrderId }).select('order').lean().then((p) => (p ? { _id: p.order } : null)));
    if (!order) {
      logger.warn({ razorpayOrderId, razorpayPaymentId }, 'Captured payment for an unknown order');
      return null;
    }
    try {
      payment = await PaymentModel.create({ order: order._id, provider: 'razorpay', amount, status: 'captured', razorpayOrderId, razorpayPaymentId, raw });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return PaymentModel.findOne({ razorpayPaymentId });
      throw err;
    }
  }

  // Money already taken by Razorpay is always recorded, even past the total (it is refunded below if needed).
  const order = await moveMoney(payment.order, 'amountPaid', amount, false);
  if (!order) return payment;
  logEvent('payment.captured', { orderNumber: order.orderNumber, amount, razorpayPaymentId });
  audit(null, { action: 'payment.captured', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ₹${amount} received online` });

  const after = await afterPayment(null, order._id);
  // Paid for an order the customer or shop had cancelled: send the money back.
  if (after?.status === 'cancelled' && netPaid(after) > 0) {
    await refundOrder(null, after, { reason: 'Payment received for a cancelled order' }).catch((err) =>
      logger.error({ err, orderNumber: after.orderNumber }, 'Automatic refund failed'),
    );
  }
  return payment;
}

/** Creates (or reuses) the Razorpay order for what is still due. */
export async function razorpayOrderFor(order: OrderDoc) {
  const due = amountDue(order);
  if (due <= 0) throw ApiError.conflict('This order is already paid');

  // Reopening the payment window reuses the same Razorpay order while the amount is unchanged.
  const reusable = await PaymentModel.findOne({
    order: order._id,
    provider: 'razorpay',
    kind: 'payment',
    status: 'created',
    amount: due,
    createdAt: { $gt: new Date(Date.now() - 12 * 3_600_000) },
  }).sort({ createdAt: -1 });

  let razorpayOrderId = reusable?.razorpayOrderId;
  if (!razorpayOrderId) {
    const rzpOrder = await razorpay().orders.create({
      amount: Math.round(due * 100),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });
    razorpayOrderId = rzpOrder.id;
    await PaymentModel.create({ order: order._id, provider: 'razorpay', amount: due, status: 'created', razorpayOrderId });
    logEvent('payment.razorpay_order', { orderNumber: order.orderNumber, amount: due, razorpayOrderId });
  }

  // A customer paying at the last minute is not cancelled mid-payment.
  const set: Record<string, unknown> = { 'payment.razorpayOrderId': razorpayOrderId };
  if (order.status === 'awaiting_payment') {
    const minDue = new Date(Date.now() + 15 * 60_000);
    if (!order.payment.dueBy || order.payment.dueBy < minDue) set['payment.dueBy'] = minDue;
  }
  await OrderModel.updateOne({ _id: order._id }, { $set: set });
  return { razorpayOrderId, amountPaise: Math.round(due * 100) };
}

/**
 * Asks Razorpay what happened to a payment window (webhook missed, browser closed).
 * Captures authorised payments and records captured ones. Returns true if money was found.
 */
export async function reconcileRazorpayOrder(razorpayOrderId: string) {
  if (!razorpayEnabled()) return false;
  const res = (await razorpay().orders.fetchPayments(razorpayOrderId)) as {
    items?: { id: string; status: string; amount: number; currency: string }[];
  };
  let found = false;
  for (const p of res.items ?? []) {
    if (p.status === 'authorized') {
      await razorpay().payments.capture(p.id, p.amount, p.currency || 'INR');
      p.status = 'captured';
    }
    if (p.status === 'captured') {
      await applyCapture(razorpayOrderId, p.id, p.amount, p);
      found = true;
    }
  }
  if (!found && (res.items ?? []).length && (res.items ?? []).every((p) => p.status === 'failed')) {
    await PaymentModel.updateMany({ razorpayOrderId, status: 'created' }, { $set: { status: 'failed' } });
  }
  return found;
}

/**
 * Sends money back. Razorpay payments are refunded through Razorpay (newest first); anything
 * else is recorded as cash handed back. The refund is reserved atomically first, so a double
 * click (or a repeated key) can never refund twice.
 */
export async function refundOrder(
  req: Request | null,
  order: OrderDoc,
  input: { amount?: number; reason: string; idempotencyKey?: string; cashOnly?: boolean },
) {
  const refundable = netPaid(order);
  const amount = round2(input.amount ?? refundable);
  if (amount <= 0 || refundable <= 0) throw ApiError.conflict('Nothing has been paid on this order');
  if (amount > refundable + 0.009) throw ApiError.badRequest(`At most ₹${refundable} can be refunded`);

  const claim = input.idempotencyKey ? `refund:${input.idempotencyKey}` : undefined;
  if (claim && !(await claimKey(claim))) return OrderModel.findById(order._id);
  const reserved = await moveMoney(order._id, 'amountRefunded', amount, true);
  if (!reserved) {
    if (claim) await releaseKey(claim);
    throw ApiError.conflict('This refund was already made. Refresh the order.');
  }

  const payments = await PaymentModel.find({ order: order._id, kind: 'payment', status: 'captured' }).sort({ createdAt: -1 }).lean();
  const refunds = await PaymentModel.find({ order: order._id, kind: 'refund', status: { $ne: 'failed' } }).lean();
  const refundedPer = new Map<string, number>();
  for (const r of refunds) if (r.refundOf) refundedPer.set(String(r.refundOf), (refundedPer.get(String(r.refundOf)) ?? 0) + r.amount);

  let left = amount;
  let index = 0;
  try {
    for (const p of payments) {
      if (left <= 0.009) break;
      if (input.cashOnly && p.provider === 'razorpay') continue;
      const available = round2(p.amount - (refundedPer.get(String(p._id)) ?? 0));
      if (available <= 0) continue;
      const part = round2(Math.min(available, left));
      const key = input.idempotencyKey ? `${input.idempotencyKey}:${index}` : undefined;
      index += 1;

      if (p.provider === 'razorpay' && p.razorpayPaymentId) {
        const refund = (await razorpay().payments.refund(p.razorpayPaymentId, {
          amount: Math.round(part * 100),
          notes: { orderNumber: order.orderNumber, reason: input.reason.slice(0, 200) },
        })) as { id: string; status: string };
        await PaymentModel.create({
          order: order._id, kind: 'refund', provider: 'razorpay', amount: part,
          status: refund.status === 'processed' ? 'refunded' : 'refund_pending',
          razorpayRefundId: refund.id, refundOf: p._id, recordedBy: req?.auth?.id, note: input.reason, idempotencyKey: key,
        });
      } else {
        await PaymentModel.create({
          order: order._id, kind: 'refund', provider: p.provider, amount: part, status: 'refunded',
          refundOf: p._id, recordedBy: req?.auth?.id, note: input.reason, idempotencyKey: key,
        });
      }
      left = round2(left - part);
    }
  } catch (err) {
    // Give back the part that did not go through, so the books match what Razorpay did.
    if (left > 0) await moveMoney(order._id, 'amountRefunded', -left, false);
    if (claim && left >= amount) await releaseKey(claim);
    logger.error({ err, orderNumber: order.orderNumber }, 'Refund failed');
    throw ApiError.badRequest(`Refund failed: ${(err as { error?: { description?: string } }).error?.description ?? (err as Error).message}`);
  }
  if (left > 0.009) await moveMoney(order._id, 'amountRefunded', -left, false);

  const refunded = round2(amount - left);
  logEvent('payment.refunded', { orderNumber: order.orderNumber, amount: refunded, reason: input.reason });
  audit(req, { action: 'payment.refunded', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ₹${refunded} refunded (${input.reason})` });
  void notifications.orderStatus({
    phone: order.contact?.phone,
    email: order.contact?.email,
    name: order.contact?.name,
    orderNumber: order.orderNumber,
    status: 'refunded',
    orderId: order._id,
    // Plain ASCII: a ₹ sign would turn the SMS into a Unicode message.
    note: `Amount Rs ${refunded}`,
    dedupeKey: `refund:${order.id}:${input.idempotencyKey ?? Date.now()}`,
  });
  return OrderModel.findById(order._id);
}

/** Razorpay refund webhooks: mark the refund done, or put the money back on the order if it failed. */
export async function applyRefundEvent(event: 'refund.processed' | 'refund.failed', refundId: string) {
  const refund = await PaymentModel.findOne({ razorpayRefundId: refundId, kind: 'refund' });
  if (!refund || refund.status !== 'refund_pending') return refund;
  if (event === 'refund.processed') {
    refund.status = 'refunded';
    await refund.save();
  } else {
    refund.status = 'failed';
    await refund.save();
    const order = await moveMoney(refund.order, 'amountRefunded', -refund.amount, false);
    logEvent('payment.refund_failed', { orderNumber: order?.orderNumber, amount: refund.amount }, 'warn');
  }
  return refund;
}
