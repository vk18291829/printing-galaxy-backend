import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { indianPhone } from '@/common/validation';
import { emailChannel } from '@/config/env';
import { authLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import { checkOtp, issueOtp } from '@/modules/auth/auth.service';
import { OrderModel } from './order.model';

/**
 * Order tracking without an account: order number + the email (or phone, on the SMS channel) on
 * the order, confirmed by a one-time code. Returns progress only (no files, addresses or notes from staff).
 */
export const trackingRouter = Router();
trackingRouter.use(authLimiter);

const lookup = z.object({
  orderNumber: z.string().trim().toUpperCase().regex(/^PG\d{6}-[A-Z0-9]{4}$/, 'Enter the order number, e.g. PG261017-AB12'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  phone: indianPhone.optional(),
});

/** The contact detail codes go to on this server's channel, and the order filter for it. */
function target(input: { email?: string; phone?: string }) {
  if (emailChannel()) {
    if (!input.email) throw ApiError.badRequest('Enter the email address used for the order');
    return { to: input.email, filter: { 'contact.email': input.email } };
  }
  if (!input.phone) throw ApiError.badRequest('Enter the mobile number used for the order');
  return { to: input.phone, filter: { 'contact.phone': input.phone } };
}

trackingRouter.post('/request', validate({ body: lookup }), async (req, res) => {
  const { orderNumber, ...contact } = req.body as z.infer<typeof lookup>;
  const { to, filter } = target(contact);
  const exists = await OrderModel.exists({ orderNumber, ...filter });
  // Same answer either way, so order numbers cannot be probed.
  const result = exists ? await issueOtp(to, 'track') : {};
  res.json({ sent: true, ...('devCode' in result ? { devCode: result.devCode } : {}) });
});

trackingRouter.post(
  '/verify',
  validate({ body: lookup.extend({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }) }),
  async (req, res) => {
    const { orderNumber, code, ...contact } = req.body as z.infer<typeof lookup> & { code: string };
    const { to, filter } = target(contact);
    const order = await OrderModel.findOne({ orderNumber, ...filter })
      .select('orderNumber status statusHistory fulfilment.method totals.total payment.status payment.method items.productName items.quantity items.units items.unit createdAt')
      .lean();
    if (!order) throw ApiError.badRequest('Incorrect code');
    await checkOtp(to, code, 'track');
    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      fulfilment: order.fulfilment?.method,
      total: order.totals.total,
      payment: order.payment,
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, units: i.units, unit: i.unit })),
      history: order.statusHistory.map((h) => ({ status: h.status, at: h.at })),
      createdAt: order.createdAt,
    });
  },
);
