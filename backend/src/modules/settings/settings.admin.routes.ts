import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { getSettings } from './settings.model';

export const adminSettingsRouter = Router();

/** A full https:// profile link, or empty to hide that icon. */
const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Paste the full link, starting with https://')
  .default('');

const settingsSchema = z.object({
  shop: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(20),
    whatsapp: z.string().trim().max(20),
    email: z.string().trim().max(120),
    address: z.string().trim().max(300),
    state: z.string().trim().max(60).default(''),
    mapUrl: z.string().trim().max(500),
    hours: z.string().trim().max(120),
    gstin: z.string().trim().toUpperCase().max(15),
    legalName: z.string().trim().max(150).default(''),
    grievanceName: z.string().trim().max(100).default(''),
    grievanceEmail: z.string().trim().max(120).default(''),
    grievancePhone: z.string().trim().max(20).default(''),
  }),
  social: z
    .object({
      instagram: socialUrl,
      facebook: socialUrl,
      youtube: socialUrl,
      x: socialUrl,
      linkedin: socialUrl,
    })
    .default({ instagram: '', facebook: '', youtube: '', x: '', linkedin: '' }),
  tax: z.object({
    enabled: z.boolean(),
    rate: z.coerce.number().min(0).max(28),
    pricesIncludeTax: z.boolean(),
    sacCode: z.string().trim().max(10).default('9989'),
  }),
  delivery: z.object({
    enabled: z.boolean(),
    fee: z.coerce.number().min(0),
    freeAbove: z.coerce.number().min(0),
  }),
  payments: z.object({
    onlineEnabled: z.boolean(),
    counterEnabled: z.boolean(),
    onlineTimeoutMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    quotePaymentDays: z.coerce.number().int().min(1).max(30).optional(),
  }),
  sensitiveRetentionDays: z.coerce.number().int().min(1).max(365),
});

adminSettingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

adminSettingsRouter.put('/', requireAdmin, validate({ body: settingsSchema }), async (req, res) => {
  const settings = await getSettings();
  const before = settings.toObject();
  settings.set(req.body);
  await settings.save();
  audit(req, {
    action: 'settings.update',
    entity: 'Settings',
    entityId: settings._id,
    changes: { before: { tax: before.tax, delivery: before.delivery }, after: req.body },
  });
  res.json(settings);
});
