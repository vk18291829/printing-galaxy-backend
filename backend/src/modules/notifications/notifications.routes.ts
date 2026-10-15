import crypto from 'node:crypto';
import { Router } from 'express';
import { ApiError } from '@/common/errors';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { handleWhatsAppStatuses } from './notification.service';

export const notificationsRouter = Router();

/** Meta calls this once with the verify token when the webhook URL is saved in the dashboard. */
notificationsRouter.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    return;
  }
  throw ApiError.forbidden();
});

interface WebhookBody {
  entry?: { changes?: { value?: { statuses?: Parameters<typeof handleWhatsAppStatuses>[0] } }[] }[];
}

/** Delivery receipts. Signed with the app secret (X-Hub-Signature-256: sha256=<hex>). */
notificationsRouter.post('/whatsapp/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!env.WHATSAPP_APP_SECRET || typeof signature !== 'string' || !req.rawBody) {
    throw ApiError.badRequest('Invalid webhook');
  }
  const expected = `sha256=${crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw ApiError.badRequest('Invalid signature');

  const statuses = ((req.body ?? {}) as WebhookBody).entry
    ?.flatMap((e) => e.changes ?? [])
    .flatMap((c) => c.value?.statuses ?? []);
  if (statuses?.length) {
    await handleWhatsAppStatuses(statuses).catch((err) => logger.error({ err }, 'WhatsApp webhook failed'));
  }
  // Always 200 so Meta does not retry and disable the webhook.
  res.json({ ok: true });
});
