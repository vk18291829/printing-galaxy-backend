import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { idempotencyHeader } from '@/common/idempotency';
import { escapeRegex, objectId, paginate } from '@/common/validation';
import { requireAdmin, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import {
  assertInvoiceable,
  ensureInvoiceNumber,
  invoiceFileName,
  renderInvoicePdf,
} from '@/modules/invoices/invoice.service';
import { PaymentModel } from '@/modules/payments/payment.model';
import { recordPayment, refundOrder } from '@/modules/payments/payment.service';
import { round2 } from '@/modules/pricing/pricing.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from '@/modules/users/user.model';
import { completeHandover } from './handover.service';
import { OrderModel, PRE_PRODUCTION_STATUSES, QUOTE_VALID_DAYS, TERMINAL_STATUSES, type Order, type OrderStatus } from './order.model';
import {
  adminOrderListQuery,
  assignSchema,
  handoverSchema,
  quoteItemsSchema,
  dueDateSchema,
  recordPaymentSchema,
  refundSchema,
  sendProofSchema,
  statusChangeSchema,
  walkInOrderSchema,
} from './order.schema';
import {
  amountDue,
  assertTransition,
  buildItems,
  changeStatus,
  computeTotals,
  findByIdempotencyKey,
  netPaid,
  notifyStatus,
  ORDER_POPULATE,
  persistOrder,
  recalculateTotals,
} from './order.service';

export const adminOrdersRouter = Router();

const idParams = z.object({ id: objectId });

async function loadOrder(id: string) {
  const order = await OrderModel.findById(id);
  if (!order) throw ApiError.notFound('Order');
  return order;
}

adminOrdersRouter.get('/', validate({ query: adminOrderListQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof adminOrderListQuery>;
  const filter: FilterQuery<Order> = {};
  if (q.status) filter.status = q.status;
  // "Active" is the production queue: unpaid online orders and unpriced quotes are left out.
  else if (q.active) filter.status = { $nin: [...TERMINAL_STATUSES, ...PRE_PRODUCTION_STATUSES.filter((st) => st !== 'quote_pending')] };
  if (q.audience) filter.audience = q.audience;
  if (q.segment) filter.segment = q.segment;
  if (q.overdue) {
    filter.dueDate = { $lt: new Date() };
    if (!q.status) filter.status = { $nin: [...TERMINAL_STATUSES, ...PRE_PRODUCTION_STATUSES, 'ready', 'out_for_delivery'] };
  }
  if (q.paymentStatus) filter['payment.status'] = q.paymentStatus;
  if (q.fulfilment) filter['fulfilment.method'] = q.fulfilment;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.email': rx }, { 'contact.name': rx }];
  }

  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total, statusCounts, segmentCounts] = await Promise.all([
    OrderModel.find(filter)
      .select('-statusHistory -items.proofs')
      .sort(q.sort === 'due' ? { dueDate: 1, createdAt: 1 } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'name')
      .lean(),
    OrderModel.countDocuments(filter),
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Open orders per segment, for the tab badges.
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $nin: TERMINAL_STATUSES } } },
      { $group: { _id: '$segment', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    items,
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
    segmentCounts: Object.fromEntries(segmentCounts.map((s) => [s._id ?? 'individual', s.count])),
  });
});

/** Changes the promised date; the change and its reason go into the order history. */
adminOrdersRouter.patch('/:id/due', validate({ params: idParams, body: dueDateSchema }), async (req, res) => {
  const { dueDate, note } = req.body as z.infer<typeof dueDateSchema>;
  const order = await loadOrder(req.params.id as string);
  if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) throw ApiError.conflict('Order is closed');
  const before = order.dueDate;
  order.dueDate = dueDate;
  await order.save();
  audit(req, {
    action: 'order.due',
    entity: 'Order',
    entityId: order._id,
    summary: `${order.orderNumber}: due ${before?.toISOString().slice(0, 10) ?? '—'} → ${dueDate.toISOString().slice(0, 10)}${note ? ` (${note})` : ''}`,
  });
  res.json(order.toJSON());
});

adminOrdersRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const order = await OrderModel.findById(req.params.id)
    .populate(ORDER_POPULATE)
    .populate('assignedTo deliveryPerson', 'name role')
    .populate('institution', 'name type status phone email')
    .lean();
  if (!order) throw ApiError.notFound('Order');
  const payments = await PaymentModel.find({ order: order._id }).select('-raw').sort({ createdAt: -1 }).lean();
  res.json({ ...order, payments });
});

adminOrdersRouter.get('/:id/invoice', validate({ params: idParams }), async (req, res) => {
  const order = await loadOrder(req.params.id as string);
  assertInvoiceable(order);
  await ensureInvoiceNumber(order);
  const pdf = await renderInvoicePdf(order);
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `inline; filename="${invoiceFileName(order)}"`)
    .send(Buffer.from(pdf));
});

