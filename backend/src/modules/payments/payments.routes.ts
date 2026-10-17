import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId } from '@/common/validation';
import { env, razorpayEnabled } from '@/config/env';
import { logEvent } from '@/config/logger';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { OrderModel } from '@/modules/orders/order.model';
import { PaymentModel } from './payment.model';
import { applyCapture, applyRefundEvent, razorpay, razorpayOrderFor } from './payment.service';
import { WebhookEventModel } from './webhook-event.model';

export const paymentsRouter = Router();

const hmac = (secret: string, payload: string | Buffer) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

paymentsRouter.get('/config', (_req, res) => {
  res.json({ razorpayEnabled: razorpayEnabled(), keyId: razorpayEnabled() ? env.RAZORPAY_KEY_ID : null });
});

paymentsRouter.post(
  '/razorpay/order',
  authenticate,
  requireKind('user', 'institution'),
  validate({ body: z.object({ orderId: objectId }) }),
  async (req, res) => {
    const auth = req.auth!;
    const order = await OrderModel.findOne({
      _id: req.body.orderId,
      ...(auth.kind === 'institution' ? { institution: auth.id } : { customer: auth.id }),
    });
    if (!order) throw ApiError.notFound('Order');
    if (order.status === 'cancelled') throw ApiError.conflict('This order was cancelled');
    if (order.status === 'quote_pending') {
      throw ApiError.conflict('We are still preparing the price for this order');
    }
    razorpay();
    const { razorpayOrderId, amountPaise } = await razorpayOrderFor(order);

    res.json({
      keyId: env.RAZORPAY_KEY_ID,
      razorpayOrderId,
      amount: amountPaise,
      currency: 'INR',
      orderNumber: order.orderNumber,
      prefill: { name: order.contact?.name, contact: order.contact?.phone, email: order.contact?.email },
    });
  },
);

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

paymentsRouter.post(
  '/razorpay/verify',
  authenticate,
  validate({ body: verifySchema }),
  async (req, res) => {
    const body = req.body as z.infer<typeof verifySchema>;
    razorpay();
    const expected = hmac(env.RAZORPAY_KEY_SECRET!, `${body.razorpay_order_id}|${body.razorpay_payment_id}`);
    if (!safeEqual(expected, body.razorpay_signature)) {
      logEvent('payment.verify_failed', { razorpayOrderId: body.razorpay_order_id }, 'warn');
      throw ApiError.badRequest('Payment verification failed');
    }
    const pending = await PaymentModel.findOne({ razorpayOrderId: body.razorpay_order_id }).lean();
    if (!pending) throw ApiError.notFound('Payment');
    await applyCapture(body.razorpay_order_id, body.razorpay_payment_id, Math.round(pending.amount * 100), body);
    const order = await OrderModel.findById(pending.order).select('orderNumber status payment totals').lean();
    res.json({ ok: true, order });
  },
);

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id: string; amount: number } };
    refund?: { entity?: { id: string; payment_id: string; amount: number } };
  };
}

/** Razorpay server-to-server webhook (raw body kept in app.ts for the signature). */
paymentsRouter.post('/razorpay/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!env.RAZORPAY_WEBHOOK_SECRET || typeof signature !== 'string' || !req.rawBody) {
    throw ApiError.badRequest('Invalid webhook');
  }
  if (!safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, req.rawBody), signature)) {
    logEvent('webhook.bad_signature', { provider: 'razorpay' }, 'warn');
    throw ApiError.badRequest('Invalid signature');
  }

  const event = req.body as RazorpayEvent;
  const eventId = typeof req.headers['x-razorpay-event-id'] === 'string' ? req.headers['x-razorpay-event-id'] : undefined;
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;

  // Razorpay retries deliveries; the event id is unique, so a repeat is acknowledged and skipped.
  let record;
  try {
    record = await WebhookEventModel.create({
      provider: 'razorpay',
      eventId,
      event: event.event,
      summary: payment ? `${payment.id} · ₹${payment.amount / 100}` : refund ? `${refund.id} · ₹${refund.amount / 100}` : undefined,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    record = await WebhookEventModel.findOne({ eventId });
    // Only an event that failed last time is processed again.
    if (!record || record.status !== 'failed') {
      res.json({ ok: true, duplicate: true });
      return;
    }
    record.status = 'processed';
    record.error = undefined;
  }

  try {
    if (payment && (event.event === 'payment.captured' || event.event === 'order.paid')) {
      const p = await applyCapture(payment.order_id, payment.id, payment.amount, payment);
      record.relatedOrder = p?.order ?? undefined;
    } else if (payment && event.event === 'payment.failed') {
      await PaymentModel.updateOne(
        { razorpayOrderId: payment.order_id, status: 'created' },
        { $set: { status: 'failed', raw: payment } },
      );
    } else if (refund && (event.event === 'refund.processed' || event.event === 'refund.failed')) {
      const r = await applyRefundEvent(event.event, refund.id);
      record.relatedOrder = r?.order ?? undefined;
    } else {
      record.status = 'ignored';
    }
    await record.save();
  } catch (err) {
    record.status = 'failed';
    record.error = (err as Error).message;
    await record.save();
    throw err; // 500 → Razorpay retries later
  }
  logEvent('webhook.razorpay', { event: event.event, status: record.status });
  res.json({ ok: true });
});
