import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { idempotencyHeader } from '@/common/idempotency';
import type { AuthContext } from '@/common/types';
import { razorpayEnabled } from '@/config/env';
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
import { PaymentModel } from '@/modules/payments/payment.model';
import { refundOrder } from '@/modules/payments/payment.service';
import { getSettings } from '@/modules/settings/settings.model';
import { OrderModel, type Order } from './order.model';
import { createOrderSchema, proofResponseSchema } from './order.schema';
import {
  buildItems,
  changeStatus,
  computeTotals,
  findByIdempotencyKey,
  netPaid,
  notifyStatus,
  ORDER_POPULATE,
  persistOrder,
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

  // A retried checkout (double tap, flaky network) gets the first order back, not a copy.
  const key = idempotencyHeader(req);
  const previous = await findByIdempotencyKey(key);
  if (previous) {
    res.setHeader('Idempotent-Replayed', 'true').status(200).json(previous.toJSON());
    return;
  }

  const settings = await getSettings();
  if (input.fulfilment.method === 'delivery' && !settings.delivery.enabled) {
    throw ApiError.badRequest('Home delivery is not available right now');
  }
  if (input.paymentMethod === 'online' && (!settings.payments.onlineEnabled || !razorpayEnabled())) {
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
  // Individuals paying online: nothing is printed until the money arrives. Approved
  // institutions are billed on account, so their orders start straight away.
  const payFirst = input.paymentMethod === 'online' && ctx.audience === 'retail';
  const status = needsQuote ? 'quote_pending' : payFirst ? 'awaiting_payment' : 'received';

  const { order, replayed } = await persistOrder({
    audience: ctx.audience,
    ...who,
    source: 'online',
    items,
    status,
    statusHistory: [{ status, by: auth.id, byKind: auth.kind, at: new Date() }],
    fulfilment: input.fulfilment,
    totals,
    payment: {
      method: input.paymentMethod,
      status: 'pending',
      amountPaid: 0,
      ...(status === 'awaiting_payment' ? { dueBy: new Date(Date.now() + settings.payments.onlineTimeoutMinutes * 60_000) } : {}),
    },
    customerNote: input.customerNote,
  }, key);
  if (!replayed) await notifyStatus(order);

  res.status(replayed ? 200 : 201).json(order.toJSON());
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
    .select(`${CUSTOMER_HIDDEN} +handover.code`)
    .populate(ORDER_POPULATE)
    .lean();
  if (!order) throw ApiError.notFound('Order');
  // The handover code is shown only while the customer needs it.
  const method = order.fulfilment?.method ?? 'pickup';
  const showCode = (order.status === 'ready' && method === 'pickup') || order.status === 'out_for_delivery';
  const { handover, ...rest } = order;
  const refunds = await PaymentModel.find({ order: order._id, kind: 'refund' }).select('amount status provider createdAt').sort({ createdAt: -1 }).lean();
  res.json({ ...rest, handoverCode: showCode ? handover?.code : undefined, refunds });
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
    if (order.status === 'cancelled') {
      res.json(order.toJSON());
      return;
    }
    if (!['quote_pending', 'awaiting_payment', 'received'].includes(order.status)) {
      throw ApiError.conflict('Work on this order has started, so it can no longer be cancelled online. Please call the shop.');
    }
    // Paid online: the money goes back automatically. Paid at the counter: the shop refunds in person.
    const paid = netPaid(order);
    if (paid > 0) {
      const counterMoney = await PaymentModel.exists({ order: order._id, kind: 'payment', status: 'captured', provider: { $ne: 'razorpay' } });
      if (counterMoney || !razorpayEnabled()) {
        throw ApiError.conflict('This order was paid at the shop. Please call the shop to cancel it.');
      }
    }
    order.cancelReason = req.body.reason || 'Cancelled by customer';
    await changeStatus(req, order, 'cancelled', { note: req.body.reason });
    const result = paid > 0
      ? await refundOrder(req, order, { reason: 'Order cancelled by customer', idempotencyKey: `cancel:${order.id}` })
      : order;
    res.json(result?.toJSON());
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
