import { Router } from 'express';
import { env, razorpayEnabled } from '@/config/env';
import { getSettings } from './settings.model';

export const settingsRouter = Router();

settingsRouter.get('/public', async (_req, res) => {
  const s = await getSettings();
  res.json({
    shop: s.shop,
    /** How customers sign in and get order updates. */
    messaging: env.MESSAGING_CHANNEL,
    tax: { enabled: s.tax.enabled, rate: s.tax.rate, pricesIncludeTax: s.tax.pricesIncludeTax },
    delivery: s.delivery,
    payments: {
      onlineEnabled: s.payments.onlineEnabled && razorpayEnabled(),
      counterEnabled: s.payments.counterEnabled,
      onlineTimeoutMinutes: s.payments.onlineTimeoutMinutes,
    },
  });
});
