import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PageDayModel, TrafficDayModel, VisitorDayModel } from '@/modules/analytics/analytics.model';
import { cleanPath, istDay, sourceOf } from '@/modules/analytics/analytics.service';
import { api, bearer, connectTestDb, disconnectTestDb, seedBasics, staffToken } from './helpers';

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

let admin: string;
let staff: string;

beforeAll(async () => {
  await connectTestDb();
  await seedBasics();
  admin = await staffToken('owner@test.in');
  staff = await staffToken('staff@test.in');
});
afterAll(disconnectTestDb);

/** Counting happens after the response, so give it a moment. */
const settle = () => new Promise((r) => setTimeout(r, 100));
const view = (body: object, ua = CHROME, headers: Record<string, string> = {}) =>
  api().post('/api/v1/analytics/pageview').set('User-Agent', ua).set(headers).send(body).expect(204);

describe('website visits', () => {
  it('counts views and each visitor once a day, without storing anything personal', async () => {
    await view({ path: '/', width: 390, landing: true, referrer: 'https://www.google.com/' });
    await view({ path: '/products', width: 390 });
    await view({ path: '/products?sort=new', width: 390 });
    await view({ path: '/', width: 1440, landing: true }, FIREFOX);
    await settle();

    const day = await TrafficDayModel.findOne({ date: istDay() }).lean();
    expect(day).toMatchObject({ views: 4, visitors: 2 });
    expect(day?.sources).toMatchObject({ search: 1, direct: 1 });
    expect(day?.devices).toMatchObject({ mobile: 1, desktop: 1 });
    expect((await PageDayModel.findOne({ date: istDay(), path: '/products' }).lean())?.views).toBe(2);

    // Only a daily one-way hash is kept: no address, no browser string.
    const stored = JSON.stringify(await VisitorDayModel.find().lean());
    expect(stored).not.toMatch(/Android|Firefox|127\.0\.0\.1|::ffff/);
  });

  it('ignores bots and visitors who ask not to be tracked', async () => {
    const before = (await TrafficDayModel.findOne({ date: istDay() }).lean())?.views ?? 0;
    await view({ path: '/' }, 'Googlebot/2.1 (+http://www.google.com/bot.html)');
    await view({ path: '/' }, FIREFOX, { DNT: '1' });
    await view({ path: '/' }, FIREFOX, { 'Sec-GPC': '1' });
    await settle();
    expect((await TrafficDayModel.findOne({ date: istDay() }).lean())?.views).toBe(before);
  });

  it('never keeps order ids, share links or query strings', () => {
    expect(cleanPath('/p/abcDEF123456789xyz_-token')).toBe('/p/:link');
    expect(cleanPath('/account/orders/65f1c2a9e4b0a1b2c3d4e5f6')).toBe('/account/orders/:id');
    expect(cleanPath('/Products/Wedding-Card/?ref=wa#top')).toBe('/products/wedding-card');
    expect(cleanPath('/unsubscribe?token=secret')).toBe('/unsubscribe');
    expect(sourceOf('https://l.instagram.com/x', 'shop.in')).toBe('social');
    expect(sourceOf('https://shop.in/products', 'shop.in')).toBeNull();
  });

  it('shows the totals to staff who can see reports, and to nobody else', async () => {
    await api().get('/api/v1/admin/analytics/traffic').expect(401);
    const res = await api().get('/api/v1/admin/analytics/traffic').query({ days: 7 }).set(bearer(admin)).expect(200);
    expect(res.body.series).toHaveLength(7);
    expect(res.body.today).toMatchObject({ date: istDay() });
    expect(res.body.totals.views).toBeGreaterThanOrEqual(4);
    expect(res.body.topPages[0]).toHaveProperty('path');
    // Counter staff have no "reports" permission.
    await api().get('/api/v1/admin/analytics/traffic').set(bearer(staff)).expect(403);
  });
});
