import { razorpayEnabled } from '@/config/env';
import { logEvent, logger } from '@/config/logger';
import { OrderModel } from '@/modules/orders/order.model';
import { changeStatus, planOrder } from '@/modules/orders/order.service';
import { TERMINAL_STATUSES } from '@/modules/orders/order.model';
import { PaymentModel } from '@/modules/payments/payment.model';
import { AUTO_CANCEL_REASON, reconcileRazorpayOrder } from '@/modules/payments/payment.service';

const MINUTE = 60_000;

/**
 * Unpaid online orders past their time limit: ask Razorpay once more (the webhook may have been
 * missed), then cancel. Every step is conditional, so running it twice at once is harmless.
 */
export async function cancelUnpaidOrders(now = new Date()) {
  const overdue = await OrderModel.find({ status: 'awaiting_payment', 'payment.dueBy': { $lte: now } }).limit(100);
  let cancelled = 0;
  for (const order of overdue) {
    try {
      if (razorpayEnabled() && order.payment.razorpayOrderId && (await reconcileRazorpayOrder(order.payment.razorpayOrderId))) continue;
      const fresh = await OrderModel.findById(order._id);
      if (fresh?.status !== 'awaiting_payment') continue;
      fresh.cancelReason = AUTO_CANCEL_REASON;
      await changeStatus(null, fresh, 'cancelled', { note: AUTO_CANCEL_REASON, byKind: 'system' });
      cancelled += 1;
    } catch (err) {
      logger.warn({ err, orderNumber: order.orderNumber }, 'Could not close unpaid order');
    }
  }
  if (cancelled) logEvent('job.unpaid_cancelled', { cancelled });
  return cancelled;
}

const QUOTE_EXPIRED_REASON = 'Quote expired without being accepted';

/** Quotes the customer never accepted within their validity are closed. */
export async function expireQuotes(now = new Date()) {
  const expired = await OrderModel.find({ status: 'quote_sent', 'quote.validUntil': { $lte: now } }).limit(100);
  for (const order of expired) {
    try {
      order.cancelReason = QUOTE_EXPIRED_REASON;
      await changeStatus(null, order, 'cancelled', { note: QUOTE_EXPIRED_REASON, byKind: 'system' });
    } catch (err) {
      logger.warn({ err, orderNumber: order.orderNumber }, 'Could not close expired quote');
    }
  }
  if (expired.length) logEvent('job.quotes_expired', { expired: expired.length });
  return expired.length;
}

/** Payment windows opened 15 minutes – 3 days ago and never confirmed: check them with Razorpay. */
export async function reconcilePayments(now = new Date()) {
  if (!razorpayEnabled()) return 0;
  const stale = await PaymentModel.find({
    provider: 'razorpay',
    kind: 'payment',
    status: 'created',
    createdAt: { $lte: new Date(now.getTime() - 15 * MINUTE), $gte: new Date(now.getTime() - 3 * 24 * 60 * MINUTE) },
  })
    .select('razorpayOrderId')
    .limit(50)
    .lean();
  let found = 0;
  for (const id of new Set(stale.map((p) => p.razorpayOrderId).filter(Boolean) as string[])) {
    try {
      if (await reconcileRazorpayOrder(id)) found += 1;
    } catch (err) {
      logger.warn({ err, razorpayOrderId: id }, 'Reconciliation failed');
    }
  }
  if (found) logEvent('job.payments_reconciled', { found }, 'warn');
  return found;
}

/** Fills in the segment (and, for open orders, a due date) on orders created before they existed. */
export async function backfillOrderPlans() {
  let updated = 0;
  for (;;) {
    const batch = await OrderModel.find({ segment: { $exists: false } }).select('audience items.product createdAt status dueDate').limit(200);
    if (!batch.length) break;
    for (const order of batch) {
      const plan = await planOrder(order.audience, order.items.map((i) => i.product), order.createdAt ?? new Date());
      const open = !TERMINAL_STATUSES.includes(order.status as never);
      await OrderModel.updateOne({ _id: order._id }, { $set: { segment: plan.segment, ...(open && !order.dueDate ? { dueDate: plan.dueDate } : {}) } });
      updated += 1;
    }
  }
  if (updated) logEvent('job.orders_backfilled', { updated });
  return updated;
}

export function scheduleOrderMaintenance() {
  void backfillOrderPlans().catch((err) => logger.error({ err }, 'Order backfill failed'));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await cancelUnpaidOrders();
      await expireQuotes();
    } catch (err) {
      logger.error({ err }, 'Unpaid order job failed');
    } finally {
      running = false;
    }
  };
  setInterval(tick, MINUTE).unref();
  setInterval(() => reconcilePayments().catch((err) => logger.error({ err }, 'Reconciliation job failed')), 15 * MINUTE).unref();
}
