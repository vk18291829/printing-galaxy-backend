import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProductModel } from '@/modules/catalog/product.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, institutionToken, seedBasics, staffToken } from './helpers';

beforeAll(async () => {
  await connectTestDb();
  await seedBasics();
});
afterAll(disconnectTestDb);

describe('reviews', () => {
  it('keeps a review hidden until staff approve it, then updates the product rating', async () => {
    const customer = await customerToken('9333333333');
    await api().post('/api/v1/products/notes-print-bw/reviews').send({ rating: 5 }).expect(401);
    await api().post('/api/v1/products/notes-print-bw/reviews').set(bearer(customer)).send({ rating: 6 }).expect(422);

    await api()
      .post('/api/v1/products/notes-print-bw/reviews')
      .set(bearer(customer))
      .send({ rating: 4, title: 'Crisp print', comment: 'Ready in an hour.' })
      .expect(201);

    const before = await api().get('/api/v1/products/notes-print-bw/reviews').set(bearer(customer)).expect(200);
    expect(before.body.reviews).toHaveLength(0);
    expect(before.body.mine.status).toBe('pending');
    expect(before.body.mine.authorName).toBe('Test Customer');

    const staff = await staffToken('staff@test.in');
    const list = await api().get('/api/v1/admin/reviews?status=pending').set(bearer(staff)).expect(200);
    expect(list.body.stats.pending).toBe(1);
    const id = list.body.items[0]._id as string;

    await api().patch(`/api/v1/admin/reviews/${id}`).set(bearer(staff)).send({ status: 'approved', reply: 'Thank you!' }).expect(200);
    const after = await api().get('/api/v1/products/notes-print-bw/reviews').expect(200);
    expect(after.body.reviews).toHaveLength(1);
    expect(after.body.reviews[0].reply.text).toBe('Thank you!');
    expect(after.body.summary).toMatchObject({ average: 4, count: 1, breakdown: [0, 0, 0, 1, 0] });
    expect((await ProductModel.findOne({ slug: 'notes-print-bw' }).lean())?.rating).toEqual({ average: 4, count: 1 });

    // Editing sends it back for approval and drops it from the average.
    await api().post('/api/v1/products/notes-print-bw/reviews').set(bearer(customer)).send({ rating: 2 }).expect(201);
    const edited = await api().get('/api/v1/products/notes-print-bw/reviews').expect(200);
    expect(edited.body.summary.count).toBe(0);

    // Only the owner can delete.
    await api().delete(`/api/v1/admin/reviews/${id}`).set(bearer(staff)).expect(403);
    const owner = await staffToken('owner@test.in');
    await api().delete(`/api/v1/admin/reviews/${id}`).set(bearer(owner)).expect(204);
  });

  it('lets institutions review but not staff', async () => {
    const school = await institutionToken('school@test.in');
    await api().post('/api/v1/products/school-medal/reviews').set(bearer(school)).send({ rating: 5, comment: 'Great medals' }).expect(201);
    const staff = await staffToken('staff@test.in');
    await api().post('/api/v1/products/school-medal/reviews').set(bearer(staff)).send({ rating: 5 }).expect(403);
  });
});

describe('banners', () => {
  it('serves only active banners inside their schedule, grouped by placement', async () => {
    const owner = await staffToken('owner@test.in');
    const staff = await staffToken('staff@test.in');
    const banner = { kind: 'offer', title: { en: '10% off' }, couponCode: 'save10', link: '/products' };

    await api().post('/api/v1/admin/marketing/banners').set(bearer(staff)).send(banner).expect(403);
    await api().post('/api/v1/admin/marketing/banners').set(bearer(owner)).send({ ...banner, link: 'javascript:alert(1)' }).expect(422);
    const created = await api().post('/api/v1/admin/marketing/banners').set(bearer(owner)).send(banner).expect(201);
    expect(created.body.couponCode).toBe('SAVE10');

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await api()
      .post('/api/v1/admin/marketing/banners')
      .set(bearer(owner))
      .send({ kind: 'hero', title: { en: 'Coming soon' }, startsAt: tomorrow })
      .expect(201);

    const live = await api().get('/api/v1/marketing/banners').expect(200);
    expect(live.body.offer).toHaveLength(1);
    expect(live.body.hero).toHaveLength(0);

    await api().patch(`/api/v1/admin/marketing/banners/${created.body._id}/active`).set(bearer(owner)).send({ isActive: false }).expect(200);
    expect((await api().get('/api/v1/marketing/banners').expect(200)).body.offer).toHaveLength(0);
  });

  it('returns an empty product list for an unknown category instead of an error', async () => {
    const res = await api().get('/api/v1/products?category=does-not-exist').expect(200);
    expect(res.body).toEqual([]);
  });
});

describe('catalogue browse', () => {
  it('pages through products and sorts by the cheapest price', async () => {
    const first = await api().get('/api/v1/products/browse?limit=2&sort=price-asc').expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.pages).toBe(Math.ceil(first.body.total / 2));
    expect(first.body.items[0].category.slug).toBe('printing');

    const all = await api().get(`/api/v1/products/browse?limit=48&sort=price-asc`).expect(200);
    const prices = all.body.items.map((p: { pricing: { retail: { tiers: { unitPrice: number }[] } } }) =>
      Math.min(...p.pricing.retail.tiers.map((t) => t.unitPrice), Infinity),
    );
    const priced = prices.filter((p: number) => Number.isFinite(p));
    expect(priced).toEqual([...priced].sort((a, b) => a - b));

    const second = await api().get('/api/v1/products/browse?limit=2&page=2&sort=price-asc').expect(200);
    expect(second.body.items[0]._id).not.toBe(first.body.items[0]._id);

    const none = await api().get('/api/v1/products/browse?category=nope').expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });
});
