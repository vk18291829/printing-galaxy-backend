import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, connectTestDb, disconnectTestDb, PASSWORD, seedBasics, staffToken } from './helpers';

let owner: string;
let seed: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  owner = await staffToken('owner@test.in');
});
afterAll(disconnectTestDb);

async function hire(email: string, staffRoles: string[]) {
  await api().post('/api/v1/admin/users/staff').set(bearer(owner)).send({ name: email.split('@')[0], email, role: 'staff', staffRoles, password: PASSWORD }).expect(201);
  return staffToken(email);
}

describe('staff job roles', () => {
  it('gives each role only its own areas, and several roles add up', async () => {
    const catalogue = await hire('cat@test.in', ['catalogue']);
    const counter = await hire('counter@test.in', ['counter']);
    const both = await hire('both@test.in', ['counter', 'catalogue']);

    const me = await api().get('/api/v1/auth/me').set(bearer(both)).expect(200);
    expect(me.body.user.permissions).toEqual(expect.arrayContaining(['orders', 'walkin', 'catalog', 'marketing']));
    expect(me.body.user.permissions).not.toContain('refunds');

    await api().get('/api/v1/admin/orders').set(bearer(catalogue)).expect(403);
    await api().get('/api/v1/admin/orders').set(bearer(counter)).expect(200);
    await api().get('/api/v1/admin/orders').set(bearer(both)).expect(200);

    const category = { name: { en: 'Stickers' }, slug: 'stickers-perm-test' };
    await api().post('/api/v1/admin/catalog/categories').set(bearer(counter)).send(category).expect(403);
    await api().post('/api/v1/admin/catalog/categories').set(bearer(catalogue)).send(category).expect(201);

    // Owner-only areas stay owner-only whatever the roles.
    await api().get('/api/v1/admin/audit').set(bearer(both)).expect(403);
    await api().patch(`/api/v1/admin/institutions/${seed.institutions.pendingSchool._id}/status`).set(bearer(both)).send({ status: 'approved' }).expect(403);
  });

  it('applies a role change on the next request', async () => {
    const token = await hire('switch@test.in', ['catalogue']);
    await api().get('/api/v1/admin/orders').set(bearer(token)).expect(403);
    const list = await api().get('/api/v1/admin/users/staff').set(bearer(owner)).expect(200);
    const person = list.body.find((u: { email: string }) => u.email === 'switch@test.in');
    await api().patch(`/api/v1/admin/users/staff/${person._id}`).set(bearer(owner)).send({ staffRoles: ['production'] }).expect(200);
    await api().get('/api/v1/admin/orders').set(bearer(token)).expect(200);
  });
});
