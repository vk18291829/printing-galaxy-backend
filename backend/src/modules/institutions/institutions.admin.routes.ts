import { Router } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, objectId, paginate } from '@/common/validation';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { notifications } from '@/modules/notifications/notification.service';
import { OrderModel } from '@/modules/orders/order.model';
import { INSTITUTION_STATUSES, InstitutionModel, type Institution } from './institution.model';

export const adminInstitutionsRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INSTITUTION_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

adminInstitutionsRouter.get('/', validate({ query: listQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof listQuery>;
  const filter: FilterQuery<Institution> = {};
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { 'address.city': rx }];
  }
  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total, counts] = await Promise.all([
    InstitutionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    InstitutionModel.countDocuments(filter),
    InstitutionModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    items,
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    statusCounts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  });
});

adminInstitutionsRouter.get('/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const institution = await InstitutionModel.findById(req.params.id).lean();
  if (!institution) throw ApiError.notFound('Institution');
  const [stats] = await OrderModel.aggregate<{ orders: number; revenue: number }>([
    { $match: { institution: new Types.ObjectId(req.params.id as string), status: { $ne: 'cancelled' } } },
    { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$totals.total' } } },
  ]);
  const recentOrders = await OrderModel.find({ institution: institution._id })
    .select('orderNumber status totals payment createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.json({ ...institution, stats: stats ?? { orders: 0, revenue: 0 }, recentOrders });
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended', 'pending']),
  reason: z.string().trim().max(500).optional(),
  extraDiscountPercent: z.coerce.number().min(0).max(50).optional(),
});

adminInstitutionsRouter.patch(
  '/:id/status',
  requireAdmin,
  validate({ params: z.object({ id: objectId }), body: reviewSchema }),
  async (req, res) => {
    const { status, reason, extraDiscountPercent } = req.body as z.infer<typeof reviewSchema>;
    if ((status === 'rejected' || status === 'suspended') && !reason) {
      throw ApiError.badRequest('Please give a reason');
    }
    const institution = await InstitutionModel.findById(req.params.id);
    if (!institution) throw ApiError.notFound('Institution');
    const previous = institution.status;

    institution.status = status;
    institution.statusReason = reason;
    institution.reviewedBy = new Types.ObjectId(req.auth!.id);
    institution.reviewedAt = new Date();
    if (extraDiscountPercent !== undefined) institution.extraDiscountPercent = extraDiscountPercent;
    await institution.save();

    audit(req, {
      action: 'institution.status',
      entity: 'Institution',
      entityId: institution._id,
      summary: `${institution.name}: ${previous} → ${status}`,
      changes: { reason, extraDiscountPercent },
    });
    if (previous !== status && (status === 'approved' || status === 'rejected')) {
      void notifications.institutionReviewed({
        phone: institution.phone,
        name: institution.name,
        approved: status === 'approved',
        reason,
      });
    }
    res.json(institution);
  },
);
