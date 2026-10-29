import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileModel } from '@/modules/uploads/file.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, seedBasics, upload } from './helpers';

// The smallest valid PNG (1×1, transparent).
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));

beforeAll(async () => {
  await connectTestDb();
  await seedBasics();
});
afterAll(disconnectTestDb);

describe('profile photo', () => {
  it('saves only the customer’s own avatar upload and retires the photo it replaces', async () => {
    const token = await customerToken('9876512345');
    const other = await customerToken('9876554321');

    // Images only, and small.
    await api()
      .post('/api/v1/uploads/presign')
      .set(bearer(token))
      .send({ fileName: 'me.pdf', mimeType: 'application/pdf', size: 1000, purpose: 'avatar' })
      .expect(400);
    await api()
      .post('/api/v1/uploads/presign')
      .set(bearer(token))
      .send({ fileName: 'me.png', mimeType: 'image/png', size: 6 * 1024 * 1024, purpose: 'avatar' })
      .expect(400);

    const first = await upload(token, { name: 'me.png', mimeType: 'image/png', bytes: PNG, purpose: 'avatar' });
    const saved = await api().patch('/api/v1/account').set(bearer(token)).send({ avatarFileId: first._id }).expect(200);
    expect(saved.body.user.avatarUrl).toBeTruthy();
    expect((await FileModel.findById(first._id))?.attachedAt).toBeTruthy();

    // Someone else's upload, or an upload made for an order, cannot become the photo.
    const theirs = await upload(other, { name: 'x.png', mimeType: 'image/png', bytes: PNG, purpose: 'avatar' });
    await api().patch('/api/v1/account').set(bearer(token)).send({ avatarFileId: theirs._id }).expect(400);
    const orderFile = await upload(token, { name: 'y.png', mimeType: 'image/png', bytes: PNG });
    await api().patch('/api/v1/account').set(bearer(token)).send({ avatarFileId: orderFile._id }).expect(400);
    await api().patch('/api/v1/account').set(bearer(token)).send({ avatarUrl: 'https://evil.example/x.png' }).expect(200);
    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    if (me.status === 200) expect(JSON.stringify(me.body)).not.toContain('evil.example');

    // A new photo replaces the old one, which is cleaned up.
    const second = await upload(token, { name: 'me2.png', mimeType: 'image/png', bytes: PNG, purpose: 'avatar' });
    const replaced = await api().patch('/api/v1/account').set(bearer(token)).send({ avatarFileId: second._id }).expect(200);
    expect(replaced.body.user.avatarUrl).not.toEqual(saved.body.user.avatarUrl);
    expect((await FileModel.findById(first._id))?.deleteAfter).toBeTruthy();

    // Removing it.
    const removed = await api().patch('/api/v1/account').set(bearer(token)).send({ avatarFileId: null }).expect(200);
    expect(removed.body.user.avatarUrl).toBeUndefined();
    expect((await FileModel.findById(second._id))?.deleteAfter).toBeTruthy();
  });
});
