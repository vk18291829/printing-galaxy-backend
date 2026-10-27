import { Router } from 'express';
import { authenticate, requireAdmin, requirePermission, requireStaff } from '@/middleware/auth';
import { adminAuditRouter } from '@/modules/audit/audit.admin.routes';
import { adminBulkRouter } from '@/modules/bulk/bulk.admin.routes';
import { adminCatalogRouter } from '@/modules/catalog/catalog.admin.routes';
import { adminInstitutionsRouter } from '@/modules/institutions/institutions.admin.routes';
import { adminRosterRouter } from '@/modules/roster/roster.routes';
import { adminInventoryRouter } from '@/modules/inventory/inventory.admin.routes';
import { adminMarketingRouter } from '@/modules/marketing/marketing.admin.routes';
import { adminPromoRouter } from '@/modules/marketing/promo.admin.routes';
import { adminOrdersRouter } from '@/modules/orders/orders.admin.routes';
import { adminPushRouter } from '@/modules/push/push.routes';
import { adminReportsRouter } from '@/modules/reports/reports.admin.routes';
import { adminReviewsRouter } from '@/modules/reviews/reviews.admin.routes';
import { adminSettingsRouter } from '@/modules/settings/settings.admin.routes';
import { adminSystemRouter } from '@/modules/system/system.admin.routes';
import { adminUsersRouter } from '@/modules/users/users.admin.routes';
import { dashboardRouter } from './dashboard.routes';

export const adminRouter = Router();

// Every admin route needs a staff or admin session; individual routes add requireAdmin.
// Delivery riders use /delivery instead.
adminRouter.use(authenticate, requireStaff);

adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/push', adminPushRouter);
adminRouter.use('/orders', requirePermission('orders'), adminOrdersRouter);
adminRouter.use('/catalog', adminCatalogRouter);
adminRouter.use('/institutions/:institutionId/roster', requirePermission('institutions'), adminRosterRouter);
adminRouter.use('/institutions', adminInstitutionsRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/settings', adminSettingsRouter);
adminRouter.use('/inventory', adminInventoryRouter);
adminRouter.use('/bulk-jobs', adminBulkRouter);
adminRouter.use('/reviews', adminReviewsRouter);
adminRouter.use('/marketing/promotions', requirePermission('marketing'), adminPromoRouter);
adminRouter.use('/marketing', adminMarketingRouter);
adminRouter.use('/reports', requirePermission('reports'), adminReportsRouter);
adminRouter.use('/audit', requireAdmin, adminAuditRouter);
adminRouter.use('/system', requireAdmin, adminSystemRouter);
