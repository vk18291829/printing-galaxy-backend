import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import type { Transporter } from 'nodemailer';
import { CampaignModel } from '@/modules/marketing/promo.model';
import { insideSendWindow, unsubscribeUrl } from '@/modules/marketing/promo.service';
import { resetMailer } from '@/modules/notifications/mailer';
import { NotificationLogModel } from '@/modules/notifications/notification.model';
import { notifications, retryNotification } from '@/modules/notifications/notification.service';
import { UserModel } from '@/modules/users/user.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, seedBasics, staffToken, withEnv } from './helpers';

let admin: string;
let staff: string;

beforeAll(async () => {
  await connectTestDb();
  await seedBasics();
  admin = await staffToken('owner@test.in');
  staff = await staffToken('staff@test.in');
});
afterAll(disconnectTestDb);

let restoreEnv: (() => void) | undefined;
afterEach(async () => {
  restoreEnv?.();
  restoreEnv = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await NotificationLogModel.deleteMany({});
});

const SMS_ENV = {
  MSG91_AUTH_KEY: 'k',
  MSG91_TEMPLATE_ORDER_STATUS: 'tpl-status',
  MSG91_TEMPLATE_PICKUP_CODE: 'tpl-pickup',
  MSG91_TEMPLATE_DELIVERY_CODE: 'tpl-delivery',
};

const send = (status = 'printing', extra: { code?: string; note?: string } = { note: 'Counter 2' }) =>
  notifications.orderStatus({ phone: '9876543210', orderNumber: 'PG261015-AB12', status, orderId: new Types.ObjectId(), ...extra });

