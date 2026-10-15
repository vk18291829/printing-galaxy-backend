import { Router } from 'express';
import mongoose from 'mongoose';
import { queueMode } from '@/jobs/queue';
import { adminRouter } from '@/modules/admin/admin.routes';
import { authRouter } from '@/modules/auth/auth.routes';
import { institutionRouter } from '@/modules/bulk/institution.routes';
import { catalogRouter } from '@/modules/catalog/catalog.routes';
import { deliveryRouter } from '@/modules/delivery/delivery.routes';
import { notificationsRouter } from '@/modules/notifications/notifications.routes';
import { ordersRouter } from '@/modules/orders/orders.routes';
import { paymentsRouter } from '@/modules/payments/payments.routes';
import { settingsRouter } from '@/modules/settings/settings.routes';
import { uploadsRouter } from '@/modules/uploads/uploads.routes';
import { accountRouter } from '@/modules/users/account.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'up' : 'down',
    queue: queueMode(),
    uptime: Math.round(process.uptime()),
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/', catalogRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/account', accountRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/institution', institutionRouter);
apiRouter.use('/delivery', deliveryRouter);
apiRouter.use('/admin', adminRouter);
