import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderModel } from '@/modules/orders/order.model';
import { FileModel } from '@/modules/uploads/file.model';
import { api, bearer, binary, connectTestDb, customerToken, disconnectTestDb, pdfWithPages, seedBasics, staffToken, upload } from './helpers';

let seed: Awaited<ReturnType<typeof seedBasics>>;
let customer: string;
let other: string;
let admin: string;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  customer = await customerToken('9876543210');
  other = await customerToken('9123456780');
  admin = await staffToken('owner@test.in');
});
afterAll(disconnectTestDb);

describe('orders', () => {
  let orderId: string;

  it('counts PDF pages on the server and re-prices the order', async () => {
    const file = await upload(customer, { name: 'notes.pdf', mimeType: 'application/pdf', bytes: await pdfWithPages(120), productId: String(seed.products.notes._id) });
    expect(file.pageCount).toBe(120);

    const res = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      // The client claims 1 page; the server uses the counted 120.
      .send({ items: [{ productId: seed.products.notes._id, pageCount: 1, copies: 3, fileIds: [file._id] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(res.body.items[0].units).toBe(360);
    expect(res.body.totals.total).toBe(432);
    expect(res.body.status).toBe('received');
    orderId = res.body._id;
  });

  it('stops other customers from reading the order or its files', async () => {
    await api().get(`/api/v1/orders/${orderId}`).set(bearer(other)).expect(404);
    await api().get(`/api/v1/orders/${orderId}/invoice`).set(bearer(other)).expect(404);
    const order = await OrderModel.findById(orderId);
    await api().get(`/api/v1/uploads/${order!.items[0]!.files[0]}/url`).set(bearer(other)).expect(404);
  });

  it('marks identity documents as sensitive', async () => {
    const file = await upload(customer, { name: 'aadhaar.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]), productId: String(seed.products.pvc._id) });
    expect(file.sensitive).toBe(true);
  });

  it('issues a GST invoice with a permanent sequential number', async () => {
    const first = await api().get(`/api/v1/orders/${orderId}/invoice`).set(bearer(customer)).buffer(true).parse(binary).expect(200);
    expect(first.headers['content-type']).toContain('application/pdf');
    expect(first.headers['content-disposition']).toMatch(/PG-\d{4}-\d{2}-00001\.pdf/);
    const pdf = await PDFDocument.load(first.body as Buffer);
    expect(pdf.getPageCount()).toBe(1);

    // Downloading again (as staff) keeps the same number.
    const again = await api().get(`/api/v1/admin/orders/${orderId}/invoice`).set(bearer(admin)).buffer(true).parse(binary).expect(200);
    expect(again.headers['content-disposition']).toEqual(first.headers['content-disposition']);
    const order = await OrderModel.findById(orderId).lean();
    expect(order?.invoice?.number).toMatch(/^PG\/\d{4}-\d{2}\/00001$/);
  });

  it('runs the quote workflow: no invoice until priced, then normal flow', async () => {
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({ items: [{ productId: seed.products.project._id, quantity: 1, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(created.body.status).toBe('quote_pending');
    await api().get(`/api/v1/orders/${created.body._id}/invoice`).set(bearer(customer)).expect(409);
    await api().patch(`/api/v1/admin/orders/${created.body._id}/status`).set(bearer(admin)).send({ status: 'printing' }).expect(409);

    const priced = await api()
      .patch(`/api/v1/admin/orders/${created.body._id}/quote`)
      .set(bearer(admin))
      .send({ items: [{ itemId: created.body.items[0]._id, lineTotal: 850 }] })
      .expect(200);
    expect(priced.body.status).toBe('received');
    expect(priced.body.totals.total).toBe(850);

    const second = await api().get(`/api/v1/orders/${created.body._id}/invoice`).set(bearer(customer)).buffer(true).parse(binary).expect(200);
    expect(second.headers['content-disposition']).toMatch(/00002\.pdf/);
  });

  it('only lets customers cancel unpaid orders that have not started', async () => {
    await api().patch(`/api/v1/admin/orders/${orderId}/status`).set(bearer(admin)).send({ status: 'printing' }).expect(200);
    await api().post(`/api/v1/orders/${orderId}/cancel`).set(bearer(customer)).send({}).expect(409);
  });

  it('records counter payments and refuses overpayment', async () => {
    await api().post(`/api/v1/admin/orders/${orderId}/payments`).set(bearer(admin)).send({ amount: 1000, provider: 'cash' }).expect(400);
    const paid = await api().post(`/api/v1/admin/orders/${orderId}/payments`).set(bearer(admin)).send({ amount: 432, provider: 'cash' }).expect(200);
    expect(paid.body.payment.status).toBe('paid');
  });

  it('schedules sensitive files for deletion when an order completes', async () => {
    const file = await upload(customer, { name: 'pan.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]), productId: String(seed.products.pvc._id) });
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(customer))
      .send({ items: [{ productId: seed.products.pvc._id, quantity: 1, fileIds: [file._id] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    for (const status of ['printing', 'ready']) {
      await api().patch(`/api/v1/admin/orders/${created.body._id}/status`).set(bearer(admin)).send({ status }).expect(200);
    }
    // Pickup needs the customer's code and the balance paid.
    await api().patch(`/api/v1/admin/orders/${created.body._id}/status`).set(bearer(admin)).send({ status: 'picked_up' }).expect(409);
    const { body: mine } = await api().get(`/api/v1/orders/${created.body._id}`).set(bearer(customer)).expect(200);
    expect(mine.handoverCode).toMatch(/^\d{4}$/);
    await api().post(`/api/v1/admin/orders/${created.body._id}/handover`).set(bearer(admin)).send({ code: mine.handoverCode }).expect(409);
    await api().post(`/api/v1/admin/orders/${created.body._id}/handover`).set(bearer(admin)).send({ code: mine.handoverCode, amountCollected: 60 }).expect(200);
    const stored = await FileModel.findById(file._id).lean();
    expect(stored?.deleteAfter).toBeInstanceOf(Date);
  });
});

describe('proof approval for personalised school items', () => {
  it('sends a proof for a medal order and moves to approved when the institution accepts', async () => {
    const school = (await import('./helpers')).institutionToken;
    const token = await school('school@test.in');
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(token))
      .send({ items: [{ productId: seed.products.medal._id, quantity: 25, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(created.body.audience).toBe('institution');
    expect(created.body.totals.total).toBe(25 * 45);

    const proof = await upload(admin, { name: 'medal-proof.pdf', mimeType: 'application/pdf', bytes: await pdfWithPages(1), purpose: 'proof' });
    const sent = await api()
      .post(`/api/v1/admin/orders/${created.body._id}/items/${created.body.items[0]._id}/proofs`)
      .set(bearer(admin))
      .send({ fileId: proof._id, message: 'Please check the school name' })
      .expect(200);
    expect(sent.body.status).toBe('proof_sent');

    // The institution can open the proof file attached to its own order.
    await api().get(`/api/v1/uploads/${proof._id}/url`).set(bearer(token)).expect(200);
    const approved = await api()
      .post(`/api/v1/orders/${created.body._id}/items/${created.body.items[0]._id}/proof`)
      .set(bearer(token))
      .send({ decision: 'approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
  });
});

describe('institution quote requests', () => {
  it('prices a requested quote, waits for acceptance, then starts the order', async () => {
    const token = await (await import('./helpers')).institutionToken('school@test.in');
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(token))
      .send({
        items: [{ productId: seed.products.medal._id, quantity: 40, fileIds: [], customSize: { width: 70, height: 70, unit: 'mm' } }],
        fulfilment: { method: 'pickup' },
        paymentMethod: 'counter',
        reference: 'PO-2026-118',
      })
      .expect(201);
    // A custom size cannot be priced from the list, so it becomes a quote request.
    expect(created.body.status).toBe('quote_pending');
    expect(created.body.quote.requested).toBe(true);
    expect(created.body.reference).toBe('PO-2026-118');
    expect(created.body.items[0].customSize).toEqual({ width: 70, height: 70, unit: 'mm' });
    await api().post(`/api/v1/orders/${created.body._id}/accept-quote`).set(bearer(token)).expect(409);

    const priced = await api()
      .patch(`/api/v1/admin/orders/${created.body._id}/quote`)
      .set(bearer(admin))
      .send({ items: [{ itemId: created.body.items[0]._id, lineTotal: 2400 }] })
      .expect(200);
    expect(priced.body.status).toBe('quote_sent');
    expect(new Date(priced.body.quote.validUntil).getTime()).toBeGreaterThan(Date.now());
    await api().patch(`/api/v1/admin/orders/${created.body._id}/status`).set(bearer(admin)).send({ status: 'printing' }).expect(409);
    await api().get(`/api/v1/orders/${created.body._id}/invoice`).set(bearer(token)).expect(409);

    const accepted = await api().post(`/api/v1/orders/${created.body._id}/accept-quote`).set(bearer(token)).expect(200);
    expect(accepted.body.status).toBe('received');
    expect(accepted.body.totals.subtotal).toBe(2400);
  });

  it('lets the institution ask for a quote on a standard item and decline it', async () => {
    const token = await (await import('./helpers')).institutionToken('school@test.in');
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(token))
      .send({ items: [{ productId: seed.products.medal._id, quantity: 100, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter', requestQuote: true })
      .expect(201);
    expect(created.body.status).toBe('quote_pending');
    // The list price is kept as the starting estimate for staff.
    expect(created.body.totals.subtotal).toBe(100 * 45);
    await api()
      .patch(`/api/v1/admin/orders/${created.body._id}/quote`)
      .set(bearer(admin))
      .send({ items: [{ itemId: created.body.items[0]._id, lineTotal: 4000 }] })
      .expect(200);
    const declined = await api().post(`/api/v1/orders/${created.body._id}/cancel`).set(bearer(token)).send({ reason: 'Over budget' }).expect(200);
    expect(declined.body.status).toBe('cancelled');
  });
});

describe('status follows actions', () => {
  it('refuses automatic steps from the dropdown and prints design items only after approval', async () => {
    const token = await (await import('./helpers')).institutionToken('school@test.in');
    const created = await api()
      .post('/api/v1/orders')
      .set(bearer(token))
      .send({ items: [{ productId: seed.products.medal._id, quantity: 20, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    const url = `/api/v1/admin/orders/${created.body._id}/status`;
    for (const status of ['proof_sent', 'approved', 'out_for_delivery', 'picked_up']) {
      await api().patch(url).set(bearer(admin)).send({ status, override: true, note: 'Trying a shortcut' }).expect(409);
    }
    const blocked = await api().patch(url).set(bearer(admin)).send({ status: 'printing' }).expect(409);
    expect(blocked.body.error.message).toMatch(/approve/);

    // The school adds its data sheet once the order is confirmed.
    const sheet = await upload(token, { name: 'students.csv', mimeType: 'text/csv', bytes: Buffer.from('Name,Class\nAsha,5A\n'), purpose: 'bulk' });
    const withSheet = await api()
      .post(`/api/v1/orders/${created.body._id}/items/${created.body.items[0]._id}/files`)
      .set(bearer(token))
      .send({ fileIds: [sheet._id] })
      .expect(200);
    expect(withSheet.body.items[0].files).toHaveLength(1);
    await api()
      .post(`/api/v1/orders/${created.body._id}/items/${created.body.items[0]._id}/files`)
      .set(bearer(token))
      .send({ fileIds: [sheet._id] })
      .expect(422);

    const proof = await upload(admin, { name: 'proof.pdf', mimeType: 'application/pdf', bytes: await pdfWithPages(1), purpose: 'proof' });
    const sent = await api()
      .post(`/api/v1/admin/orders/${created.body._id}/items/${created.body.items[0]._id}/proofs`)
      .set(bearer(admin))
      .send({ fileId: proof._id })
      .expect(200);
    expect(sent.body.status).toBe('proof_sent');
    const approved = await api()
      .post(`/api/v1/orders/${created.body._id}/items/${created.body.items[0]._id}/proof`)
      .set(bearer(token))
      .send({ decision: 'approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
    const printing = await api().patch(url).set(bearer(admin)).send({ status: 'printing' }).expect(200);
    expect(printing.body.status).toBe('printing');
  });
});

describe('order segments and due dates', () => {
  it('files orders by line of business and promises a ready-by date the shop can change', async () => {
    const { CategoryModel } = await import('@/modules/catalog/category.model');
    const { ProductModel } = await import('@/modules/catalog/product.model');
    const cat = await CategoryModel.create({ name: { en: 'Business Works' }, slug: 'business-works', audiences: ['retail'] });
    const card = await ProductModel.create({
      name: { en: 'Visiting Card' }, slug: 'visiting-card-test', category: cat._id, unit: 'piece', leadTimeDays: 2,
      pricing: { retail: { enabled: true, minQty: 1, tiers: [{ minQty: 1, unitPrice: 2 }] }, institution: { enabled: false } },
    });
    const business = await api().post('/api/v1/orders').set(bearer(customer))
      .send({ items: [{ productId: card._id, quantity: 100, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(business.body.segment).toBe('business');
    // Two working days later (Sundays skipped), never before today.
    const due = new Date(business.body.dueDate);
    expect(due.getTime()).toBeGreaterThan(Date.now() + 24 * 3600_000);

    const school = await api().post('/api/v1/orders').set(bearer(await (await import('./helpers')).institutionToken('school@test.in')))
      .send({ items: [{ productId: seed.products.medal._id, quantity: 20, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(school.body.segment).toBe('institution');

    const list = await api().get('/api/v1/admin/orders?segment=business').set(bearer(admin)).expect(200);
    expect(list.body.items.map((o: { _id: string }) => o._id)).toEqual([business.body._id]);
    expect(list.body.segmentCounts.business).toBe(1);

    const moved = await api().patch(`/api/v1/admin/orders/${business.body._id}/due`).set(bearer(admin))
      .send({ dueDate: '2020-01-02', note: 'Paper delayed' }).expect(200);
    expect(moved.body.dueDate.slice(0, 10)).toBe('2020-01-02');
    const overdue = await api().get('/api/v1/admin/orders?overdue=true').set(bearer(admin)).expect(200);
    expect(overdue.body.items.map((o: { _id: string }) => o._id)).toContain(business.body._id);
  });
});
