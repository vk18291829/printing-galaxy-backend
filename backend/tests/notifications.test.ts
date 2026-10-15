import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationLogModel } from '@/modules/notifications/notification.model';
import { notifications } from '@/modules/notifications/notification.service';
import { api, connectTestDb, disconnectTestDb, withEnv } from './helpers';
import { Types } from 'mongoose';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

let restoreEnv: (() => void) | undefined;
afterEach(async () => {
  restoreEnv?.();
  vi.unstubAllGlobals();
  await NotificationLogModel.deleteMany({});
});

const send = (status = 'ready') =>
  notifications.orderStatus({ phone: '9876543210', lang: 'en', orderNumber: 'PG261015-AB12', status, orderId: new Types.ObjectId(), note: 'Counter 2' });

function mockFetch(handler: (url: string, body: Record<string, unknown>) => { ok: boolean; status?: number; json?: unknown }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url: String(url), body });
      const r = handler(String(url), body);
      return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.json ?? {}, text: async () => JSON.stringify(r.json ?? {}) } as Response;
    }),
  );
  return calls;
}

describe('notifications', () => {
  it('logs to the console when nothing is configured', async () => {
    await send();
    const log = await NotificationLogModel.findOne().lean();
    expect(log).toMatchObject({ channel: 'console', status: 'sent', template: 'order_ready' });
  });

  it('uses the approved WhatsApp template with order number, status and note', async () => {
    restoreEnv = withEnv({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_TEMPLATE_ORDER_STATUS: 'order_status_update' });
    const calls = mockFetch(() => ({ ok: true, json: { messages: [{ id: 'wamid.1' }] } }));
    await send();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      to: '919876543210',
      type: 'template',
      template: {
        name: 'order_status_update',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ text: 'PG261015-AB12' }, { text: 'is ready for pickup' }, { text: 'Counter 2' }] }],
      },
    });
    expect(await NotificationLogModel.findOne({ providerMessageId: 'wamid.1' }).lean()).toMatchObject({ channel: 'whatsapp', status: 'sent' });
  });

  it('falls back to SMS when WhatsApp rejects the message', async () => {
    restoreEnv = withEnv({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_TEMPLATE_ORDER_STATUS: 'order_status_update', MSG91_AUTH_KEY: 'k', MSG91_STATUS_TEMPLATE_ID: 'flow1' });
    const calls = mockFetch((url) => (url.includes('graph.facebook.com') ? { ok: false, status: 400, json: { error: 'template paused' } } : { ok: true }));
    await send();
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['graph.facebook.com', 'control.msg91.com']);
    expect(calls[1]!.body).toMatchObject({ template_id: 'flow1', recipients: [{ mobiles: '919876543210', var1: 'PG261015-AB12', var2: 'is ready for pickup' }] });
    const logs = await NotificationLogModel.find().sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => `${l.channel}:${l.status}`)).toEqual(['whatsapp:failed', 'sms:sent']);
  });

  it('re-sends as SMS once when the delivery webhook reports a failure', async () => {
    restoreEnv = withEnv({
      WHATSAPP_TOKEN: 't',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_APP_SECRET: 'app-secret',
      MSG91_AUTH_KEY: 'k',
      MSG91_STATUS_TEMPLATE_ID: 'flow1',
    });
    const calls = mockFetch((url) => (url.includes('graph.facebook.com') ? { ok: true, json: { messages: [{ id: 'wamid.2' }] } } : { ok: true }));
    await send('out_for_delivery');

    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.2', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }] } }] }],
    });
    const sig = `sha256=${crypto.createHmac('sha256', 'app-secret').update(payload).digest('hex')}`;
    await api().post('/api/v1/notifications/whatsapp/webhook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', 'sha256=bad').send(payload).expect(400);
    for (let i = 0; i < 2; i += 1) {
      await api().post('/api/v1/notifications/whatsapp/webhook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sig).send(payload).expect(200);
    }
    // One WhatsApp send, then exactly one SMS even though the failure arrived twice.
    expect(calls.filter((c) => c.url.includes('msg91'))).toHaveLength(1);
    const wa = await NotificationLogModel.findOne({ providerMessageId: 'wamid.2' }).lean();
    expect(wa).toMatchObject({ status: 'failed', fallbackSent: true });
    expect(wa?.error).toContain('131026');
  });

  it('answers the Meta webhook verification challenge', async () => {
    restoreEnv = withEnv({ WHATSAPP_VERIFY_TOKEN: 'verify-me' });
    const res = await api().get('/api/v1/notifications/whatsapp/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' }).expect(200);
    expect(res.text).toBe('42');
    await api().get('/api/v1/notifications/whatsapp/webhook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' }).expect(403);
  });
});
