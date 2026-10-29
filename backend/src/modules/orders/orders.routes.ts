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
import { DRAFT_REPLACED_REASON, reconcileRazorpayOrder, refundOrder } from '@/modules/payments/payment.service';
import { notifyStaff } from '@/modules/push/push.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { FILE_OPEN_STATUSES, OrderModel, type Order, type OrderStatus } from './order.model';
import { addItemFilesSchema, createOrderSchema, proofResponseSchema } from './order.schema';
import {
  buildItems,
  changeStatus,
  computeTotals,
  discardDraft,
  findByIdempotencyKey,
  netPaid,
  notifyStatus,
  ORDER_POPULATE,
  persistOrder,
  planOrder,
  resolveContact,
} from './order.service';

export const ordersRouter = Router();
ordersRouter.use(authenticate, requireKind('user', 'institution'));

function ownerFilter(auth: AuthContext): FilterQuery<Order> {
  return auth.kind === 'institution' ? { institution: auth.id } : { customer: auth.id };
}

const CUSTOMER_HIDDEN = '-internalNote -assignedTo -deliveryPerson';

/**
 * A customer who closed the payment window and checks out again reuses the same uploads. Their
 * earlier unpaid checkout still holds those files, so it is closed first (after one last check
 * with Razorpay, in case the money did arrive).
 */
async function discardStaleDrafts(auth: AuthContext, fileIds: unknown[]) {
  if (!fileIds.length) return;
  const drafts = await OrderModel.find({
    ...ownerFilter(auth),
    draft: true,
    status: { $in: ['awaiting_payment', 'cancelled'] },
    'payment.amountPaid': { $lte: 0 },
    'items.files': { $in: fileIds },
  });
  for (const draft of drafts) {
    if (draft.status === 'awaiting_payment' && draft.payment.razorpayOrderId && (await reconcileRazorpayOrder(draft.payment.razorpayOrderId))) continue;
    const fresh = await OrderModel.findById(draft._id);
    if (fresh?.status === 'awaiting_payment') await discardDraft(fresh, DRAFT_REPLACED_REASON);
    // Timed out earlier: a late payment for it is now refunded instead of bringing it back.
    else if (fresh?.status === 'cancelled') {
      await OrderModel.updateOne({ _id: fresh._id }, { $set: { cancelReason: DRAFT_REPLACED_REASON } });
      await FileModel.updateMany({ order: fresh._id }, { $unset: { order: 1, deleteAfter: 1 } });
    }
  }
}

ordersRouter.post('/', validate({ body: createOrderSchema }), async (req, res) => {
  const auth = req.auth!;
  const input = req.body as z.infer<typeof createOrderSchema>;

  // A retried checkout (double tap, flaky network) gets the first order back, not a copy.
  const key = idempotencyHeader(req);
  const previous = await findByIdempotencyKey(key);
  // A checkout that was closed unpaid starts over; anything else is the same order again.
  if (previous && !(previous.draft && previous.status === 'cancelled')) {
    res.setHeader('Idempotent-Replayed', 'true').status(200).json(previous.toJSON());
    return;
  }
  if (previous) await OrderModel.updateOne({ _id: previous._id }, { $unset: { idempotencyKey: 1 } });

  const settings = await getSettings();
  const ctx = await resolvePricingContext(auth);
  if (input.fulfilment.method === 'delivery' && !settings.delivery.enabled) {
    throw ApiError.badRequest('Home delivery is not available right now');
  }
  if (input.paymentMethod === 'online' && (!settings.payments.onlineEnabled || !razorpayEnabled())) {
    throw ApiError.badRequest('Online payment is not available right now');
  }
  // Approved institutions are invoiced on account, so the counter switch does not apply to them.
  if (input.paymentMethod === 'counter' && !settings.payments.counterEnabled && ctx.audience !== 'institution') {
    throw ApiError.badRequest('Pay at counter is not available right now');
  }

  await discardStaleDrafts(auth, input.items.flatMap((i) => i.fileIds));
  const items = await buildItems(input.items, ctx, auth);
  // Custom sizes have no list price, so they always go through a quote the customer accepts.
  const quoteRequested = input.requestQuote || items.some((i) => i.customSize);
  const needsQuote = quoteRequested || items.some((i) => i.workflow === 'quote');
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, input.fulfilment.method);
  const who = await resolveContact(auth, input.contactName, input.contactPhone);
  // Individuals paying online: nothing is printed until the money arrives. Approved
  // institutions are billed on account, so their orders start straight away.
  const payFirst = input.paymentMethod === 'online' && ctx.audience === 'retail';
  const status = needsQuote ? 'quote_pending' : payFirst ? 'awaiting_payment' : 'received';

  const { order, replayed } = await persistOrder({
    audience: ctx.audience,
    ...who,
    source: 'online',
    draft: status === 'awaiting_payment' || undefined,
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
    reference: input.reference,
    quote: { requested: quoteRequested },
  }, key);
  // An unpaid checkout is announced to the shop when the payment arrives (payment.service).
  if (!replayed && !order.draft) {
    await notifyStatus(order);
    const segment = { individual: 'Individual', institution: 'School & College', business: 'Business', wedding: 'Wedding' }[order.segment ?? 'individual'];
    void notifyStaff({
      kind: status === 'quote_pending' ? 'quote' : 'order',
      title: status === 'quote_pending' ? `Quote request ${order.orderNumber}` : `New order ${order.orderNumber}`,
      body: `${segment} · ${order.contact?.name || 'Customer'} · ₹${order.totals.total} · ${order.items.map((i) => i.productName?.en).join(', ')}`,
      path: `/orders/${order.id}`,
      permission: 'orders',
      tag: `order-${order.id}`,
    });
  }

  res.status(replayed ? 200 : 201).json(order.toJSON());
});

