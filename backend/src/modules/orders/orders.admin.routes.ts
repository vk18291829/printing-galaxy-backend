import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, objectId, paginate } from '@/common/validation';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import {
  assertInvoiceable,
  ensureInvoiceNumber,
  invoiceFileName,
  renderInvoicePdf,
} from '@/modules/invoices/invoice.service';
import { PaymentModel } from '@/modules/payments/payment.model';
import { round2 } from '@/modules/pricing/pricing.service';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from '@/modules/users/user.model';
import { OrderModel, TERMINAL_STATUSES, type Order, type OrderStatus } from './order.model';
import {
  adminOrderListQuery,
  assignSchema,
  quoteItemsSchema,
  recordPaymentSchema,
  sendProofSchema,
  statusChangeSchema,
  walkInOrderSchema,
} from './order.schema';
import {
  attachFilesToOrder,
  buildItems,
  changeStatus,
  computeTotals,
  generateOrderNumber,
  notifyStatus,
  ORDER_POPULATE,
  recalculateTotals,
  syncPaymentStatus,
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
  else if (q.active) filter.status = { $nin: TERMINAL_STATUSES };
  if (q.audience) filter.audience = q.audience;
  if (q.paymentStatus) filter['payment.status'] = q.paymentStatus;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ orderNumber: rx }, { 'contact.phone': rx }, { 'contact.name': rx }];
  }

  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total, statusCounts] = await Promise.all([
    OrderModel.find(filter)
      .select('-statusHistory -items.proofs')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'name')
      .lean(),
    OrderModel.countDocuments(filter),
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    items,
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
  });
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
    const { status, note, notify } = req.body as z.infer<typeof statusChangeSchema>;
    const order = await loadOrder(req.params.id as string);
    if (order.status === 'quote_pending' && !['cancelled', 'quote_pending'].includes(status)) {
      throw ApiError.conflict('Set the quote price before moving this order forward');
    }
    await changeStatus(req, order, status as OrderStatus, { note, notify });
    res.json(order.toJSON());
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

    if (order.status === 'quote_pending') {
      await changeStatus(req, order, 'received', {
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
  validate({ params: idParams, body: recordPaymentSchema }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    const { amount, provider, note } = req.body as z.infer<typeof recordPaymentSchema>;
    const due = round2(order.totals.total - (order.payment.amountPaid ?? 0));
    if (amount > due + 0.009) throw ApiError.badRequest(`Only ₹${due} is due on this order`);

    await PaymentModel.create({
      order: order._id,
      provider,
      amount,
      status: 'captured',
      recordedBy: req.auth!.id,
      note,
    });
    order.payment.amountPaid = round2((order.payment.amountPaid ?? 0) + amount);
    syncPaymentStatus(order);
    await order.save();
    audit(req, {
      action: 'payment.recorded',
      entity: 'Order',
      entityId: order._id,
      summary: `${order.orderNumber}: ₹${amount} via ${provider}`,
    });
    res.json(order.toJSON());
  },
);

/** Counter (walk-in) order entered by staff, so all work lives in one system. */
adminOrdersRouter.post('/walk-in', validate({ body: walkInOrderSchema }), async (req, res) => {
  const input = req.body as z.infer<typeof walkInOrderSchema>;
  if (input.fulfilment.method === 'delivery' && !input.fulfilment.address) {
    throw ApiError.badRequest('Delivery address is required');
  }

  let customer = await UserModel.findOne({ phone: input.customer.phone });
  customer ??= await UserModel.create({ phone: input.customer.phone, name: input.customer.name });

  // Counter customers hand over files in person, so uploads are optional here.
  const items = await buildItems(input.items, { audience: 'retail', discountPercent: 0 }, req.auth, {
    requireUploads: false,
  });
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, input.fulfilment.method);
  const status = items.some((i) => i.workflow === 'quote') ? 'quote_pending' : 'received';

  const order = await OrderModel.create({
    orderNumber: generateOrderNumber(),
    audience: 'retail',
    customer: customer._id,
    contact: { name: input.customer.name, phone: input.customer.phone },
    source: 'walk_in',
    items,
    status,
    statusHistory: [{ status, by: req.auth!.id, byKind: 'user', at: new Date(), note: 'Walk-in order' }],
    fulfilment: input.fulfilment,
    totals,
    payment: { method: 'counter', status: 'pending', amountPaid: 0 },
    assignedTo: req.auth!.id,
    internalNote: input.internalNote,
  });
  await attachFilesToOrder(order);

  if (input.amountPaid > 0) {
    const amount = Math.min(input.amountPaid, order.totals.total);
    await PaymentModel.create({
      order: order._id,
      provider: input.paymentProvider,
      amount,
      status: 'captured',
      recordedBy: req.auth!.id,
    });
    order.payment.amountPaid = amount;
    syncPaymentStatus(order);
    await order.save();
  }
  await notifyStatus(order);
  audit(req, { action: 'order.walk_in', entity: 'Order', entityId: order._id, summary: order.orderNumber });
  res.status(201).json(order.toJSON());
});

adminOrdersRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res) => {
  const order = await loadOrder(req.params.id as string);
  if (order.status !== 'cancelled') throw ApiError.conflict('Only cancelled orders can be deleted');
  await order.deleteOne();
  audit(req, { action: 'order.delete', entity: 'Order', entityId: order._id, summary: order.orderNumber });
  res.status(204).end();
});
