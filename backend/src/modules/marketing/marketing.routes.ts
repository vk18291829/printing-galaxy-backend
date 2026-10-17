import { Router } from 'express';
import { z } from 'zod';
import { objectId } from '@/common/validation';
import { authLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import { BANNER_KINDS, BannerModel, type BannerKind } from './banner.model';
import { unsubscribe } from './promo.service';

export const marketingRouter = Router();

/** Live banners grouped by placement; scheduled ones only between their start and end dates. */
marketingRouter.get('/banners', async (_req, res) => {
  const now = new Date();
  const banners = await BannerModel.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  const grouped = Object.fromEntries(BANNER_KINDS.map((k) => [k, [] as typeof banners])) as Record<BannerKind, typeof banners>;
  for (const b of banners) grouped[b.kind].push(b);
  res.set('Cache-Control', 'public, max-age=60');
  res.json(grouped);
});

/** The "Stop offer emails" link: signed per customer, so it works without signing in. */
marketingRouter.post(
  '/unsubscribe',
  authLimiter,
  validate({ body: z.object({ u: objectId, t: z.string().trim().min(10).max(64) }) }),
  async (req, res) => {
    const { u, t } = req.body as { u: string; t: string };
    await unsubscribe(u, t);
    res.json({ ok: true });
  },
);
