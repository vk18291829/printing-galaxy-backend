import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cancelUnpaidOrders } from '@/jobs/order-maintenance';
import { NotificationLogModel } from '@/modules/notifications/notification.model';
import { OrderModel } from '@/modules/orders/order.model';
import { PaymentModel } from '@/modules/payments/payment.model';
import { setRazorpayClient } from '@/modules/payments/payment.service';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, PASSWORD, seedBasics, staffToken, upload, withEnv } from './helpers';

let seed: Awaited<ReturnType<typeof seedBasics>>;
let customer: string;
let admin: string;
let staff: string;
let restoreEnv: () => void;

const KEY_SECRET = 'rzp-secret';
const WEBHOOK_SECRET = 'rzp-webhook-secret';
let seq = 0;
const rzpPayments = new Map<string, { id: string; status: string; amount: number; currency: string }[]>();
const fakeRazorpay = {
  orders: {
    create: async (o: { amount: number }) => ({ id: `order_${++seq}`, amount: o.amount, currency: 'INR' }),
    fetchPayments: async (id: string) => ({ items: rzpPayments.get(id) ?? [] }),
  },
  payments: {
    refund: async () => ({ id: `rfnd_${++seq}`, status: 'pending' }),
    capture: async () => ({}),
  },
};

const sign = (secret: string, payload: string) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

function webhook(payload: object, eventId: string) {
  const body = JSON.stringify(payload);
  return api()
    .post('/api/v1/payments/razorpay/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, body))
    .set('X-Razorpay-Event-Id', eventId)
    .send(body);
}

const pickupOrder = (paymentMethod: 'online' | 'counter', quantity = 1) => ({
  items: [{ productId: String(seed.products.studentId._id), quantity, fileIds: [] }],
  fulfilment: { method: 'pickup' },
  paymentMethod,
});

/** Opens the payment window and "pays" it, as the browser would. */
async function payOnline(orderId: string) {
  const rzp = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId }).expect(200);
  const paymentId = `pay_${++seq}`;
  await api()
    .post('/api/v1/payments/razorpay/verify')
    .set(bearer(customer))
    .send({ razorpay_order_id: rzp.body.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: sign(KEY_SECRET, `${rzp.body.razorpayOrderId}|${paymentId}`) })
    .expect(200);
  return { razorpayOrderId: rzp.body.razorpayOrderId as string, paymentId };
}

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  restoreEnv = withEnv({ RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET });
  setRazorpayClient(fakeRazorpay as never);
  customer = await customerToken('9876512345');
  admin = await staffToken('owner@test.in');
  staff = await staffToken('staff@test.in');
});
afterAll(async () => {
  setRazorpayClient(null);
  restoreEnv();
  await disconnectTestDb();
});

