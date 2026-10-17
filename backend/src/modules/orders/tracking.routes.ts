import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { indianPhone } from '@/common/validation';
import { authLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import { checkOtp, issueOtp } from '@/modules/auth/auth.service';
import { OrderModel } from './order.model';

/**
 * Order tracking without an account: order number + the phone on the order, confirmed by a
 * one-time code. Returns progress only (no files, addresses or notes from staff).
 */
export const trackingRouter = Router();
trackingRouter.use(authLimiter);

const lookup = z.object({
  orderNumber: z.string().trim().toUpperCase().regex(/^PG\d{6}-[A-Z0-9]{4}$/, 'Enter the order number, e.g. PG261017-AB12'),
  phone: indianPhone,
});

trackingRouter.post('/request', validate({ body: lookup }), async (req, res) => {
  const { orderNumber, phone } = req.body as z.infer<typeof lookup>;
  const exists = await OrderModel.exists({ orderNumber, 'contact.phone': phone });
  // Same answer either way, so order numbers cannot be probed.
  const result = exists ? await issueOtp(phone, 'track') : {};
  res.json({ sent: true, ...('devCode' in result ? { devCode: result.devCode } : {}) });
});

trackingRouter.post(
  '/verify',
  validate({ body: lookup.extend({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }) }),
  async (req, res) => {
    const { orderNumber, phone, code } = req.body as z.infer<typeof lookup> & { code: string };
    const order = await OrderModel.findOne({ orderNumber, 'contact.phone': phone })
      .select('orderNumber status statusHistory fulfilment.method totals.total payment.status payment.method items.productName items.quantity items.units items.unit createdAt')
      .lean();
    if (!order) throw ApiError.badRequest('Incorrect code');
    await checkOtp(phone, code, 'track');
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
