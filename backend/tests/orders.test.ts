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
    for (const status of ['printing', 'ready', 'picked_up']) {
      await api().patch(`/api/v1/admin/orders/${created.body._id}/status`).set(bearer(admin)).send({ status }).expect(200);
    }
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
