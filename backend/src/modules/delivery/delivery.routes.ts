import { Router, type Request } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { idempotencyHeader } from '@/common/idempotency';
import { objectId } from '@/common/validation';
import { authenticate, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { completeHandover, failDelivery } from '@/modules/orders/handover.service';
import { OrderModel, type Order } from '@/modules/orders/order.model';
import { changeStatus } from '@/modules/orders/order.service';

/** Phone-first view for riders: only their assigned deliveries, start and finish them. */
export const deliveryRouter = Router();
deliveryRouter.use(authenticate, requireRole('delivery', 'staff', 'admin'));

const ACTIVE = ['approved', 'printing', 'ready', 'out_for_delivery'];
const FIELDS = 'orderNumber status audience contact fulfilment totals payment items.productName items.quantity items.units items.unit customerNote deliveryPerson deliveryAttempts handover.wrongAttempts createdAt updatedAt statusHistory';

/** Riders see their own; staff and admins see every delivery order (to cover for a rider). */
function scope(req: Request): FilterQuery<Order> {
  const base: FilterQuery<Order> = { 'fulfilment.method': 'delivery' };
  return req.auth!.role === 'delivery' ? { ...base, deliveryPerson: req.auth!.id } : { ...base, deliveryPerson: { $ne: null } };
}

async function loadAssigned(req: Request) {
  const order = await OrderModel.findOne({ _id: req.params.id, ...scope(req) });
  if (!order) throw ApiError.notFound('Delivery');
  return order;
}

deliveryRouter.get('/', async (req, res) => {
  const startOfDay = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00+05:30`);
  const [active, doneToday] = await Promise.all([
    OrderModel.find({ ...scope(req), status: { $in: ACTIVE } })
      .select(FIELDS)
      .populate('deliveryPerson', 'name')
      .sort({ status: -1, createdAt: 1 })
      .lean(),
    OrderModel.find({ ...scope(req), status: 'delivered', completedAt: { $gte: startOfDay } })
      .select(FIELDS)
      .populate('deliveryPerson', 'name')
      .sort({ completedAt: -1 })
      .lean(),
  ]);
  // Ready / on the way first, then anything still in production.
  const rank: Record<string, number> = { out_for_delivery: 0, ready: 1, printing: 2, approved: 3 };
  active.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  res.json({ active, doneToday });
});

const idParams = z.object({ id: objectId });

deliveryRouter.post('/:id/start', validate({ params: idParams }), async (req, res) => {
  const order = await loadAssigned(req);
  if (order.status === 'out_for_delivery') {
    res.json(order.toJSON());
    return;
  }
  if (order.status !== 'ready') throw ApiError.conflict('This order is not packed and ready yet');
  await changeStatus(req, order, 'out_for_delivery');
  res.json(order.toJSON());
});

deliveryRouter.post(
  '/:id/delivered',
  validate({
    params: idParams,
    body: z.object({
      code: z.string().trim().optional(),
      overrideReason: z.string().trim().max(300).optional(),
      cashCollected: z.coerce.number().min(0).default(0),
      provider: z.enum(['cash', 'upi_counter']).default('cash'),
      note: z.string().trim().max(300).optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as { code?: string; overrideReason?: string; cashCollected: number; provider: 'cash' | 'upi_counter'; note?: string };
    const order = await completeHandover(req, req.params.id as string, 'delivered', {
      code: body.code,
      overrideReason: body.overrideReason,
      collected: body.cashCollected,
      provider: body.provider,
      note: body.note,
      idempotencyKey: idempotencyHeader(req),
    }, scope(req));
    res.json(order?.toJSON());
  },
);

/** Nobody home, wrong address…: the order goes back to "ready" and the customer is told. */
deliveryRouter.post(
  '/:id/failed',
  validate({ params: idParams, body: z.object({ note: z.string().trim().min(2).max(300) }) }),
  async (req, res) => {
    const order = await loadAssigned(req);
    await failDelivery(req, order, req.body.note);
    res.json(order.toJSON());
  },
);
