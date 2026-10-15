import crypto from 'node:crypto';
import { Router } from 'express';
import Razorpay from 'razorpay';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId } from '@/common/validation';
import { env, razorpayEnabled } from '@/config/env';
import { logger } from '@/config/logger';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { OrderModel } from '@/modules/orders/order.model';
import { syncPaymentStatus } from '@/modules/orders/order.service';
import { round2 } from '@/modules/pricing/pricing.service';
import { PaymentModel } from './payment.model';

export const paymentsRouter = Router();

let client: Razorpay | null = null;
function razorpay() {
  if (!razorpayEnabled) throw ApiError.badRequest('Online payment is not configured. Please pay at the counter.');
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  return client;
}

const hmac = (secret: string, payload: string | Buffer) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Records a captured payment exactly once, whether it arrives via the browser or the webhook. */
async function applyCapture(razorpayOrderId: string, razorpayPaymentId: string, amountPaise: number, raw: unknown) {
  const existing = await PaymentModel.findOne({ razorpayPaymentId });
  if (existing?.status === 'captured') return existing;

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayOrderId, status: { $ne: 'captured' } },
    { $set: { status: 'captured', razorpayPaymentId, amount: amountPaise / 100, raw } },
    { new: true },
  );
  if (!payment) return existing;

  const order = await OrderModel.findById(payment.order);
  if (order) {
    order.payment.amountPaid = round2((order.payment.amountPaid ?? 0) + payment.amount);
    syncPaymentStatus(order);
    await order.save();
    audit(null, {
      action: 'payment.captured',
      entity: 'Order',
      entityId: order._id,
      summary: `${order.orderNumber}: ₹${payment.amount} received online`,
    });
  }
  return payment;
}

paymentsRouter.get('/config', (_req, res) => {
  res.json({ razorpayEnabled, keyId: razorpayEnabled ? env.RAZORPAY_KEY_ID : null });
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
    const due = round2(order.totals.total - (order.payment.amountPaid ?? 0));
    if (due <= 0) throw ApiError.conflict('This order is already paid');

    const rzpOrder = await razorpay().orders.create({
      amount: Math.round(due * 100),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    await PaymentModel.create({
      order: order._id,
      provider: 'razorpay',
      amount: due,
      status: 'created',
      razorpayOrderId: rzpOrder.id,
    });
    order.payment.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      keyId: env.RAZORPAY_KEY_ID,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
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
      throw ApiError.badRequest('Payment verification failed');
    }
    const pending = await PaymentModel.findOne({ razorpayOrderId: body.razorpay_order_id }).lean();
    if (!pending) throw ApiError.notFound('Payment');
    await applyCapture(body.razorpay_order_id, body.razorpay_payment_id, Math.round(pending.amount * 100), body);
    const order = await OrderModel.findById(pending.order).select('orderNumber payment totals').lean();
    res.json({ ok: true, order });
  },
);

/** Razorpay server-to-server webhook. Mounted with a raw body parser in app.ts. */
paymentsRouter.post('/razorpay/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!env.RAZORPAY_WEBHOOK_SECRET || typeof signature !== 'string' || !req.rawBody) {
    throw ApiError.badRequest('Invalid webhook');
  }
  if (!safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, req.rawBody), signature)) {
    throw ApiError.badRequest('Invalid signature');
  }

  const event = req.body as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string; amount: number } } };
  };
  const entity = event.payload?.payment?.entity;
  if (entity && (event.event === 'payment.captured' || event.event === 'order.paid')) {
    await applyCapture(entity.order_id, entity.id, entity.amount, entity);
  } else if (entity && event.event === 'payment.failed') {
    await PaymentModel.updateOne(
      { razorpayOrderId: entity.order_id, status: 'created' },
      { $set: { status: 'failed', raw: entity } },
    );
  }
  logger.info({ event: event.event }, 'Razorpay webhook processed');
  res.json({ ok: true });
});
