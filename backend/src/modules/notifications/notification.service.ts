import type { Types } from 'mongoose';
import { ApiError } from '@/common/errors';
import { emailChannel, emailEnabled, env, isProd } from '@/config/env';
import { logger, maskPhone } from '@/config/logger';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { UserModel } from '@/modules/users/user.model';
import { asLang, institutionRegisteredEmail, institutionReviewedEmail, orderEmail, otpEmail, welcomeEmail, type Lang } from './email-copy';
import { sendMail, type Mail } from './mailer';
import { NotificationClaimModel, NotificationLogModel } from './notification.model';

/**
 * Status phrases. SMS templates allow at most 30 characters per {#var#}, so keep them short.
 * SMS template: "Printing Galaxy: Your order {#var#} {#var#}. {#var#}"
 */
const STATUS_TEXT: Record<string, string> = {
  quote_pending: 'is received, price coming soon',
  awaiting_payment: 'is waiting for payment',
  delivery_failed: 'could not be delivered today',
  refunded: 'refund has been started',
  received: 'has been received',
  proof_sent: 'proof is ready to approve',
  approved: 'is approved for printing',
  printing: 'is being printed',
  ready: 'is ready for pickup',
  out_for_delivery: 'is out for delivery',
  delivered: 'has been delivered',
  picked_up: 'has been picked up. Thank you',
  cancelled: 'has been cancelled',
};

/** SMS message types with their own DLT template. Promotions use templates saved in the admin panel. */
const TEMPLATE_ENV = {
  orderStatus: 'MSG91_TEMPLATE_ORDER_STATUS',
  pickupCode: 'MSG91_TEMPLATE_PICKUP_CODE',
  deliveryCode: 'MSG91_TEMPLATE_DELIVERY_CODE',
  accountUpdate: 'MSG91_TEMPLATE_ACCOUNT_UPDATE',
  staffAlert: 'MSG91_TEMPLATE_STAFF_ALERT',
} as const;
type TemplateKey = keyof typeof TEMPLATE_ENV;

/** DLT rejects a variable longer than 30 characters; newlines and repeated spaces are removed too. */
export const smsVar = (v: string) => v.replace(/\s+/g, ' ').trim().slice(0, 30);

/**
 * One outgoing message, ready for either channel (MESSAGING_CHANNEL picks one).
 * `body` is the readable text kept in the log and printed in development.
 */
interface Message {
  phone?: string | null;
  email?: string | null;
  kind: string;
  body: string;
  /** SMS: the MSG91 template filled with `params` (var1, var2, …). */
  sms: { template: TemplateKey | { id: string }; params: string[] };
  mail: Omit<Mail, 'to' | 'headers'>;
  /** The message holds a secret (handover code): send it, but never store it or re-send it. */
  secret?: boolean;
  relatedOrder?: Types.ObjectId;
}

const templateId = (t: Message['sms']['template']) => (typeof t === 'string' ? env[TEMPLATE_ENV[t]] : t.id);

/** Sends one SMS template to many numbers in one call; every recipient gets the same variables. */
export async function sendSms(to: string[], id: string, params: string[]) {
  const vars = Object.fromEntries(params.map((v, i) => [`var${i + 1}`, smsVar(v)]));
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: env.MSG91_AUTH_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: id, short_url: '0', recipients: to.map((m) => ({ mobiles: `91${m}`, ...vars })) }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
  // MSG91 can answer 200 with { type: "error" }.
  const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (data.type === 'error') throw new Error(`MSG91: ${data.message ?? 'rejected'}`);
}

async function sendSmsOtp(to: string, code: string) {
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID ?? '');
  url.searchParams.set('mobile', `91${to}`);
  url.searchParams.set('otp', code);
  const res = await fetch(url, { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY ?? '' } });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
}

interface LogEntry {
  to: string;
  kind: string;
  body: string;
  subject?: string;
  params?: string[];
  templateId?: string;
  secret?: boolean;
  relatedOrder?: Types.ObjectId;
}

