import type { Types } from 'mongoose';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { NotificationLogModel } from './notification.model';

type Lang = 'en' | 'hi';
type Channel = 'whatsapp' | 'sms' | 'console';

const STATUS_TEXT: Record<string, Record<Lang, string>> = {
  quote_pending: { en: 'received — we will share a price shortly', hi: 'प्राप्त हुआ — हम जल्द ही कीमत बताएँगे' },
  received: { en: 'received', hi: 'प्राप्त हो गया है' },
  proof_sent: { en: 'proof is ready for your approval', hi: 'का प्रूफ़ आपकी मंज़ूरी के लिए तैयार है' },
  approved: { en: 'approved and queued for printing', hi: 'मंज़ूर हो गया है और प्रिंटिंग की कतार में है' },
  printing: { en: 'is being printed', hi: 'प्रिंट हो रहा है' },
  ready: { en: 'is ready for pickup', hi: 'पिकअप के लिए तैयार है' },
  out_for_delivery: { en: 'is out for delivery', hi: 'डिलीवरी के लिए निकल चुका है' },
  delivered: { en: 'has been delivered', hi: 'डिलीवर हो गया है' },
  picked_up: { en: 'has been picked up. Thank you!', hi: 'ले लिया गया है। धन्यवाद!' },
  cancelled: { en: 'has been cancelled', hi: 'रद्द कर दिया गया है' },
};

/**
 * One outgoing message. `body` is the full text (console, in-session WhatsApp, SMS without a
 * template); `template` is the approved WhatsApp template used when one is configured.
 * Template variables are also passed to the SMS flow as var1…varN.
 */
interface Message {
  to: string;
  kind: string;
  body: string;
  template?: { name?: string; lang: Lang; params: string[] };
  relatedOrder?: Types.ObjectId;
}

const whatsappEnabled = () => Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
const smsEnabled = () => Boolean(env.MSG91_AUTH_KEY && env.MSG91_STATUS_TEMPLATE_ID);

/** Meta rejects empty template parameters and ones with newlines or long runs of spaces. */
const templateParam = (v: string) => v.replace(/\s+/g, ' ').trim().slice(0, 900) || '-';

async function sendWhatsApp(msg: Message): Promise<string | undefined> {
  const payload = msg.template?.name
    ? {
        type: 'template',
        template: {
          name: msg.template.name,
          language: { code: msg.template.lang },
          components: [
            {
              type: 'body',
              parameters: msg.template.params.map((text) => ({ type: 'text', text: templateParam(text) })),
            },
          ],
        },
      }
    : // Free-form text only reaches people who messaged the shop in the last 24 hours.
      { type: 'text', text: { body: msg.body } };

  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: `91${msg.to}`, ...payload }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id;
}

async function sendSms(to: string, vars: string[]) {
  const recipient: Record<string, string> = { mobiles: `91${to}` };
  vars.forEach((v, i) => {
    recipient[`var${i + 1}`] = v;
  });
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: env.MSG91_AUTH_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: env.MSG91_STATUS_TEMPLATE_ID, short_url: '0', recipients: [recipient] }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
}

async function sendSmsOtp(to: string, code: string) {
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID ?? '');
  url.searchParams.set('mobile', `91${to}`);
  url.searchParams.set('otp', code);
  const res = await fetch(url, { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY ?? '' } });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
}

async function log(
  channel: Channel,
  msg: Pick<Message, 'to' | 'kind' | 'body' | 'relatedOrder'> & { params?: string[] },
  extra: { error?: unknown; providerMessageId?: string } = {},
) {
  await NotificationLogModel.create({
    channel,
    to: msg.to,
    template: msg.kind,
    body: msg.body,
    params: msg.params,
    status: extra.error ? 'failed' : 'sent',
    error: extra.error ? String((extra.error as Error).message ?? extra.error) : undefined,
    relatedOrder: msg.relatedOrder,
    providerMessageId: extra.providerMessageId,
  }).catch((err) => logger.error({ err }, 'Failed to log notification'));
}

const smsVars = (msg: Pick<Message, 'body'> & { params?: string[] }) =>
  msg.params?.length ? msg.params : [msg.body];

async function deliverSms(msg: Pick<Message, 'to' | 'kind' | 'body' | 'relatedOrder'> & { params?: string[] }) {
  try {
    await sendSms(msg.to, smsVars(msg));
    await log('sms', msg);
    return true;
  } catch (err) {
    logger.warn({ err, to: msg.to }, 'SMS send failed');
    await log('sms', msg, { error: err });
    return false;
  }
}

/** WhatsApp first; SMS when WhatsApp is not set up or the send fails; console in development. */
async function deliver(msg: Message) {
  const params = msg.template?.params;
  if (whatsappEnabled()) {
    try {
      const providerMessageId = await sendWhatsApp(msg);
      await log('whatsapp', { ...msg, params }, { providerMessageId });
      return;
    } catch (err) {
      logger.warn({ err, to: msg.to }, 'WhatsApp send failed');
      await log('whatsapp', { ...msg, params }, { error: err });
      if (smsEnabled()) await deliverSms({ ...msg, params });
      return;
    }
  }
  if (smsEnabled()) {
    await deliverSms({ ...msg, params });
    return;
  }
  logger.info({ to: msg.to, template: msg.kind }, `📨 ${msg.body}`);
  await log('console', { ...msg, params });
}

interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errors?: { code: number; title?: string; message?: string }[];
}

/**
 * Delivery receipts from the WhatsApp webhook. A message accepted by the API can still fail later
 * (number not on WhatsApp, template paused, …); those are re-sent once as SMS.
 */
export async function handleWhatsAppStatuses(statuses: WhatsAppStatus[]) {
  for (const s of statuses) {
    const entry = await NotificationLogModel.findOne({ providerMessageId: s.id, channel: 'whatsapp' });
    if (!entry) continue;
    if (s.status !== 'failed') {
      // Never downgrade (e.g. a late "delivered" after "read").
      const rank = { sent: 0, delivered: 1, read: 2, failed: 3 } as const;
      if (rank[s.status] > rank[entry.status as keyof typeof rank]) {
        entry.status = s.status;
        await entry.save();
      }
      continue;
    }
    entry.status = 'failed';
    entry.error = s.errors?.map((e) => `${e.code} ${e.title ?? e.message ?? ''}`.trim()).join('; ') || 'failed';
    const resend = smsEnabled() && !entry.fallbackSent;
    entry.fallbackSent = entry.fallbackSent || resend;
    await entry.save();
    if (resend) {
      await deliverSms({
        to: entry.to,
        kind: entry.template,
        body: entry.body ?? '',
        params: entry.params ?? undefined,
        relatedOrder: entry.relatedOrder ?? undefined,
      });
    }
  }
}

export const statusText = (status: string, lang: Lang) => STATUS_TEXT[status]?.[lang] ?? status;

export const notifications = {
  async sendOtp(phone: string, code: string) {
    if (env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID) {
      const entry = { to: phone, kind: 'otp', body: 'OTP sent' };
      try {
        await sendSmsOtp(phone, code);
        await log('sms', entry);
      } catch (err) {
        await log('sms', { ...entry, body: 'OTP send failed' }, { error: err });
        throw err;
      }
      return;
    }
    logger.info({ phone }, `🔐 OTP for ${phone}: ${code} (no SMS provider configured)`);
  },

  /** Notifies the customer about an order status change. Never throws. */
  async orderStatus(params: {
    phone?: string | null;
    lang?: Lang;
    orderNumber: string;
    status: string;
    orderId: Types.ObjectId;
    note?: string;
  }) {
    if (!params.phone) return;
    const lang = params.lang ?? 'en';
    const text = statusText(params.status, lang);
    const body =
      lang === 'hi'
        ? `Printing Galaxy: आपका ऑर्डर ${params.orderNumber} ${text}।${params.note ? ` ${params.note}` : ''}`
        : `Printing Galaxy: Your order ${params.orderNumber} ${text}.${params.note ? ` ${params.note}` : ''}`;
    await deliver({
      to: params.phone,
      kind: `order_${params.status}`,
      body,
      // Template body, e.g.: "Your order {{1}} {{2}}. {{3}}"
      template: {
        name: env.WHATSAPP_TEMPLATE_ORDER_STATUS,
        lang,
        params: [params.orderNumber, text, params.note ?? ''],
      },
      relatedOrder: params.orderId,
    }).catch((err) => logger.error({ err }, 'Order notification failed'));
  },

  async institutionReviewed(params: { phone: string; name: string; approved: boolean; reason?: string }) {
    const message = params.approved
      ? 'is approved. Institution pricing is now active on your account.'
      : `could not be approved.${params.reason ? ` Reason: ${params.reason}` : ''}`;
    await deliver({
      to: params.phone,
      kind: params.approved ? 'institution_approved' : 'institution_rejected',
      body: `Printing Galaxy: ${params.name} ${message}`,
      // Template body, e.g.: "Printing Galaxy: {{1}} {{2}}"
      template: { name: env.WHATSAPP_TEMPLATE_ACCOUNT_UPDATE, lang: 'en', params: [params.name, message] },
    }).catch((err) => logger.error({ err }, 'Institution notification failed'));
  },

  /** Internal alerts to the shop's own WhatsApp number (low stock, failed jobs). */
  async staffAlert(phone: string | undefined, kind: string, message: string) {
    const to = phone?.replace(/\D/g, '').slice(-10);
    if (!to || to.length !== 10) {
      logger.warn({ kind }, `⚠️ ${message} (no shop WhatsApp number in settings)`);
      return;
    }
    await deliver({
      to,
      kind,
      body: `Printing Galaxy alert: ${message}`,
      // Template body, e.g.: "Printing Galaxy alert: {{1}}"
      template: { name: env.WHATSAPP_TEMPLATE_STAFF_ALERT, lang: 'en', params: [message] },
    }).catch((err) => logger.error({ err }, 'Staff alert failed'));
  },
};
