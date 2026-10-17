import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionModel } from '@/modules/auth/session.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, institutionToken, PASSWORD, seedBasics, staffToken } from './helpers';

let seed: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
});
afterAll(disconnectTestDb);

describe('auth', () => {
  it('signs a customer in with an OTP and rotates the refresh cookie', async () => {
    const otp = await api().post('/api/v1/auth/otp/request').send({ phone: '+91 98765 43210' }).expect(200);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    await api().post('/api/v1/auth/otp/verify').send({ phone: '9876543210', code: '000000' === otp.body.devCode ? '111111' : '000000' }).expect(400);

    const login = await api().post('/api/v1/auth/otp/verify').send({ phone: '9876543210', code: otp.body.devCode }).expect(200);
    expect(login.body.isNew).toBe(true);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    expect(cookie.join(';')).toMatch(/httponly/i);

    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const rotated = refreshed.headers['set-cookie'] as unknown as string[];
    expect(rotated.join(';')).not.toEqual(cookie.join(';'));

    // A second tab refreshing at the same moment still gets in, without a new cookie.
    const sameMoment = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    expect(sameMoment.body.accessToken).toBeTruthy();
    expect(sameMoment.headers['set-cookie']).toBeUndefined();

    // Used again later, the old token is treated as stolen: the whole sign-in is revoked.
    await SessionModel.updateMany({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    await api().post('/api/v1/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('keeps riders and customers out of the admin API', async () => {
    const rider = await staffToken('rider@test.in');
    await api().get('/api/v1/admin/dashboard').set(bearer(rider)).expect(403);
    const customer = await customerToken('9123456789');
    await api().get('/api/v1/admin/orders').set(bearer(customer)).expect(403);
    const staff = await staffToken('staff@test.in');
    await api().get('/api/v1/admin/dashboard').set(bearer(staff)).expect(200);
    // Reports are owner-only.
    await api().get('/api/v1/admin/reports/sales').set(bearer(staff)).expect(403);
  });

  it('gives pending institutions individual prices until approved', async () => {
    const pending = await institutionToken('pending@test.in');
    const quote = await api()
      .post('/api/v1/pricing/quote')
      .set(bearer(pending))
      .send({ productId: seed.products.studentId._id, quantity: 10 })
      .expect(200);
    expect(quote.body.audience).toBe('retail');

    const approved = await institutionToken('school@test.in');
    const q2 = await api().post('/api/v1/pricing/quote').set(bearer(approved)).send({ productId: seed.products.studentId._id, quantity: 10 }).expect(200);
    expect(q2.body.audience).toBe('institution');
    expect(q2.body.unitPrice).toBe(30);
  });

  it('rejects a wrong staff password', async () => {
    await api().post('/api/v1/auth/staff/login').send({ email: 'owner@test.in', password: `${PASSWORD}x` }).expect(401);
  });
});
