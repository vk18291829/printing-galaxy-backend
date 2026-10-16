import { Router } from 'express';
import { BANNER_KINDS, BannerModel, type BannerKind } from './banner.model';

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
