import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { objectId, paginate } from '@/common/validation';
import { readinessReport } from '@/config/readiness';
import { queueMode } from '@/jobs/queue';
import { validate } from '@/middleware/validate';
import { NotificationLogModel } from '@/modules/notifications/notification.model';
import { retryNotification } from '@/modules/notifications/notification.service';
import { OrderModel } from '@/modules/orders/order.model';
import { PaymentModel } from '@/modules/payments/payment.model';
import { WebhookEventModel } from '@/modules/payments/webhook-event.model';

/** System activity: health, failed messages (with retry), webhooks and money movements. */
export const adminSystemRouter = Router();

const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminSystemRouter.get('/overview', async (_req, res) => {
  const day = new Date(Date.now() - 86_400_000);
  const [failedMessages, failedWebhooks, awaitingPayment, pendingRefunds, staleWindows] = await Promise.all([
    NotificationLogModel.countDocuments({ status: 'failed', createdAt: { $gte: day } }),
    WebhookEventModel.countDocuments({ status: 'failed', createdAt: { $gte: day } }),
    OrderModel.countDocuments({ status: 'awaiting_payment' }),
    PaymentModel.countDocuments({ kind: 'refund', status: 'refund_pending' }),
    PaymentModel.countDocuments({ provider: 'razorpay', kind: 'payment', status: 'created', createdAt: { $lte: new Date(Date.now() - 15 * 60_000), $gte: new Date(Date.now() - 3 * 86_400_000) } }),
  ]);
  const report = readinessReport();
  res.json({
    health: {
      db: mongoose.connection.readyState === 1 ? 'up' : 'down',
      queue: queueMode(),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      environment: process.env.NODE_ENV ?? 'development',
      memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
    },
    counts: { failedMessages, failedWebhooks, awaitingPayment, pendingRefunds, staleWindows },
    readiness: report,
  });
});

adminSystemRouter.get(
  '/notifications',
  validate({ query: page.extend({ status: z.enum(['sent', 'delivered', 'read', 'failed']).optional() }) }),
  async (_req, res) => {
    const q = res.locals.query as z.infer<typeof page> & { status?: string };
    const filter = q.status ? { status: q.status } : {};
    const { skip, limit } = paginate(q.page, q.limit);
    const [items, total] = await Promise.all([
      NotificationLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('relatedOrder', 'orderNumber').lean(),
      NotificationLogModel.countDocuments(filter),
    ]);
    // Login codes are never shown, even though only "OTP sent" is stored.
    res.json({ items: items.map((i) => ({ ...i, body: i.template === 'otp' ? 'Login code' : i.body })), total, page: q.page, pages: Math.ceil(total / limit) });
  },
);

adminSystemRouter.post('/notifications/:id/retry', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  res.json(await retryNotification(req.params.id as string));
});

adminSystemRouter.get('/webhooks', validate({ query: page }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof page>;
  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total] = await Promise.all([
    WebhookEventModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('relatedOrder', 'orderNumber').lean(),
    WebhookEventModel.countDocuments(),
  ]);
  res.json({ items, total, page: q.page, pages: Math.ceil(total / limit) });
});

adminSystemRouter.get(
  '/payments',
  validate({ query: page.extend({ kind: z.enum(['payment', 'refund']).optional() }) }),
  async (_req, res) => {
    const q = res.locals.query as z.infer<typeof page> & { kind?: string };
    const filter = q.kind ? { kind: q.kind } : {};
    const { skip, limit } = paginate(q.page, q.limit);
    const [items, total] = await Promise.all([
      PaymentModel.find(filter).select('-raw').sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('order', 'orderNumber').populate('recordedBy', 'name').lean(),
      PaymentModel.countDocuments(filter),
    ]);
    res.json({ items, total, page: q.page, pages: Math.ceil(total / limit) });
  },
);
