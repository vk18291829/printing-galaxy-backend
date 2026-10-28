import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: string }[] = [];
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload });
      return {};
    }),
  },
}));

const { api, bearer, connectTestDb, customerToken, disconnectTestDb, PASSWORD, seedBasics, staffToken, withEnv } = await import('./helpers');
const { PushSubscriptionModel } = await import('@/modules/push/push.service');

let seed: Awaited<ReturnType<typeof seedBasics>>;
let restore: () => void;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  restore = withEnv({ VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private' });
});
afterAll(async () => {
  restore();
  await disconnectTestDb();
});

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });

describe('staff phone notifications', () => {
  it('tells staff who can act on it about a new order, and drops dead subscriptions', async () => {
    const owner = await staffToken('owner@test.in');
    expect((await api().get('/api/v1/admin/push/key').set(bearer(owner)).expect(200)).body.publicKey).toBe('test-public');
    await api().post('/api/v1/admin/push/subscribe').set(bearer(owner)).send(sub('https://push.example/owner')).expect(204);
    await api().post('/api/v1/admin/push/subscribe').set(bearer(owner)).send(sub('https://push.example/gone')).expect(204);

    // A catalogue-only person is not told about orders.
    await api().post('/api/v1/admin/users/staff').set(bearer(owner)).send({ name: 'Cat', email: 'cat-push@test.in', role: 'staff', staffRoles: ['catalogue'], password: PASSWORD }).expect(201);
    const cat = await staffToken('cat-push@test.in');
    await api().post('/api/v1/admin/push/subscribe').set(bearer(cat)).send(sub('https://push.example/catalogue')).expect(204);

    const customer = await customerToken('9555555555');
    const placed = await api().post('/api/v1/orders').set(bearer(customer))
      .send({ items: [{ productId: seed.products.studentId._id, quantity: 1, fileIds: [] }], fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);

    await vi.waitFor(() => expect(sent.some((s) => s.endpoint.endsWith('/owner'))).toBe(true));
    const payload = JSON.parse(sent.find((s) => s.endpoint.endsWith('/owner'))!.payload);
    expect(payload.title).toBe(`New order ${placed.body.orderNumber}`);
    expect(payload.url).toMatch(new RegExp(`/orders/${placed.body._id}$`));
    expect(sent.some((s) => s.endpoint.endsWith('/catalogue'))).toBe(false);
    await vi.waitFor(async () => expect(await PushSubscriptionModel.exists({ endpoint: 'https://push.example/gone' })).toBeNull());

    // The same alert waits in the owner's bell, unread, and not in the catalogue person's.
    const bell = (await api().get('/api/v1/admin/alerts').set(bearer(owner)).expect(200)).body;
    expect(bell.unread).toBe(1);
    expect(bell.items[0]).toMatchObject({ kind: 'order', title: `New order ${placed.body.orderNumber}`, path: `/orders/${placed.body._id}`, read: false });
    expect((await api().get('/api/v1/admin/alerts').set(bearer(cat)).expect(200)).body).toMatchObject({ unread: 0, items: [] });

    await api().post('/api/v1/admin/alerts/read').set(bearer(owner)).send({}).expect(204);
    const after = (await api().get('/api/v1/admin/alerts').set(bearer(owner)).expect(200)).body;
    expect(after.unread).toBe(0);
    expect(after.items[0].read).toBe(true);
  });
});
