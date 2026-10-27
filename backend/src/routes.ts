import { Router } from 'express';
import mongoose from 'mongoose';
import { queueMode } from '@/jobs/queue';
import { adminRouter } from '@/modules/admin/admin.routes';
import { authRouter } from '@/modules/auth/auth.routes';
import { institutionRouter } from '@/modules/bulk/institution.routes';
import { institutionRosterRouter, publicRosterLinkRouter } from '@/modules/roster/roster.routes';
import { marketingRouter } from '@/modules/marketing/marketing.routes';
import { catalogRouter } from '@/modules/catalog/catalog.routes';
import { deliveryRouter } from '@/modules/delivery/delivery.routes';
import { ordersRouter } from '@/modules/orders/orders.routes';
import { trackingRouter } from '@/modules/orders/tracking.routes';
import { paymentsRouter } from '@/modules/payments/payments.routes';
import { reviewsRouter } from '@/modules/reviews/reviews.routes';
import { settingsRouter } from '@/modules/settings/settings.routes';
import { uploadsRouter } from '@/modules/uploads/uploads.routes';
import { accountRouter } from '@/modules/users/account.routes';
import { updatesRouter } from '@/modules/users/updates.routes';

export const apiRouter = Router();

// 503 when the database is unreachable, so load balancers and uptime monitors notice.
apiRouter.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    queue: queueMode(),
    uptime: Math.round(process.uptime()),
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/', catalogRouter);
apiRouter.use('/', reviewsRouter);
apiRouter.use('/marketing', marketingRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/account/updates', updatesRouter);
apiRouter.use('/account', accountRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/track', trackingRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/institution/roster', institutionRosterRouter);
apiRouter.use('/roster-links', publicRosterLinkRouter);
apiRouter.use('/institution', institutionRouter);
apiRouter.use('/delivery', deliveryRouter);
apiRouter.use('/admin', adminRouter);
