import { Router, type Request } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId } from '@/common/validation';
import { authenticate, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { OrderModel, type Order } from '@/modules/orders/order.model';
import { changeStatus, syncPaymentStatus } from '@/modules/orders/order.service';
import { PaymentModel } from '@/modules/payments/payment.model';
import { round2 } from '@/modules/pricing/pricing.service';

/** Phone-first view for riders: only their assigned deliveries, start and finish them. */
export const deliveryRouter = Router();
deliveryRouter.use(authenticate, requireRole('delivery', 'staff', 'admin'));

const ACTIVE = ['approved', 'printing', 'ready', 'out_for_delivery'];
const FIELDS = 'orderNumber status contact fulfilment totals payment items.productName items.quantity items.units items.unit customerNote deliveryPerson createdAt updatedAt statusHistory';

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
  if (order.status !== 'ready') throw ApiError.conflict('This order is not packed and ready yet');
  await changeStatus(req, order, 'out_for_delivery');
  res.json(order.toJSON());
});

deliveryRouter.post(
  '/:id/delivered',
  validate({
    params: idParams,
    body: z.object({
      cashCollected: z.coerce.number().min(0).default(0),
      provider: z.enum(['cash', 'upi_counter']).default('cash'),
      note: z.string().trim().max(300).optional(),
    }),
  }),
  async (req, res) => {
    const order = await loadAssigned(req);
    if (order.status !== 'out_for_delivery') throw ApiError.conflict('Start the delivery first');
    const { cashCollected, provider, note } = req.body as { cashCollected: number; provider: 'cash' | 'upi_counter'; note?: string };

    if (cashCollected > 0) {
      const due = round2(order.totals.total - (order.payment.amountPaid ?? 0));
      if (cashCollected > due + 0.009) throw ApiError.badRequest(`Only ₹${due} is due on this order`);
      await PaymentModel.create({
        order: order._id,
        provider,
        amount: cashCollected,
        status: 'captured',
        recordedBy: req.auth!.id,
        note: 'Collected on delivery',
      });
      order.payment.amountPaid = round2((order.payment.amountPaid ?? 0) + cashCollected);
      syncPaymentStatus(order);
      audit(req, {
        action: 'payment.recorded',
        entity: 'Order',
        entityId: order._id,
        summary: `${order.orderNumber}: ₹${cashCollected} collected on delivery`,
      });
    }
    await changeStatus(req, order, 'delivered', { note });
    res.json(order.toJSON());
  },
);

/** Nobody home, wrong address…: the order goes back to "ready" with the reason, no customer message. */
deliveryRouter.post(
  '/:id/failed',
  validate({ params: idParams, body: z.object({ note: z.string().trim().min(2).max(300) }) }),
  async (req, res) => {
    const order = await loadAssigned(req);
    if (order.status !== 'out_for_delivery') throw ApiError.conflict('This delivery is not on the way');
    await changeStatus(req, order, 'ready', { note: `Delivery attempt failed: ${req.body.note}`, notify: false });
    res.json(order.toJSON());
  },
);