async function log(channel: 'sms' | 'email' | 'console', msg: LogEntry, error?: unknown) {
  await NotificationLogModel.create({
    channel,
    to: msg.to,
    template: msg.kind,
    templateId: msg.templateId,
    subject: msg.subject,
    body: msg.body,
    params: msg.secret ? undefined : msg.params,
    secret: msg.secret || undefined,
    status: error ? 'failed' : 'sent',
    error: error ? String((error as Error).message ?? error) : undefined,
    relatedOrder: msg.relatedOrder,
  }).catch((err) => logger.error({ err }, 'Failed to log notification'));
}

/** True the first time a key is seen; false when this exact message was already sent. */
async function claim(key: string) {
  try {
    await NotificationClaimModel.create({ _id: key });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

async function deliverEmail(msg: Message) {
  if (!msg.email) return;
  const entry: LogEntry = { ...msg, to: msg.email, subject: msg.mail.subject, body: msg.secret ? msg.body : msg.mail.text };
  if (!emailEnabled()) {
    logger.info({ to: msg.email, kind: msg.kind }, `📧 ${msg.mail.subject}\n${msg.mail.text}`);
    await log('console', entry);
    return;
  }
  try {
    await sendMail({ ...msg.mail, to: msg.email });
    await log('email', entry);
  } catch (err) {
    logger.warn({ err, kind: msg.kind }, 'Email send failed');
    await log('email', entry, err);
  }
}

async function deliverSms(msg: Message) {
  if (!msg.phone) return;
  const id = templateId(msg.sms.template);
  const entry: LogEntry = { ...msg, to: msg.phone, templateId: id, params: msg.sms.params };
  if (!env.MSG91_AUTH_KEY) {
    logger.info({ to: maskPhone(msg.phone), kind: msg.kind }, `📨 ${msg.body}`);
    await log('console', entry);
    return;
  }
  if (!id) {
    const name = typeof msg.sms.template === 'string' ? TEMPLATE_ENV[msg.sms.template] : 'template id';
    logger.warn({ kind: msg.kind }, `SMS not sent: ${name} is not set`);
    await log('sms', entry, new Error(`${name} is not set`));
    return;
  }
  try {
    await sendSms([msg.phone], id, msg.sms.params);
    await log('sms', entry);
  } catch (err) {
    logger.warn({ err, to: maskPhone(msg.phone), kind: msg.kind }, 'SMS send failed');
    await log('sms', entry, err);
  }
}

/** Email or SMS, as MESSAGING_CHANNEL says; printed to the console when that channel is not set up. */
async function deliver(msg: Message & { dedupeKey?: string }) {
  if (msg.dedupeKey && !(await claim(msg.dedupeKey))) {
    logger.debug({ key: msg.dedupeKey }, 'Notification already sent, skipped');
    return;
  }
  if (emailChannel()) await deliverEmail(msg);
  else await deliverSms(msg);
}

export const statusText = (status: string) => STATUS_TEXT[status] ?? status.replace(/_/g, ' ');

const orderUrl = (orderId: Types.ObjectId) => `${env.WEBSITE_URL.replace(/\/$/, '')}/account/orders/${orderId}`;

/** The account's chosen language, for emails. Walk-in and unknown customers get English. */
async function accountLanguage(customer?: Types.ObjectId | null, institution?: Types.ObjectId | null): Promise<Lang> {
  if (customer) return asLang((await UserModel.findById(customer).select('language').lean())?.language);
  if (institution) return asLang((await InstitutionModel.findById(institution).select('language').lean())?.language);
  return 'en';
}

export const notifications = {
  /** One-time code to an email address (email channel) or a mobile number (SMS channel). */
  async sendOtp(to: string, code: string, purpose: 'login' | 'password_reset' | 'track' = 'login', lang: Lang = 'en') {
    const byEmail = to.includes('@');
    const ready = byEmail ? emailEnabled() : Boolean(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID);
    if (ready) {
      const entry = { to, kind: 'otp', body: 'Code sent' };
      try {
        if (byEmail) {
          await sendMail({ to, lang, ...otpEmail(purpose, lang, code) });
        } else {
          await sendSmsOtp(to, code);
        }
        await log(byEmail ? 'email' : 'sms', entry);
      } catch (err) {
        await log(byEmail ? 'email' : 'sms', { ...entry, body: 'Code send failed' }, err);
        throw new ApiError(503, 'We could not send the code right now. Please try again in a minute.', 'OTP_SEND_FAILED');
      }
      return;
    }
    // Never print codes in production: without a provider sign-in by code is unavailable.
    if (isProd) {
      logger.error({ channel: byEmail ? 'email' : 'sms' }, 'Code requested but the provider is not configured');
      throw new ApiError(503, 'Sign-in by code is not available right now. Please call the shop.', 'OTP_UNAVAILABLE');
    }
    logger.info(`🔐 Code for ${byEmail ? to : maskPhone(to)}: ${code} (no ${byEmail ? 'Gmail' : 'SMS'} provider configured)`);
  },

  /**
   * Notifies the customer about an order status change. Never throws.
   * `code` is the pickup / delivery handover code: it is sent, never stored in the log.
   * `customer` / `institution` pick the email language from the account (Hindi or English).
   * `dedupeKey` makes retries of the same change send nothing.
   */
  async orderStatus(params: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    customer?: Types.ObjectId | null;
    institution?: Types.ObjectId | null;
    lang?: Lang;
    orderNumber: string;
    status: string;
    orderId: Types.ObjectId;
    note?: string;
    code?: string;
    /** Email only, e.g. the invoice once the order is complete. */
    attachments?: Mail['attachments'];
    dedupeKey?: string;
  }) {
    if (!params.phone && !params.email) return;
    const lang = params.lang ?? (await accountLanguage(params.customer, params.institution));
    const text = statusText(params.status);
    const note = params.note?.trim() ?? '';
    const mail = {
      lang,
      attachments: params.attachments,
      ...orderEmail({
        lang,
        name: params.name,
        orderNumber: params.orderNumber,
        orderId: String(params.orderId),
        status: params.status,
        note,
        code: params.code,
        invoiceAttached: Boolean(params.attachments?.length),
      }),
    };
    const base = { phone: params.phone, email: params.email, kind: `order_${params.status}`, relatedOrder: params.orderId, dedupeKey: params.dedupeKey, mail };
    let msg: Message;
    if (params.code && params.status === 'ready') {
      // SMS: "Printing Galaxy: Your order {#var#} is ready for pickup. Show code {#var#} at the counter."
      msg = { ...base, secret: true, body: `Order ${params.orderNumber} is ready for pickup. Code ••••.`, sms: { template: 'pickupCode', params: [params.orderNumber, params.code] } };
    } else if (params.code && params.status === 'out_for_delivery') {
      // SMS: "Printing Galaxy: Your order {#var#} is out for delivery. Give code {#var#} to the delivery person only after you receive it."
      msg = { ...base, secret: true, body: `Order ${params.orderNumber} is out for delivery. Code ••••.`, sms: { template: 'deliveryCode', params: [params.orderNumber, params.code] } };
    } else {
      msg = { ...base, body: `Order ${params.orderNumber} ${text}.${note ? ` ${note}` : ''}`, sms: { template: 'orderStatus', params: [params.orderNumber, text, note] } };
    }
    await deliver(msg).catch((err) => logger.error({ err, orderNumber: params.orderNumber }, 'Order notification failed'));
  },

  /** Email only: a new customer account. */
  async welcome(params: { email: string; name?: string | null; lang?: Lang }) {
    if (!emailChannel()) return;
    const lang = params.lang ?? 'en';
    await deliverEmail({
      email: params.email,
      kind: 'welcome',
      body: 'Welcome email',
      sms: { template: 'accountUpdate', params: [] },
      mail: { lang, ...welcomeEmail(lang, params.name) },
    }).catch((err) => logger.error({ err }, 'Welcome email failed'));
  },

  /** Email only: an institution registered and waits for review. */
  async institutionRegistered(params: { email: string; name: string; contactName?: string | null; lang?: Lang }) {
    if (!emailChannel()) return;
    const lang = params.lang ?? 'en';
    await deliverEmail({
      email: params.email,
      kind: 'institution_registered',
      body: `Registration received for ${params.name}`,
      sms: { template: 'accountUpdate', params: [] },
      mail: { lang, ...institutionRegisteredEmail(lang, params) },
    }).catch((err) => logger.error({ err }, 'Institution registration email failed'));
  },

  async institutionReviewed(params: { phone?: string; email?: string; name: string; contactName?: string; lang?: Lang; approved: boolean; reason?: string }) {
    // SMS: "Printing Galaxy: Your institution account {#var#} {#var#}."
    const result = params.approved ? 'is approved' : 'was not approved. Call us';
    const lang = params.lang ?? 'en';
    await deliver({
      phone: params.phone,
      email: params.email,
      kind: params.approved ? 'institution_approved' : 'institution_rejected',
      body: `Institution ${params.name} ${result}.${params.reason ? ` Reason: ${params.reason}` : ''}`,
      sms: { template: 'accountUpdate', params: [params.name, result] },
      mail: { lang, ...institutionReviewedEmail(lang, params) },
    }).catch((err) => logger.error({ err }, 'Institution notification failed'));
  },

  /**
   * Internal alerts to the shop (low stock, failed deliveries, failed jobs): the shop email, or the
   * shop phone by SMS. SMS: "Printing Galaxy alert: {#var#} - {#var#}. Check the admin panel."
   */
  async staffAlert(shop: { phone?: string | null; email?: string | null }, kind: string, title: string, subject: string) {
    const phone = shop.phone?.replace(/\D/g, '').slice(-10);
    const email = shop.email?.trim();
    if (emailChannel() ? !email : !phone || phone.length !== 10) {
      logger.warn({ kind }, `⚠️ ${title}: ${subject} (no shop ${emailChannel() ? 'email' : 'phone number'} in settings)`);
      return;
    }
    await deliver({
      phone,
      email,
      kind,
      body: `${title} - ${subject}`,
      sms: { template: 'staffAlert', params: [title, subject] },
      mail: { subject: `Alert: ${title}`, text: `${title}: ${subject}.\n\nOpen the admin panel for details.` },
    }).catch((err) => logger.error({ err }, 'Staff alert failed'));
  },
};

const HINDI = /[\u0900-\u097F]/;

/** SMS template for a log entry written before template ids were stored. */
function templateFor(kind: string): TemplateKey {
  if (kind.startsWith('order_')) return 'orderStatus';
  if (kind.startsWith('institution_')) return 'accountUpdate';
  return 'staffAlert';
}

/** Re-sends a logged message (System activity → Retry). Returns the new log entry. */
export async function retryNotification(id: string) {
  const entry = await NotificationLogModel.findById(id);
  if (!entry) throw ApiError.notFound('Message');
  if (entry.template === 'otp') throw ApiError.badRequest('Login codes cannot be re-sent; the customer requests a new one');
  const isEmail = entry.channel === 'email' || entry.to.includes('@');
  if (entry.secret || (isEmail ? !entry.subject : !entry.params?.length)) {
    // Pickup / delivery code messages: the code is never stored.
    throw ApiError.badRequest('This message cannot be re-sent. Pickup and delivery codes are shown on the customer’s order page.');
  }
  entry.retries += 1;
  await entry.save();
  const body = entry.body ?? '';
  const relatedOrder = entry.relatedOrder ?? undefined;
  if (isEmail) {
    await deliverEmail({
      email: entry.to,
      kind: entry.template,
      body,
      sms: { template: 'orderStatus', params: [] },
      mail: {
        subject: entry.subject!,
        text: body,
        lang: HINDI.test(body) ? 'hi' : 'en',
        action: relatedOrder ? { label: HINDI.test(body) ? 'ऑर्डर देखें' : 'View your order', url: orderUrl(relatedOrder) } : undefined,
      },
      relatedOrder,
    });
  } else {
    await deliverSms({
      phone: entry.to,
      kind: entry.template,
      body,
      sms: { template: entry.templateId ? { id: entry.templateId } : templateFor(entry.template), params: entry.params ?? [] },
      mail: { subject: '', text: '' },
      relatedOrder,
    });
  }
  return NotificationLogModel.findOne({ to: entry.to, template: entry.template }).sort({ createdAt: -1 }).lean();
}