describe('idempotent order creation', () => {
  it('returns the first order when checkout is retried with the same key', async () => {
    const first = await api().post('/api/v1/orders').set(bearer(customer)).set('Idempotency-Key', 'checkout-aaaa-0001').send(pickupOrder('counter')).expect(201);
    const retry = await api().post('/api/v1/orders').set(bearer(customer)).set('Idempotency-Key', 'checkout-aaaa-0001').send(pickupOrder('counter')).expect(200);
    expect(retry.body._id).toBe(first.body._id);
    expect(retry.headers['idempotent-replayed']).toBe('true');
  });

  it('creates one order when the same request arrives several times at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => api().post('/api/v1/orders').set(bearer(customer)).set('Idempotency-Key', 'checkout-bbbb-0002').send(pickupOrder('counter'))),
    );
    expect(new Set(results.map((r) => r.body._id)).size).toBe(1);
    expect(await OrderModel.countDocuments({ idempotencyKey: { $regex: 'checkout-bbbb-0002$' } })).toBe(1);
  });

  it('never lets two orders claim the same uploaded file', async () => {
    const file = await upload(customer, { name: 'aadhaar.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]), productId: String(seed.products.pvc._id) });
    const body = { items: [{ productId: String(seed.products.pvc._id), quantity: 1, fileIds: [file._id] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' };
    const results = await Promise.all([1, 2, 3].map((n) => api().post('/api/v1/orders').set(bearer(customer)).set('Idempotency-Key', `file-race-000${n}`).send(body)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => [409, 422].includes(r.status))).toBe(true);
  });
});

describe('online payment flow', () => {
  let orderId: string;

  it('keeps unpaid online orders out of production', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('online')).expect(201);
    orderId = res.body._id;
    expect(res.body.status).toBe('awaiting_payment');
    expect(new Date(res.body.payment.dueBy).getTime()).toBeGreaterThan(Date.now());

    const queue = await api().get('/api/v1/admin/orders').query({ active: 'true' }).set(bearer(staff)).expect(200);
    expect(queue.body.items.map((o: { _id: string }) => o._id)).not.toContain(orderId);
    const move = await api().patch(`/api/v1/admin/orders/${orderId}/status`).set(bearer(staff)).send({ status: 'printing' }).expect(409);
    expect(move.body.error.message).toMatch(/waiting for online payment/);
  });

  it('reuses the payment window and starts the order once paid', async () => {
    const a = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId }).expect(200);
    const b = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId }).expect(200);
    expect(b.body.razorpayOrderId).toBe(a.body.razorpayOrderId);

    await payOnline(orderId);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.status).toBe('received');
    expect(order?.payment).toMatchObject({ amountPaid: 80, status: 'paid' });
  });

  it('records a webhook once even when Razorpay delivers it twice', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('online', 2)).expect(201);
    const rzp = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId: res.body._id }).expect(200);
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook_1', order_id: rzp.body.razorpayOrderId, amount: 16000 } } } };
    await webhook(event, 'evt_1').expect(200);
    const dup = await webhook(event, 'evt_1').expect(200);
    expect(dup.body.duplicate).toBe(true);
    const order = await OrderModel.findById(res.body._id).lean();
    expect(order?.payment.amountPaid).toBe(160);
    expect(order?.status).toBe('received');
  });

  it('cancels orders that are not paid in time, and brings them back if the money arrives late', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('online')).expect(201);
    const rzp = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId: res.body._id }).expect(200);
    await OrderModel.updateOne({ _id: res.body._id }, { $set: { 'payment.dueBy': new Date(Date.now() - 1000) } });

    expect(await cancelUnpaidOrders()).toBeGreaterThanOrEqual(1);
    expect((await OrderModel.findById(res.body._id).lean())?.status).toBe('cancelled');

    await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_late_1', order_id: rzp.body.razorpayOrderId, amount: 8000 } } } }, 'evt_late').expect(200);
    const back = await OrderModel.findById(res.body._id).lean();
    expect(back?.status).toBe('received');
    expect(back?.payment.status).toBe('paid');
  });

  it('finds a payment the webhook missed before cancelling', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('online')).expect(201);
    const rzp = await api().post('/api/v1/payments/razorpay/order').set(bearer(customer)).send({ orderId: res.body._id }).expect(200);
    rzpPayments.set(rzp.body.razorpayOrderId, [{ id: 'pay_missed_1', status: 'captured', amount: 8000, currency: 'INR' }]);
    await OrderModel.updateOne({ _id: res.body._id }, { $set: { 'payment.dueBy': new Date(Date.now() - 1000) } });
    await cancelUnpaidOrders();
    expect((await OrderModel.findById(res.body._id).lean())?.status).toBe('received');
  });
});

describe('refunds', () => {
  it('refunds automatically when a customer cancels a paid online order', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('online')).expect(201);
    await payOnline(res.body._id);
    const cancelled = await api().post(`/api/v1/orders/${res.body._id}/cancel`).set(bearer(customer)).send({ reason: 'Ordered by mistake' }).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.payment).toMatchObject({ amountRefunded: 80, status: 'refunded' });

    const refund = await PaymentModel.findOne({ order: res.body._id, kind: 'refund' }).lean();
    expect(refund).toMatchObject({ status: 'refund_pending', amount: 80 });
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: refund!.razorpayRefundId, payment_id: 'x', amount: 8000 } } } }, 'evt_refund').expect(200);
    expect((await PaymentModel.findById(refund!._id).lean())?.status).toBe('refunded');

    // Nothing left to refund.
    await api().post(`/api/v1/admin/orders/${res.body._id}/refunds`).set(bearer(admin)).send({ reason: 'again' }).expect(409);
  });

  it('lets only the owner refund, never twice for one click', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('counter', 2)).expect(201);
    await api().post(`/api/v1/admin/orders/${res.body._id}/payments`).set(bearer(staff)).send({ amount: 160, provider: 'cash' }).expect(200);
    await api().post(`/api/v1/admin/orders/${res.body._id}/refunds`).set(bearer(staff)).send({ amount: 50, reason: 'Misprint' }).expect(403);
    const [a, b] = await Promise.all([1, 2].map(() =>
      api().post(`/api/v1/admin/orders/${res.body._id}/refunds`).set(bearer(admin)).set('Idempotency-Key', 'refund-click-0001').send({ amount: 50, reason: 'Misprint on 1 card' })));
    expect([a!.status, b!.status].every((st) => st === 200 || st === 409)).toBe(true);
    const order = await OrderModel.findById(res.body._id).lean();
    expect(order?.payment).toMatchObject({ amountPaid: 160, amountRefunded: 50, status: 'partial' });
  });
});

describe('recording money', () => {
  it('counts a repeated payment request once and never goes past the total', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('counter', 2)).expect(201);
    const pay = () => api().post(`/api/v1/admin/orders/${res.body._id}/payments`).set(bearer(staff)).set('Idempotency-Key', 'cash-0000-0001').send({ amount: 100, provider: 'cash' });
    await pay().expect(200);
    await pay().expect(200);
    expect((await OrderModel.findById(res.body._id).lean())?.payment.amountPaid).toBe(100);

    // Two cashiers taking the remaining ₹60 at once: only one succeeds.
    const both = await Promise.all([1, 2].map(() => api().post(`/api/v1/admin/orders/${res.body._id}/payments`).set(bearer(staff)).send({ amount: 60, provider: 'cash' })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await OrderModel.findById(res.body._id).lean())?.payment).toMatchObject({ amountPaid: 160, status: 'paid' });
  });
});

