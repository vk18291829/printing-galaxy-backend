import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationLogModel } from '@/modules/notifications/notification.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, institutionToken, seedBasics, staffToken } from './helpers';

let seed: Awaited<ReturnType<typeof seedBasics>>;
let admin: string;
let staff: string;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  admin = await staffToken('owner@test.in');
  staff = await staffToken('staff@test.in');
});
afterAll(disconnectTestDb);

describe('materials and low-stock alerts', () => {
  let id: string;

  it('lets only the owner add materials', async () => {
    await api().post('/api/v1/admin/inventory').set(bearer(staff)).send({ name: 'PVC sheets', unit: 'sheets', lowStockThreshold: 20 }).expect(403);
    const res = await api().post('/api/v1/admin/inventory').set(bearer(admin)).send({ name: 'PVC sheets', unit: 'sheets', lowStockThreshold: 20, quantity: 50 }).expect(201);
    id = res.body._id;
    expect(res.body.quantity).toBe(50);
  });

  it('alerts once when stock falls to the threshold, and re-arms after a restock', async () => {
    await api().post(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).send({ quantity: 25, reason: 'usage' }).expect(201);
    expect(await NotificationLogModel.countDocuments({ template: 'low_stock' })).toBe(0);

    const used = await api().post(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).send({ quantity: 10, reason: 'wastage', note: 'jammed' }).expect(201);
    expect(used.body.material.quantity).toBe(15);
    await api().post(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).send({ quantity: 5, reason: 'usage' }).expect(201);
    await new Promise((r) => setTimeout(r, 50));
    const alerts = await NotificationLogModel.find({ template: 'low_stock' }).lean();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.body).toContain('PVC sheets is low: 15 sheets left');

    const dash = await api().get('/api/v1/admin/dashboard').set(bearer(staff)).expect(200);
    expect(dash.body.lowStock.map((m: { name: string }) => m.name)).toEqual(['PVC sheets']);

    // A stock count sets the absolute number.
    const counted = await api().post(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).send({ quantity: 100, reason: 'correction' }).expect(201);
    expect(counted.body.movement.delta).toBe(90);
    await api().post(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).send({ quantity: 85, reason: 'usage' }).expect(201);
    await new Promise((r) => setTimeout(r, 50));
    expect(await NotificationLogModel.countDocuments({ template: 'low_stock' })).toBe(2);

    const history = await api().get(`/api/v1/admin/inventory/${id}/movements`).set(bearer(staff)).expect(200);
    expect(history.body[0]).toMatchObject({ reason: 'usage', delta: -85, balance: 15 });
  });
});

describe('deliveries', () => {
  let orderId: string;
  let riderToken: string;

  beforeAll(async () => {
    const customer = await customerToken('9876501234');
    const order = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({
        items: [{ productId: seed.products.studentId._id, quantity: 3, fileIds: [] }],
        fulfilment: { method: 'delivery', address: { line1: '22 Shivaji Nagar', city: 'Jhansi', state: 'Uttar Pradesh', pincode: '284001' } },
        paymentMethod: 'counter',
      })
      .expect(201);
    orderId = order.body._id;
    // ₹80 × 3 + ₹40 delivery (below the free-delivery amount).
    expect(order.body.totals.total).toBe(280);
    await api().patch(`/api/v1/admin/orders/${orderId}/assign`).set(bearer(admin)).send({ deliveryPerson: String(seed.users.rider._id) }).expect(200);
    // Riders see an order once production has started.
    await api().patch(`/api/v1/admin/orders/${orderId}/status`).set(bearer(admin)).send({ status: 'printing' }).expect(200);
    riderToken = await staffToken('rider@test.in');
  });

  it('shows riders only their own deliveries', async () => {
    const mine = await api().get('/api/v1/delivery').set(bearer(riderToken)).expect(200);
    expect(mine.body.active.map((o: { _id: string }) => o._id)).toEqual([orderId]);
    const other = await staffToken('rider2@test.in');
    const theirs = await api().get('/api/v1/delivery').set(bearer(other)).expect(200);
    expect(theirs.body.active).toHaveLength(0);
    await api().post(`/api/v1/delivery/${orderId}/start`).set(bearer(other)).expect(404);
  });

  it('starts only packed orders, handles a failed attempt, and records cash on delivery', async () => {
    await api().post(`/api/v1/delivery/${orderId}/start`).set(bearer(riderToken)).expect(409);
    await api().patch(`/api/v1/admin/orders/${orderId}/status`).set(bearer(admin)).send({ status: 'ready' }).expect(200);
    const started = await api().post(`/api/v1/delivery/${orderId}/start`).set(bearer(riderToken)).expect(200);
    expect(started.body.status).toBe('out_for_delivery');

    const failed = await api().post(`/api/v1/delivery/${orderId}/failed`).set(bearer(riderToken)).send({ note: 'Nobody at home' }).expect(200);
    expect(failed.body.status).toBe('ready');

    await api().post(`/api/v1/delivery/${orderId}/start`).set(bearer(riderToken)).expect(200);
    await api().post(`/api/v1/delivery/${orderId}/delivered`).set(bearer(riderToken)).send({ cashCollected: 9999 }).expect(400);
    const done = await api().post(`/api/v1/delivery/${orderId}/delivered`).set(bearer(riderToken)).send({ cashCollected: 280, provider: 'cash' }).expect(200);
    expect(done.body.status).toBe('delivered');
    expect(done.body.payment).toMatchObject({ amountPaid: 280, status: 'paid' });

    const today = await api().get('/api/v1/delivery').set(bearer(riderToken)).expect(200);
    expect(today.body.doneToday).toHaveLength(1);
  });
});

describe('reports', () => {
  it('summarises sales by day and exports CSV', async () => {
    const res = await api().get('/api/v1/admin/reports/sales').set(bearer(admin)).expect(200);
    expect(res.body.columns.map((c: { key: string }) => c.key)).toContain('revenue');
    expect(res.body.summary.orders).toBe(1);
    expect(res.body.rows[0].revenue).toBe(280);

    const csv = await api().get('/api/v1/admin/reports/sales').query({ format: 'csv', groupBy: 'month' }).set(bearer(admin)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/sales-month_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv/);
    expect(csv.text.startsWith('﻿Month,Orders')).toBe(true);
  });

  it('lists open balances, institutions and staff workload', async () => {
    const school = await institutionToken('school@test.in');
    await api()
      .post('/api/v1/orders')
      .set(bearer(school))
      .send({ items: [{ productId: seed.products.studentId._id, quantity: 10, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);

    const due = await api().get('/api/v1/admin/reports/pending-payments').set(bearer(admin)).expect(200);
    expect(due.body.summary).toMatchObject({ orders: 1, due: 300 });

    const inst = await api().get('/api/v1/admin/reports/institutions').set(bearer(admin)).expect(200);
    expect(inst.body.rows[0]).toMatchObject({ name: 'Sunrise Public School', orders: 1, due: 300 });

    const workload = await api().get('/api/v1/admin/reports/staff').set(bearer(admin)).expect(200);
    expect(workload.body.rows.find((r: { name: string }) => r.name === 'Ravi Rider')).toMatchObject({ delivered: 1 });

    await api().get('/api/v1/admin/reports/sales').query({ from: '15-10-2026' }).set(bearer(admin)).expect(422);
  });
});
