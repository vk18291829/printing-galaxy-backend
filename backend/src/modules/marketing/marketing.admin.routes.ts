import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { localized, localizedOptional, objectId } from '@/common/validation';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { BANNER_KINDS, BANNER_THEMES, BannerModel } from './banner.model';

export const adminMarketingRouter = Router();

const optionalDate = z
  .union([z.coerce.date(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v instanceof Date ? v : null));

const bannerInput = z
  .object({
    kind: z.enum(BANNER_KINDS),
    title: localized,
    subtitle: localizedOptional.default({}),
    ctaLabel: localizedOptional.default({}),
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !v || v.startsWith('/') || /^https?:\/\//.test(v), 'Use a site path like /products or a full https:// link')
      .default(''),
    imageUrl: z.string().trim().max(1000).default(''),
    theme: z.enum(BANNER_THEMES).default('blue'),
    badge: z.string().trim().max(24).default(''),
    couponCode: z.string().trim().toUpperCase().max(24).default(''),
    startsAt: optionalDate,
    endsAt: optionalDate,
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().default(0),
  })
  .refine((b) => !b.startsAt || !b.endsAt || b.startsAt <= b.endsAt, { message: 'End date is before start date', path: ['endsAt'] });

const idParams = z.object({ id: objectId });

adminMarketingRouter.get('/banners', async (_req, res) => {
  res.json(await BannerModel.find().sort({ kind: 1, sortOrder: 1, createdAt: -1 }).lean());
});

adminMarketingRouter.post('/banners', requireAdmin, validate({ body: bannerInput }), async (req, res) => {
  const banner = await BannerModel.create(req.body);
  audit(req, { action: 'banner.create', entity: 'Banner', entityId: banner._id, summary: banner.title.en });
  res.status(201).json(banner);
});

adminMarketingRouter.put('/banners/:id', requireAdmin, validate({ params: idParams, body: bannerInput }), async (req, res) => {
  const banner = await BannerModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!banner) throw ApiError.notFound('Banner');
  audit(req, { action: 'banner.update', entity: 'Banner', entityId: banner._id, summary: banner.title.en });
  res.json(banner);
});

adminMarketingRouter.patch(
  '/banners/:id/active',
  requireAdmin,
  validate({ params: idParams, body: z.object({ isActive: z.boolean() }) }),
  async (req, res) => {
    const banner = await BannerModel.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!banner) throw ApiError.notFound('Banner');
    res.json(banner);
  },
);

adminMarketingRouter.delete('/banners/:id', requireAdmin, validate({ params: idParams }), async (req, res) => {
  const banner = await BannerModel.findByIdAndDelete(req.params.id);
  if (!banner) throw ApiError.notFound('Banner');
  audit(req, { action: 'banner.delete', entity: 'Banner', entityId: banner._id, summary: banner.title.en });
  res.status(204).end();
});