ordersRouter.get('/', validate({ query: pagination }), async (req, res) => {
  const { page, limit } = res.locals.query as z.infer<typeof pagination>;
  // Unpaid checkouts are not orders yet.
  const filter = { ...ownerFilter(req.auth!), draft: { $ne: true } };
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
  // An unpaid checkout is not an order, here as in the list.
  const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!), draft: { $ne: true } })
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
    if (!['quote_pending', 'quote_sent', 'awaiting_payment', 'received'].includes(order.status)) {
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
    void notifyStaff({
      kind: 'cancel',
      title: `Order cancelled · ${order.orderNumber}`,
      body: `${order.contact?.name || 'Customer'} cancelled${req.body.reason ? `: “${req.body.reason}”` : '.'}`,
      path: `/orders/${order.id}`,
      permission: 'orders',
      tag: `order-${order.id}`,
    });
    const result = paid > 0
      ? await refundOrder(req, order, { reason: 'Order cancelled by customer', idempotencyKey: `cancel:${order.id}` })
      : order;
    res.json(result?.toJSON());
  },
);

/** The customer accepts the price the shop sent; the order then joins the production queue. */
ordersRouter.post('/:id/accept-quote', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(req.auth!) });
  if (!order) throw ApiError.notFound('Order');
  if (order.status !== 'quote_sent') throw ApiError.conflict('There is no quote waiting for your approval');
  if (order.quote?.validUntil && order.quote.validUntil < new Date()) {
    throw ApiError.conflict('This quote has expired. Please ask the shop for a new one.');
  }
  order.set('quote.acceptedAt', new Date());
  order.dueDate = (await planOrder(order.audience, order.items.map((i) => i.product))).dueDate;
  const settings = await getSettings();
  const payFirst = order.payment.method === 'online' && order.audience === 'retail' && order.totals.total > netPaid(order);
  if (payFirst) order.payment.dueBy = new Date(Date.now() + settings.payments.quotePaymentDays * 86_400_000);
  await changeStatus(req, order, payFirst ? 'awaiting_payment' : 'received', { note: 'Quote accepted' });
  void notifyStaff({ kind: 'quote', title: `Quote accepted · ${order.orderNumber}`, body: `₹${order.totals.total}. Ready to start.`, path: `/orders/${order.id}`, permission: 'orders', tag: `order-${order.id}` });
  res.json(order.toJSON());
});

/** Files sent after the order is confirmed, e.g. an institution's student data sheet. */
ordersRouter.post(
  '/:id/items/:itemId/files',
  validate({ params: z.object({ id: objectId, itemId: objectId }), body: addItemFilesSchema }),
  async (req, res) => {
    const auth = req.auth!;
    const { fileIds } = req.body as z.infer<typeof addItemFilesSchema>;
    const order = await OrderModel.findOne({ _id: req.params.id, ...ownerFilter(auth) });
    if (!order) throw ApiError.notFound('Order');
    if (!FILE_OPEN_STATUSES.includes(order.status as OrderStatus)) {
      throw ApiError.conflict('Files can be added once the order is confirmed and until printing starts');
    }
    const item = order.items.id(req.params.itemId as string);
    if (!item) throw ApiError.notFound('Item');
    if (item.files.length + fileIds.length > 30) throw ApiError.badRequest('An item can have at most 30 files');

    const ids = [...new Set(fileIds)];
    const files = await FileModel.find({ _id: { $in: ids } });
    const mine = files.filter((f) => f.status === 'uploaded' && !f.order && String(f.owner.id) === auth.id && f.owner.kind === auth.kind);
    if (mine.length !== ids.length) throw ApiError.unprocessable('An uploaded file is missing, please upload it again');
    const claimed = await FileModel.updateMany({ _id: { $in: ids }, order: null }, { $set: { order: order._id } });
    if (claimed.modifiedCount !== ids.length) {
      await FileModel.updateMany({ _id: { $in: ids }, order: order._id }, { $unset: { order: 1 } });
      throw ApiError.conflict('One of your files is already used in another order. Please upload it again.');
    }
    item.files.push(...mine.map((f) => f._id));
    await order.save();
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
    void notifyStaff({
      kind: 'proof',
      title: decision === 'approved' ? `Proof approved · ${order.orderNumber}` : `Changes requested · ${order.orderNumber}`,
      body: decision === 'approved' ? `${item.productName?.en}: ready to print.` : `${item.productName?.en}: “${comment ?? ''}”`,
      path: `/orders/${order.id}`,
      permission: 'proofs',
      tag: `order-${order.id}`,
    });
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