adminOrdersRouter.patch(
  '/:id/status',
  validate({ params: idParams, body: statusChangeSchema }),
  async (req, res) => {
    const { status, note, notify, override, refund } = req.body as z.infer<typeof statusChangeSchema>;
    const order = await loadOrder(req.params.id as string);
    if (order.status === status) {
      res.json(order.toJSON());
      return;
    }
    if (order.status === 'quote_pending' && status !== 'cancelled' && !override) {
      throw ApiError.conflict('Set the quote price before moving this order forward');
    }
    if (order.status === 'quote_sent' && status !== 'cancelled' && !override) {
      throw ApiError.conflict('The customer has not accepted the quote yet');
    }
    assertTransition(order, status as OrderStatus, { override, note, role: req.auth?.role });
    if (status === 'cancelled') order.cancelReason = note || 'Cancelled by the shop';
    await changeStatus(req, order, status as OrderStatus, { note: override ? `Override: ${note}` : note, notify });
    // Cancelling a paid order can send the money back in the same step.
    const result = status === 'cancelled' && refund && netPaid(order) > 0
      ? await refundOrder(req, order, { reason: note || 'Order cancelled by the shop', idempotencyKey: `cancel:${order.id}` })
      : order;
    res.json(result?.toJSON());
  },
);

/** Counter pickup: the customer shows their code; any balance is collected now. */
adminOrdersRouter.post(
  '/:id/handover',
  validate({ params: idParams, body: handoverSchema }),
  async (req, res) => {
    const body = req.body as z.infer<typeof handoverSchema>;
    const order = await completeHandover(req, req.params.id as string, 'picked_up', {
      code: body.code,
      overrideReason: body.overrideReason,
      collected: body.amountCollected,
      provider: body.provider,
      note: body.note,
      idempotencyKey: idempotencyHeader(req),
    });
    res.json(order?.toJSON());
  },
);

adminOrdersRouter.post(
  '/:id/refunds',
  requirePermission('refunds'),
  validate({ params: idParams, body: refundSchema }),
  async (req, res) => {
    const body = req.body as z.infer<typeof refundSchema>;
    const order = await loadOrder(req.params.id as string);
    const result = await refundOrder(req, order, {
      amount: body.amount,
      reason: body.reason,
      cashOnly: body.method === 'cash',
      idempotencyKey: idempotencyHeader(req),
    });
    res.json(result?.toJSON());
  },
);

adminOrdersRouter.patch(
  '/:id/assign',
  validate({ params: idParams, body: assignSchema }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    const body = req.body as z.infer<typeof assignSchema>;
    for (const field of ['assignedTo', 'deliveryPerson'] as const) {
      if (body[field] === undefined) continue;
      if (body[field]) {
        const staff = await UserModel.exists({ _id: body[field], role: { $ne: 'customer' }, isActive: true });
        if (!staff) throw ApiError.badRequest('Staff member not found');
      }
      order.set(field, body[field] ?? undefined);
    }
    await order.save();
    audit(req, { action: 'order.assign', entity: 'Order', entityId: order._id, changes: body });
    res.json(order.toJSON());
  },
);

adminOrdersRouter.patch(
  '/:id/note',
  validate({ params: idParams, body: z.object({ internalNote: z.string().trim().max(2000) }) }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    order.internalNote = req.body.internalNote;
    await order.save();
    res.json(order.toJSON());
  },
);

/** Sets prices for items that needed a manual quote, then moves the order to "received". */
adminOrdersRouter.patch(
  '/:id/quote',
  validate({ params: idParams, body: quoteItemsSchema }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) throw ApiError.conflict('Order is closed');
    const body = req.body as z.infer<typeof quoteItemsSchema>;
    const before = order.totals.total;

    for (const { itemId, lineTotal } of body.items) {
      const item = order.items.id(itemId);
      if (!item) throw ApiError.badRequest('Item not found in this order');
      item.lineTotal = round2(lineTotal);
      item.unitPrice = item.units ? round2(lineTotal / item.units) : round2(lineTotal);
      item.fixedFees = 0;
      item.discount = 0;
    }
    await recalculateTotals(order);
    audit(req, {
      action: 'order.price',
      entity: 'Order',
      entityId: order._id,
      summary: `${order.orderNumber}: total ₹${before} → ₹${order.totals.total}`,
      changes: body,
    });

    if (order.quote?.requested && ['quote_pending', 'quote_sent'].includes(order.status)) {
      // The customer asked for a quote: send them the price and wait for them to accept it.
      order.set('quote.sentAt', new Date());
      order.set('quote.validUntil', new Date(Date.now() + QUOTE_VALID_DAYS * 86_400_000));
      const note = body.note ?? `Quote: ₹${order.totals.total}`;
      if (order.status === 'quote_sent') {
        await order.save();
        await notifyStatus(order, note);
      } else {
        await changeStatus(req, order, 'quote_sent', { note });
      }
    } else if (order.status === 'quote_pending') {
      // Individuals who chose online payment pay before work starts.
      const payFirst = order.payment.method === 'online' && order.audience === 'retail' && amountDue(order) > 0;
      if (payFirst) {
        const settings = await getSettings();
        order.payment.dueBy = new Date(Date.now() + settings.payments.quotePaymentDays * 86_400_000);
      }
      await changeStatus(req, order, payFirst ? 'awaiting_payment' : 'received', {
        note: body.note ?? `Price confirmed: ₹${order.totals.total}`,
      });
    } else {
      await order.save();
    }
    res.json(order.toJSON());
  },
);

