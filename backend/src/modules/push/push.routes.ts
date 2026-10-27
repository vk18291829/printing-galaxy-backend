import { Router } from 'express';
import { z } from 'zod';
import { env, pushEnabled } from '@/config/env';
import { validate } from '@/middleware/validate';
import { PushSubscriptionModel } from './push.service';

/** /admin/push — staff turn phone notifications on or off for this device. */
export const adminPushRouter = Router();

adminPushRouter.get('/key', (_req, res) => {
  res.json({ publicKey: pushEnabled() ? env.VAPID_PUBLIC_KEY : null });
});

const subscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

adminPushRouter.post('/subscribe', validate({ body: subscriptionInput }), async (req, res) => {
  const { endpoint, keys } = req.body as z.infer<typeof subscriptionInput>;
  await PushSubscriptionModel.updateOne(
    { endpoint },
    { $set: { user: req.auth!.id, keys, userAgent: req.headers['user-agent']?.slice(0, 300) } },
    { upsert: true },
  );
  res.status(204).end();
});

adminPushRouter.post('/unsubscribe', validate({ body: z.object({ endpoint: z.string().url().max(1000) }) }), async (req, res) => {
  await PushSubscriptionModel.deleteOne({ endpoint: req.body.endpoint, user: req.auth!.id });
  res.status(204).end();
});