describe('order flow rules', () => {
  it('blocks skipped steps unless the owner overrides with a reason', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('counter')).expect(201);
    const url = `/api/v1/admin/orders/${res.body._id}/status`;
    await api().patch(url).set(bearer(staff)).send({ status: 'ready' }).expect(409);
    await api().patch(url).set(bearer(staff)).send({ status: 'ready', override: true, note: 'Printed earlier' }).expect(403);
    await api().patch(url).set(bearer(admin)).send({ status: 'ready', override: true }).expect(400);
    const moved = await api().patch(url).set(bearer(admin)).send({ status: 'ready', override: true, note: 'Printed earlier today' }).expect(200);
    expect(moved.body.status).toBe('ready');
    expect(moved.body.statusHistory.at(-1).note).toMatch(/^Override: /);
  });

  it('messages the customer once per change, with the pickup code', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('counter')).expect(201);
    for (const status of ['printing', 'ready', 'ready']) {
      await api().patch(`/api/v1/admin/orders/${res.body._id}/status`).set(bearer(staff)).send({ status }).expect(200);
    }
    await new Promise((r) => setTimeout(r, 50));
    const ready = await NotificationLogModel.find({ relatedOrder: res.body._id, template: 'order_ready' }).lean();
    expect(ready).toHaveLength(1);
    expect(ready[0]!.body).toMatch(/pickup code \d{4}/);
    // The code is not stored in the order history staff can read.
    const order = await OrderModel.findById(res.body._id).lean();
    expect(JSON.stringify(order?.statusHistory)).not.toMatch(/code \d{4}/);
  });
});

describe('tracking and accounts', () => {
  it('tracks an order without an account after a code to the phone on the order', async () => {
    const res = await api().post('/api/v1/orders').set(bearer(customer)).send(pickupOrder('counter')).expect(201);
    const lookup = { orderNumber: res.body.orderNumber.toLowerCase(), phone: '9876512345' };
    const wrong = await api().post('/api/v1/track/request').send({ ...lookup, phone: '9000000099' }).expect(200);
    expect(wrong.body.devCode).toBeUndefined();
    const sent = await api().post('/api/v1/track/request').send(lookup).expect(200);
    const tracked = await api().post('/api/v1/track/verify').send({ ...lookup, code: sent.body.devCode }).expect(200);
    expect(tracked.body).toMatchObject({ orderNumber: res.body.orderNumber, status: 'received' });
    expect(tracked.body.contact).toBeUndefined();
  });

  it('resets an institution password with a code sent to its phone', async () => {
    const unknown = await api().post('/api/v1/auth/institution/password/forgot').send({ email: 'nobody@test.in' }).expect(200);
    expect(unknown.body.devCode).toBeUndefined();
    const sent = await api().post('/api/v1/auth/institution/password/forgot').send({ email: 'school@test.in' }).expect(200);
    expect(sent.body.phoneHint).toBe('98****1111');
    await api().post('/api/v1/auth/institution/password/reset').send({ email: 'school@test.in', code: sent.body.devCode, password: 'weak' }).expect(422);
    await api().post('/api/v1/auth/institution/password/reset').send({ email: 'school@test.in', code: sent.body.devCode, password: 'NewSecret@456' }).expect(200);
    await api().post('/api/v1/auth/institution/login').send({ email: 'school@test.in', password: PASSWORD }).expect(401);
    await api().post('/api/v1/auth/institution/login').send({ email: 'school@test.in', password: 'NewSecret@456' }).expect(200);
  });
});

describe('operations', () => {
  it('gives every response a request id, and errors carry it', async () => {
    const res = await api().get('/api/v1/orders/not-an-id').set(bearer(customer));
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    const kept = await api().get('/api/v1/health').set('X-Request-Id', 'proxy-req-12345').expect(200);
    expect(kept.headers['x-request-id']).toBe('proxy-req-12345');
    expect(kept.body.db).toBe('up');
  });

  it('shows the owner failed messages, webhooks and payments', async () => {
    const overview = await api().get('/api/v1/admin/system/overview').set(bearer(admin)).expect(200);
    expect(overview.body.health.db).toBe('up');
    expect(overview.body.readiness).toHaveProperty('warnings');
    await api().get('/api/v1/admin/system/overview').set(bearer(staff)).expect(403);
    const hooks = await api().get('/api/v1/admin/system/webhooks').set(bearer(admin)).expect(200);
    expect(hooks.body.items.some((h: { event: string }) => h.event === 'payment.captured')).toBe(true);
    const money = await api().get('/api/v1/admin/system/payments').query({ kind: 'refund' }).set(bearer(admin)).expect(200);
    expect(money.body.total).toBeGreaterThanOrEqual(2);
  });
});