adminOrdersRouter.post(
  '/:id/items/:itemId/proofs',
  requirePermission('proofs'),
  validate({ params: z.object({ id: objectId, itemId: objectId }), body: sendProofSchema }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    const item = order.items.id(req.params.itemId as string);
    if (!item) throw ApiError.notFound('Item');
    const { fileId, message } = req.body as z.infer<typeof sendProofSchema>;

    const file = await FileModel.findOne({ _id: fileId, purpose: 'proof', status: 'uploaded' });
    if (!file) throw ApiError.badRequest('Upload the proof file first');
    file.order = order._id;
    await file.save();

    const last = item.proofs.at(-1);
    if (last?.status === 'pending') last.status = 'changes_requested';
    item.proofs.push({ file: file._id, message, status: 'pending', createdBy: req.auth!.id });
    await changeStatus(req, order, 'proof_sent', { note: message });
    res.json(order.toJSON());
  },
);

adminOrdersRouter.post(
  '/:id/payments',
  requirePermission('payments'),
  validate({ params: idParams, body: recordPaymentSchema }),
  async (req, res) => {
    const { amount, provider, note } = req.body as z.infer<typeof recordPaymentSchema>;
    const order = await loadOrder(req.params.id as string);
    if (order.status === 'cancelled') throw ApiError.conflict('This order was cancelled');
    const result = await recordPayment(req, order._id, { amount, provider, note, idempotencyKey: idempotencyHeader(req) });
    res.json(result?.toJSON());
  },
);

/** Counter (walk-in) order entered by staff, so all work lives in one system. */
adminOrdersRouter.post('/walk-in', requirePermission('walkin'), validate({ body: walkInOrderSchema }), async (req, res) => {
  const input = req.body as z.infer<typeof walkInOrderSchema>;
  if (input.fulfilment.method === 'delivery' && !input.fulfilment.address) {
    throw ApiError.badRequest('Delivery address is required');
  }
  const key = idempotencyHeader(req);
  const previous = await findByIdempotencyKey(key);
  if (previous) {
    res.status(200).json(previous.toJSON());
    return;
  }

  const email = input.customer.email;
  let customer = await UserModel.findOne({ phone: input.customer.phone });
  customer ??= email ? await UserModel.findOne({ email }) : null;
  customer ??= await UserModel.create({ phone: input.customer.phone, name: input.customer.name, email });
  if (email && !customer.email && !(await UserModel.exists({ email }))) {
    customer.email = email;
    await customer.save();
  }

  // Counter customers hand over files in person, so uploads are optional here.
  const items = await buildItems(input.items, { audience: 'retail', discountPercent: 0 }, req.auth, {
    requireUploads: false,
  });
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, input.fulfilment.method);
  const status = items.some((i) => i.workflow === 'quote') ? 'quote_pending' : 'received';

  const { order, replayed } = await persistOrder({
    audience: 'retail',
    customer: customer._id,
    contact: { name: input.customer.name, phone: input.customer.phone, email: email ?? customer.email },
    source: 'walk_in',
    items,
    status,
    statusHistory: [{ status, by: req.auth!.id, byKind: 'user', at: new Date(), note: 'Walk-in order' }],
    fulfilment: input.fulfilment,
    totals,
    payment: { method: 'counter', status: 'pending', amountPaid: 0 },
    assignedTo: req.auth!.id,
    internalNote: input.internalNote,
  }, key);
  if (replayed) {
    res.status(200).json(order.toJSON());
    return;
  }

  let result = order;
  if (input.amountPaid > 0) {
    const amount = Math.min(input.amountPaid, order.totals.total);
    result = (await recordPayment(req, order._id, { amount, provider: input.paymentProvider, note: 'Paid at the counter' })) ?? order;
  }
  await notifyStatus(result);
  audit(req, { action: 'order.walk_in', entity: 'Order', entityId: order._id, summary: order.orderNumber });
  res.status(201).json(result.toJSON());
});

adminOrdersRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res) => {
  const order = await loadOrder(req.params.id as string);
  if (order.status !== 'cancelled') throw ApiError.conflict('Only cancelled orders can be deleted');
  await order.deleteOne();
  audit(req, { action: 'order.delete', entity: 'Order', entityId: order._id, summary: order.orderNumber });
  res.status(204).end();
});
