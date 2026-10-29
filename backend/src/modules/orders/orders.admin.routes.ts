import { Router } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { idempotencyHeader } from '@/common/idempotency';
import { escapeRegex, objectId, paginate } from '@/common/validation';
import { assertPermission, requireAdmin, requirePermission } from '@/middleware/auth';
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
import { restrictToCategoryAudience } from '@/modules/catalog/audience';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { SCHOOL_CATEGORY_SLUGS } from '@/modules/catalog/segments';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { resolvePricingContext } from '@/modules/institutions/institution.service';
import { quoteProduct, round2 } from '@/modules/pricing/pricing.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from '@/modules/users/user.model';
import { completeHandover } from './handover.service';
import { OrderModel, PRE_PRODUCTION_STATUSES, QUOTE_VALID_DAYS, TERMINAL_STATUSES, type Order, type OrderStatus } from './order.model';
import {
  addItemFilesSchema,
  adminOrderListQuery,
  assignSchema,
  handoverSchema,
  institutionOrderSchema,
  institutionQuoteSchema,
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
  resolveContact,
} from './order.service';

export const adminOrdersRouter = Router();

const idParams = z.object({ id: objectId });

async function loadOrder(id: string) {
  const order = await OrderModel.findById(id);
  if (!order) throw ApiError.notFound('Order');
  return order;
}

// ── Orders for a school or college, entered by staff ──────────────────────
// Registered before `/:id` so the path is not read as an order id.

/** The institution's own pricing context; only approved institutions get school prices. */
async function institutionContext(institutionId: string) {
  const ctx = await resolvePricingContext({ id: institutionId, kind: 'institution', role: 'institution' });
  if (!ctx.institutionStatus) throw ApiError.notFound('Institution');
  if (ctx.audience !== 'institution') throw ApiError.conflict('Approve this institution before placing orders for it');
  return ctx;
}

/** The school & college range (medals, ID cards, ties…): the only products staff order for an institution. */
async function schoolCategoryIds() {
  return CategoryModel.find({ isActive: true, slug: { $in: SCHOOL_CATEGORY_SLUGS }, audiences: 'institution' }).distinct('_id');
}

async function assertSchoolProducts(productIds: string[]) {
  const ids = await schoolCategoryIds();
  const count = await ProductModel.countDocuments({ _id: { $in: [...new Set(productIds)] }, category: { $in: ids } });
  if (count !== new Set(productIds).size) throw ApiError.unprocessable('Only school & college products can be ordered for an institution');
}

/** Products offered to schools, with their school price books (staff tokens would see retail ones). */
adminOrdersRouter.get('/institution-order/products', requirePermission('walkin'), async (_req, res) => {
  const products = await ProductModel.find({
    isActive: true,
    'pricing.institution.enabled': true,
    category: { $in: await schoolCategoryIds() },
  })
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate('category', 'name slug icon audiences')
    .lean();
  res.json(products);
});