function mockFetch(handler: (url: string, body: Record<string, unknown>) => { ok: boolean; status?: number; json?: unknown } = () => ({ ok: true, json: { type: 'success' } })) {
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

describe('order SMS', () => {
  it('logs to the console when MSG91 is not configured', async () => {
    await send();
    const log = await NotificationLogModel.findOne().lean();
    expect(log).toMatchObject({ channel: 'console', status: 'sent', template: 'order_printing' });
  });

  it('sends the status template with order number, status and note', async () => {
    restoreEnv = withEnv(SMS_ENV);
    const calls = mockFetch();
    await send();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://control.msg91.com/api/v5/flow');
    expect(calls[0]!.body).toMatchObject({
      template_id: 'tpl-status',
      recipients: [{ mobiles: '919876543210', var1: 'PG261015-AB12', var2: 'is being printed', var3: 'Counter 2' }],
    });
    expect(await NotificationLogModel.findOne().lean()).toMatchObject({ channel: 'sms', status: 'sent', templateId: 'tpl-status' });
  });

  it('sends the pickup code in its own template and never logs it', async () => {
    restoreEnv = withEnv(SMS_ENV);
    const calls = mockFetch();
    await send('ready', { code: '4821' });
    expect(calls[0]!.body).toMatchObject({ template_id: 'tpl-pickup', recipients: [{ var1: 'PG261015-AB12', var2: '4821' }] });
    const log = await NotificationLogModel.findOne().lean();
    expect(JSON.stringify(log)).not.toContain('4821');
    await expect(retryNotification(String(log!._id))).rejects.toThrow(/cannot be re-sent/);
  });

  it('cuts every variable to the 30 characters DLT allows', async () => {
    restoreEnv = withEnv(SMS_ENV);
    const calls = mockFetch();
    await send('printing', { note: 'Collect from counter 2 after 5 PM today please' });
    const recipient = (calls[0]!.body.recipients as Record<string, string>[])[0]!;
    expect(recipient.var3).toHaveLength(30);
  });

  it('records a failure when the template id is missing, and when MSG91 rejects the SMS', async () => {
    restoreEnv = withEnv({ MSG91_AUTH_KEY: 'k', MSG91_TEMPLATE_ORDER_STATUS: undefined });
    mockFetch();
    await send();
    expect(await NotificationLogModel.findOne().lean()).toMatchObject({ status: 'failed', error: 'MSG91_TEMPLATE_ORDER_STATUS is not set' });

    restoreEnv();
    restoreEnv = withEnv(SMS_ENV);
    mockFetch(() => ({ ok: true, json: { type: 'error', message: 'Template not approved' } }));
    await send('printing', { note: 'x' });
    const failed = await NotificationLogModel.findOne({ error: /Template not approved/ }).lean();
    expect(failed).toMatchObject({ status: 'failed' });

    // Retry from System activity uses the stored template and variables.
    const calls = mockFetch();
    const latest = await retryNotification(String(failed!._id));
    expect(calls[0]!.body).toMatchObject({ template_id: 'tpl-status', recipients: [{ var1: 'PG261015-AB12', var3: 'x' }] });
    expect(latest).toMatchObject({ status: 'sent' });
  });
});

let customer: string;
let optedOut: string;

describe('promotional SMS (SMS channel)', () => {
  const TEXT = 'Printing Galaxy offer: {#var#} on {#var#}. Order at printinggalaxy.in';
  let templateId: string;

  it('lets only the owner manage templates', async () => {
    await api().get('/api/v1/admin/marketing/promotions/templates').set(bearer(staff)).expect(403);
    const res = await api()
      .post('/api/v1/admin/marketing/promotions/templates')
      .set(bearer(admin))
      .send({ name: 'Festive offer', msg91TemplateId: 'tpl-promo-1', text: TEXT })
      .expect(201);
    templateId = res.body._id;
  });

  it('only sends between 10 AM and 9 PM', () => {
    expect(insideSendWindow(new Date('2026-10-17T04:30:00Z'))).toBe(true); // 10:00 IST
    expect(insideSendWindow(new Date('2026-10-17T15:29:00Z'))).toBe(true); // 20:59 IST
    expect(insideSendWindow(new Date('2026-10-17T15:30:00Z'))).toBe(false); // 21:00 IST
    expect(insideSendWindow(new Date('2026-10-17T04:29:00Z'))).toBe(false); // 09:59 IST
  });

  it('sends to opted-in customers only, with the values checked', async () => {
    customer = await customerToken('9100000001');
    await customerToken('9100000002');
    optedOut = await customerToken('9100000003');
    await api().patch('/api/v1/account').set(bearer(optedOut)).send({ offers: false }).expect(200);
    expect(await UserModel.findOne({ phone: '9100000003' }).lean()).toMatchObject({ offers: false });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T06:30:00Z')); // 12:00 IST
    restoreEnv = withEnv({ MSG91_AUTH_KEY: 'k' });
    const calls = mockFetch();

    const overview = await api().get('/api/v1/admin/marketing/promotions/overview').set(bearer(admin)).expect(200);
    expect(overview.body).toMatchObject({ channel: 'sms', configured: true, insideWindow: true, audience: 2 });

    await api().post('/api/v1/admin/marketing/promotions/campaigns').set(bearer(admin)).send({ templateId, params: ['20% off'] }).expect(400);
    await api()
      .post('/api/v1/admin/marketing/promotions/campaigns')
      .set(bearer(admin))
      .send({ templateId, params: ['20% off', 'all visiting cards and wedding invites'] })
      .expect(400);

    const res = await api().post('/api/v1/admin/marketing/promotions/campaigns').set(bearer(admin)).send({ templateId, params: ['20% off', 'visiting cards'] }).expect(202);
    expect(res.body.text).toBe('Printing Galaxy offer: 20% off on visiting cards. Order at printinggalaxy.in');
    await vi.waitFor(async () => expect((await CampaignModel.findById(res.body._id).lean())?.status).toBe('sent'));

    const mobiles = calls.flatMap((c) => (c.body.recipients as { mobiles: string }[]).map((r) => r.mobiles));
    expect(mobiles).toContain('919100000001');
    expect(mobiles).toContain('919100000002');
    expect(mobiles).not.toContain('919100000003');
    expect(calls[0]!.body.template_id).toBe('tpl-promo-1');
    expect((calls[0]!.body.recipients as object[])[0]).toMatchObject({ var1: '20% off', var2: 'visiting cards' });
  });
});

describe('updates page', () => {
  it('shows sent offers to opted-in customers, with an unread count that clears', async () => {
    // The campaign above ran under a faked clock, before these customers signed up.
    await CampaignModel.collection.updateMany({}, { $set: { createdAt: new Date() } });
    const res = await api().get('/api/v1/account/updates').set(bearer(customer)).expect(200);
    expect(res.body.items[0]).toMatchObject({ kind: 'offer', text: 'Printing Galaxy offer: 20% off on visiting cards. Order at printinggalaxy.in' });
    expect(res.body.unread).toBe(1);

    await api().post('/api/v1/account/updates/seen').set(bearer(customer)).expect(204);
    const after = await api().get('/api/v1/account/updates').set(bearer(customer)).expect(200);
    expect(after.body.unread).toBe(0);

    const none = await api().get('/api/v1/account/updates').set(bearer(optedOut)).expect(200);
    expect(none.body.items).toEqual([]);
  });
});

/** Captures emails instead of sending them through Gmail. */
function fakeGmail() {
  const sent: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }[] = [];
  resetMailer({ sendMail: async (m: (typeof sent)[number]) => (sent.push(m), { messageId: `<${sent.length}@test>` }) } as unknown as Transporter);
  return sent;
}

