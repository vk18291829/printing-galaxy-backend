import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, indianPhone, objectId, paginate } from '@/common/validation';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { passwordSchema } from '@/modules/auth/auth.schema';
import { hashPassword } from '@/modules/auth/auth.service';
import { SessionModel } from '@/modules/auth/session.model';
import { OrderModel } from '@/modules/orders/order.model';
import { UserModel, type User } from './user.model';

export const adminUsersRouter = Router();

// ── Customers ───────────────────────────────────────────────────────────────

const customerQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

adminUsersRouter.get('/customers', validate({ query: customerQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof customerQuery>;
  const filter: FilterQuery<User> = { role: 'customer' };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  const { skip, limit } = paginate(q.page, q.limit);
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  const stats = await OrderModel.aggregate<{ _id: unknown; orders: number; spent: number }>([
    { $match: { customer: { $in: users.map((u) => u._id) }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$customer', orders: { $sum: 1 }, spent: { $sum: '$totals.total' } } },
  ]);
  const statMap = new Map(stats.map((s) => [String(s._id), s]));
  res.json({
    items: users.map((u) => ({
      ...u,
      orders: statMap.get(String(u._id))?.orders ?? 0,
      spent: statMap.get(String(u._id))?.spent ?? 0,
    })),
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
  });
});

adminUsersRouter.patch(
  '/customers/:id/active',
  requireAdmin,
  validate({ params: z.object({ id: objectId }), body: z.object({ isActive: z.boolean() }) }),
  async (req, res) => {
    const user = await UserModel.findOneAndUpdate(
      { _id: req.params.id, role: 'customer' },
      { $set: { isActive: req.body.isActive } },
      { new: true },
    );
    if (!user) throw ApiError.notFound('Customer');
    if (!user.isActive) await SessionModel.deleteMany({ subject: user._id });
    audit(req, { action: 'customer.active', entity: 'User', entityId: user._id, changes: req.body });
    res.json(user);
  },
);

// ── Staff ───────────────────────────────────────────────────────────────────

adminUsersRouter.get('/staff', async (_req, res) => {
  res.json(await UserModel.find({ role: { $in: ['staff', 'admin', 'delivery'] } }).sort({ createdAt: 1 }).lean());
});

const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: indianPhone.optional(),
  role: z.enum(['staff', 'admin', 'delivery']),
  password: passwordSchema,
});

adminUsersRouter.post('/staff', requireAdmin, validate({ body: staffCreateSchema }), async (req, res) => {
  const { password, ...rest } = req.body as z.infer<typeof staffCreateSchema>;
  const user = await UserModel.create({ ...rest, passwordHash: await hashPassword(password) });
  audit(req, { action: 'staff.create', entity: 'User', entityId: user._id, summary: `${user.name} (${user.role})` });
  res.status(201).json(user);
});

const staffUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['staff', 'admin', 'delivery']).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

adminUsersRouter.patch(
  '/staff/:id',
  requireAdmin,
  validate({ params: z.object({ id: objectId }), body: staffUpdateSchema }),
  async (req, res) => {
    const { password, ...rest } = req.body as z.infer<typeof staffUpdateSchema>;
    if (req.params.id === req.auth!.id && (rest.isActive === false || (rest.role && rest.role !== 'admin'))) {
      throw ApiError.badRequest('You cannot disable or demote your own account');
    }
    const update: Record<string, unknown> = { ...rest };
    if (password) update.passwordHash = await hashPassword(password);
    const user = await UserModel.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ['staff', 'admin', 'delivery'] } },
      { $set: update },
      { new: true },
    );
    if (!user) throw ApiError.notFound('Staff member');
    if (rest.isActive === false || password) await SessionModel.deleteMany({ subject: user._id });
    audit(req, {
      action: 'staff.update',
      entity: 'User',
      entityId: user._id,
      summary: user.name,
      changes: { ...rest, password: password ? 'changed' : undefined },
    });
    res.json(user);
  },
);