/** Everything sold at the counter: every individual product except the school & college range. */
adminOrdersRouter.get('/walk-in/products', requirePermission('walkin'), async (_req, res) => {
  const school = (await schoolCategoryIds()).map(String);
  const categories = await CategoryModel.find({ isActive: true, audiences: 'retail' }).select('_id').sort({ sortOrder: 1, createdAt: 1 }).lean();
  const order = new Map(categories.filter((c) => !school.includes(String(c._id))).map((c, i) => [String(c._id), i]));
  const products = await ProductModel.find({ isActive: true, 'pricing.retail.enabled': true, category: { $in: [...order.keys()] } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate('category', 'name slug icon')
    .lean();
  // Grouped in the catalogue's category order.
  products.sort((a, b) => (order.get(String(a.category?._id)) ?? 0) - (order.get(String(b.category?._id)) ?? 0));
  res.json(products);
});

/** Delivery and GST for a walk-in bill, worked out exactly as the order will be. */
adminOrdersRouter.post(
  '/walk-in/totals',
  requirePermission('walkin'),
  validate({ body: z.object({ subtotal: z.number().min(0).max(10_000_000), method: z.enum(['pickup', 'delivery']).default('pickup') }) }),
  async (req, res) => {
    res.json(await computeTotals(req.body.subtotal, req.body.method));
  },
);

/** Live price for one line at the institution's prices, with delivery and tax for the review step. */
adminOrdersRouter.post('/institution-order/quote', requirePermission('walkin'), validate({ body: institutionQuoteSchema }), async (req, res) => {
  const { institutionId, productId, method, ...input } = req.body as z.infer<typeof institutionQuoteSchema>;
  const ctx = await institutionContext(institutionId);
  await assertSchoolProducts([productId]);
  const product = await ProductModel.findOne({ _id: productId, isActive: true }).lean();
  if (!product) throw ApiError.notFound('Product');
  const [allowed] = await restrictToCategoryAudience([product], ctx.audience);
  const quote = quoteProduct(allowed!, ctx.audience, input, ctx.discountPercent);
  res.json({ ...quote, totals: await computeTotals(quote.subtotal, method) });
});

/** Same order a school places from its dashboard, entered by staff (phone call, visit, email). */
adminOrdersRouter.post('/institution-order', requirePermission('walkin'), validate({ body: institutionOrderSchema }), async (req, res) => {
  const input = req.body as z.infer<typeof institutionOrderSchema>;
  const key = idempotencyHeader(req);
  const previous = await findByIdempotencyKey(key);
  if (previous) {
    res.status(200).json(previous.toJSON());
    return;
  }

  const ctx = await institutionContext(input.institutionId);
  const institution = await InstitutionModel.findById(input.institutionId).lean();
  const settings = await getSettings();
  if (input.fulfilment.method === 'delivery') {
    if (!settings.delivery.enabled) throw ApiError.badRequest('Home delivery is not available right now');
    if (!institution?.address?.line1) throw ApiError.badRequest('This institution has no address on file for delivery');
  }

  await assertSchoolProducts(input.items.map((i) => i.productId));
  // Schools hand files over in person or by email, so uploads are optional here.
  const items = await buildItems(input.items, ctx, req.auth, { requireUploads: false });
  // Custom sizes have no list price, so they always go through a quote the school accepts.
  const quoteRequested = input.requestQuote || items.some((i) => i.customSize);
  const needsQuote = quoteRequested || items.some((i) => i.workflow === 'quote');
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, input.fulfilment.method);
  const who = await resolveContact({ id: input.institutionId, kind: 'institution', role: 'institution' });
  const status = needsQuote ? 'quote_pending' : 'received';

  const { order, replayed } = await persistOrder({
    audience: ctx.audience,
    ...who,
    source: 'walk_in',
    items,
    status,
    statusHistory: [{ status, by: req.auth!.id, byKind: 'user', at: new Date(), note: 'Entered by staff' }],
    fulfilment: input.fulfilment.method === 'delivery' ? { method: 'delivery', address: institution!.address } : { method: 'pickup' },
    totals,
    // Institutions are invoiced on their account.
    payment: { method: 'counter', status: 'pending', amountPaid: 0 },
    customerNote: input.customerNote,
    reference: input.reference,
    quote: { requested: quoteRequested },
    assignedTo: req.auth!.id,
    internalNote: input.internalNote,
  }, key);
  if (replayed) {
    res.status(200).json(order.toJSON());
    return;
  }
  await notifyStatus(order);
  audit(req, { action: 'order.institution', entity: 'Order', entityId: order._id, summary: `${order.orderNumber} for ${institution?.name}` });
  res.status(201).json(order.toJSON());
});

adminOrdersRouter.get('/', validate({ query: adminOrderListQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof adminOrderListQuery>;
  // Online checkouts that were never paid are not orders yet.
  const filter: FilterQuery<Order> = { draft: { $ne: true } };
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
      { $match: { draft: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Open orders per segment, for the tab badges.
    OrderModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $nin: TERMINAL_STATUSES }, draft: { $ne: true } } },
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
    // Sending money back needs the same permission as the refund button; checked before anything changes.
    if (status === 'cancelled' && refund) await assertPermission(req.auth, 'refunds');
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

/** The customer's file brought in after the order was entered (email, WhatsApp, pen drive). */
adminOrdersRouter.post(
  '/:id/items/:itemId/files',
  requirePermission('orders'),
  validate({ params: z.object({ id: objectId, itemId: objectId }), body: addItemFilesSchema }),
  async (req, res) => {
    const order = await loadOrder(req.params.id as string);
    if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) throw ApiError.conflict('This order is already closed');
    const item = order.items.id(req.params.itemId as string);
    if (!item) throw ApiError.notFound('Item');
    const ids = [...new Set((req.body as z.infer<typeof addItemFilesSchema>).fileIds)];
    if (item.files.length + ids.length > 30) throw ApiError.badRequest('An item can have at most 30 files');

    const claimed = await FileModel.updateMany(
      { _id: { $in: ids }, purpose: 'order', status: 'uploaded', order: null },
      { $set: { order: order._id } },
    );
    if (claimed.modifiedCount !== ids.length) {
      await FileModel.updateMany({ _id: { $in: ids }, order: order._id }, { $unset: { order: 1 } });
      throw ApiError.conflict('A file is missing or already used in another order. Please upload it again.');
    }
    item.files.push(...ids.map((id) => new Types.ObjectId(id)));
    await order.save();
    audit(req, { action: 'order.files', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${ids.length} file(s) added to ${item.productName?.en}` });
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
