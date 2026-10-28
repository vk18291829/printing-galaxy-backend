import { Router } from 'express';
import { z } from 'zod';
import { env, pushEnabled } from '@/config/env';
import { validate } from '@/middleware/validate';
import { permissionsFor } from '@/common/permissions';
import { UserModel } from '@/modules/users/user.model';
import { PushSubscriptionModel, StaffAlertModel } from './push.service';

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

/** /admin/alerts — the bell: recent alerts this staff member is allowed to act on, newest first. */
export const adminAlertsRouter = Router();

async function alertScope(userId: string) {
  const user = await UserModel.findById(userId).select('role staffRoles').lean();
  return { permission: { $in: user ? permissionsFor(user.role, user.staffRoles) : [] } };
}

adminAlertsRouter.get('/', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) }), async (req, res) => {
  const { limit } = res.locals.query as { limit: number };
  const me = req.auth!.id;
  const scope = await alertScope(me);
  const [items, unread] = await Promise.all([
    StaffAlertModel.find(scope).sort({ createdAt: -1 }).limit(limit).lean(),
    StaffAlertModel.countDocuments({ ...scope, readBy: { $ne: me } }),
  ]);
  res.json({
    unread,
    items: items.map(({ readBy, ...a }) => ({ ...a, read: readBy.some((id) => String(id) === me) })),
  });
});

/** Marks the given alerts (or all of them) as seen by this staff member. */
adminAlertsRouter.post('/read', validate({ body: z.object({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional() }) }), async (req, res) => {
  const me = req.auth!.id;
  const { ids } = req.body as { ids?: string[] };
  await StaffAlertModel.updateMany({ ...(await alertScope(me)), ...(ids && { _id: { $in: ids } }) }, { $addToSet: { readBy: me } });
  res.status(204).end();
});