describe('email channel', () => {
  afterEach(() => resetMailer());

  it('signs customers in with a code sent by email', async () => {
    restoreEnv = withEnv({ MESSAGING_CHANNEL: 'email' });
    await api().post('/api/v1/auth/otp/request').send({ phone: '9100000009' }).expect(400);
    const otp = await api().post('/api/v1/auth/otp/request').send({ email: 'Asha@Example.com' }).expect(200);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    const res = await api().post('/api/v1/auth/otp/verify').send({ email: 'asha@example.com', code: otp.body.devCode, name: 'Asha' }).expect(200);
    expect(res.body).toMatchObject({ isNew: true, user: { email: 'asha@example.com', name: 'Asha' } });

    const settings = await api().get('/api/v1/settings/public').expect(200);
    expect(settings.body.messaging).toBe('email');
  });

  it('emails the sign-in code through Gmail when it is set up', async () => {
    restoreEnv = withEnv({ MESSAGING_CHANNEL: 'email', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' });
    const sent = fakeGmail();
    const otp = await api().post('/api/v1/auth/otp/request').send({ email: 'ravi@example.com' }).expect(200);
    expect(otp.body.devCode).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ravi@example.com');
    // The code sits on its own line.
    expect(sent[0]!.text).toMatch(/\n\d{6}\n/);
  });

  it('emails order updates with the pickup code, and keeps the code out of the log', async () => {
    restoreEnv = withEnv({ MESSAGING_CHANNEL: 'email', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'x', WEBSITE_URL: 'https://printinggalaxy.in' });
    const sent = fakeGmail();
    const orderId = new Types.ObjectId();
    await notifications.orderStatus({ phone: '9876543210', email: 'asha@example.com', name: 'Asha Verma', orderNumber: 'PG261015-AB12', status: 'ready', orderId, code: '4821' });
    expect(sent[0]).toMatchObject({ to: 'asha@example.com', subject: 'Order PG261015-AB12: Ready for pickup' });
    expect(sent[0]!.text).toContain('Hi Asha,');
    expect(sent[0]!.text).toContain('Show this code at the counter: 4821');
    expect(sent[0]!.html).toContain(`https://printinggalaxy.in/account/orders/${orderId}`);
    const log = await NotificationLogModel.findOne().lean();
    expect(log).toMatchObject({ channel: 'email', status: 'sent', secret: true });
    expect(JSON.stringify(log)).not.toContain('4821');
  });

  it('sends promotional emails with a working unsubscribe link', async () => {
    restoreEnv = withEnv({ MESSAGING_CHANNEL: 'email', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'x' });
    const sent = fakeGmail();
    const overview = await api().get('/api/v1/admin/marketing/promotions/overview').set(bearer(admin)).expect(200);
    expect(overview.body).toMatchObject({ channel: 'email', configured: true, insideWindow: true });

    await api().post('/api/v1/admin/marketing/promotions/campaigns').set(bearer(admin)).send({ subject: 'Hi', message: 'short' }).expect(422);
    const res = await api()
      .post('/api/v1/admin/marketing/promotions/campaigns')
      .set(bearer(admin))
      .send({ subject: 'Diwali offer', message: '20% off all visiting cards this week.', link: 'https://printinggalaxy.in/products', buttonLabel: 'See offers' })
      .expect(202);
    await vi.waitFor(async () => expect((await CampaignModel.findById(res.body._id).lean())?.status).toBe('sent'), { timeout: 10_000 });
    const asha = sent.find((m) => m.to === 'asha@example.com')!;
    expect(asha.subject).toBe('Diwali offer');
    expect(asha.headers?.['List-Unsubscribe']).toContain('/unsubscribe?u=');

    const user = await UserModel.findOne({ email: 'asha@example.com' }).lean();
    const url = new URL(unsubscribeUrl(String(user!._id)));
    await api().post('/api/v1/marketing/unsubscribe').send({ u: url.searchParams.get('u'), t: 'not-the-right-token' }).expect(400);
    await api().post('/api/v1/marketing/unsubscribe').send({ u: url.searchParams.get('u'), t: url.searchParams.get('t') }).expect(200);
    expect((await UserModel.findById(user!._id).lean())?.offers).toBe(false);
  });
});
