import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import type { AuthContext } from '@/common/types';
import { objectId, paginate, pagination } from '@/common/validation';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { resolvePricingContext } from '@/modules/institutions/institution.service';
import {
  assertInvoiceable,
  ensureInvoiceNumber,
  invoiceFileName,
  renderInvoicePdf,
} from '@/modules/invoices/invoice.service';
import { getSettings } from '@/modules/settings/settings.model';
import { OrderModel, type Order } from './order.model';
import { createOrderSchema, proofResponseSchema } from './order.schema';
import {
  attachFilesToOrder,
  buildItems,
  changeStatus,
  computeTotals,
  generateOrderNumber,
  notifyStatus,
  ORDER_POPULATE,
  resolveContact,
} from './order.service';

export const ordersRouter = Router();
ordersRouter.use(authenticate, requireKind('user', 'institution'));

function ownerFilter(auth: AuthContext): FilterQuery<Order> {
  return auth.kind === 'institution' ? { institution: auth.id } : { customer: auth.id };
}

const CUSTOMER_HIDDEN = '-internalNote -assignedTo -deliveryPerson';

ordersRouter.post('/', validate({ body: createOrderSchema }), async (req, res) => {
  const auth = req.auth!;
  const input = req.body as z.infer<typeof createOrderSchema>;
  const settings = await getSettings();

  if (input.fulfilment.method === 'delivery' && !settings.delivery.enabled) {
    throw ApiError.badRequest('Home delivery is not available right now');
  }
  if (input.paymentMethod === 'online' && !settings.payments.onlineEnabled) {
    throw ApiError.badRequest('Online payment is not available right now');
  }
  if (input.paymentMethod === 'counter' && !settings.payments.counterEnabled) {
    throw ApiError.badRequest('Pay at counter is not available right now');
  }

  const ctx = await resolvePricingContext(auth);
  const items = await buildItems(input.items, ctx, auth);
  const needsQuote = items.some((i) => i.workflow === 'quote');
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, input.fulfilment.method);
  const who = await resolveContact(auth, input.contactName);
  const status = needsQuote ? 'quote_pending' : 'received';

  const order = await OrderModel.create({
    orderNumber: generateOrderNumber(),
    audience: ctx.audience,
    ...who,
    source: 'online',
    items,
    status,
    statusHistory: [{ status, by: auth.id, byKind: auth.kind, at: new Date() }],
    fulfilment: input.fulfilment,
    totals,
    payment: { method: input.paymentMethod, status: 'pending', amountPaid: 0 },
    customerNote: input.customerNote,
  });
  await attachFilesToOrder(order);
  await notifyStatus(order);

  res.status(201).json(order.toJSON());
});

ordersRouter.get('/', validate({ query: pagination }), async (req, res) => {
  const { page, limit } = res.locals.query as z.infer<typeof pagination>;
  const filter = ownerFilter(req.auth!);
  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .select(`${CUSTOMER_HIDDEN} -statusHistory`)
      .sort({ createdAt: -1 })
      .skip(paginate(page, limit).skip)
      .limit(limit)
      .lean(),
    OrderModel.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

ordersRouter.get('/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!) })
    .select(CUSTOMER_HIDDEN)
    .populate(ORDER_POPULATE)
    .lean();
  if (!order) throw ApiError.notFound('Order');
  res.json(order);
});

ordersRouter.get('/:id/invoice', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!) });
  if (!order) throw ApiError.notFound('Order');
  assertInvoiceable(order);
  await ensureInvoiceNumber(order);
  const pdf = await renderInvoicePdf(order);
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `inline; filename="${invoiceFileName(order)}"`)
    .send(Buffer.from(pdf));
});

ordersRouter.post(
  '/:id/cancel',
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ reason: z.string().trim().max(300).optional() }),
  }),
  async (req, res) => {
    const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!) });
    if (!order) throw ApiError.notFound('Order');
    if (!['quote_pending', 'received'].includes(order.status) || order.payment.amountPaid > 0) {
      throw ApiError.conflict('This order can no longer be cancelled online. Please call the shop.');
    }
    order.cancelReason = req.body.reason;
    await changeStatus(req, order, 'cancelled', { note: req.body.reason });
    res.json(order.toJSON());
  },
);

ordersRouter.post(
  '/:id/items/:itemId/proof',
  validate({
    params: z.object({ id: objectId, itemId: objectId }),
    body: proofResponseSchema,
  }),
  async (req, res) => {
    const { decision, comment } = req.body as z.infer<typeof proofResponseSchema>;
    const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!) });
    if (!order) throw ApiError.notFound('Order');
    const item = order.items.id(req.params.itemId as string);
    const proof = item?.proofs.at(-1);
    if (!item || !proof || proof.status !== 'pending') {
      throw ApiError.conflict('There is no proof waiting for your approval');
    }

    proof.status = decision;
    proof.customerComment = comment;
    proof.respondedAt = new Date();

    if (decision === 'changes_requested') {
      await changeStatus(req, order, 'received', {
        note: `Changes requested${comment ? `: ${comment}` : ''}`,
        notify: false,
      });
    } else {
      const waiting = order.items.some((i) => i.proofs.at(-1)?.status === 'pending');
      if (waiting) await order.save();
      else await changeStatus(req, order, 'approved');
    }
    res.json(order.toJSON());
  },
);
