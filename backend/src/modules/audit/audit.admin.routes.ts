import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { objectId, paginate } from '@/common/validation';
import { validate } from '@/middleware/validate';
import { UserModel } from '@/modules/users/user.model';
import { AuditLogModel } from './audit.model';

export const adminAuditRouter = Router();

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  entity: z.string().trim().max(40).optional(),
  entityId: objectId.optional(),
  action: z.string().trim().max(60).optional(),
});

adminAuditRouter.get('/', validate({ query }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof query>;
  const filter: FilterQuery<unknown> = {};
  if (q.entity) filter.entity = q.entity;
  if (q.entityId) filter.entityId = q.entityId;
  if (q.action) filter.action = { $regex: `^${q.action.replace(/[^\w.]/g, '')}` };

  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  const actorIds = [...new Set(items.filter((i) => i.actor?.kind === 'user').map((i) => String(i.actor?.id)))];
  const actors = await UserModel.find({ _id: { $in: actorIds } }).select('name email role').lean();
  const actorMap = new Map(actors.map((a) => [String(a._id), a]));

  res.json({
    items: items.map((i) => ({ ...i, actorName: actorMap.get(String(i.actor?.id))?.name ?? i.actor?.kind })),
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
  });
});
