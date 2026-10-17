import crypto from 'node:crypto';
import type { Request } from 'express';
import { customAlphabet } from 'nanoid';
import type { z } from 'zod';
import { ApiError } from '@/common/errors';
import type { AuthContext } from '@/common/types';
import { emailChannel } from '@/config/env';
import { logEvent, logger } from '@/config/logger';
import { audit } from '@/modules/audit/audit.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { ensureInvoiceNumber, invoiceFileName, renderInvoicePdf } from '@/modules/invoices/invoice.service';
import type { PricingContext } from '@/modules/institutions/institution.service';
import { notifications } from '@/modules/notifications/notification.service';
import { quoteProduct, round2 } from '@/modules/pricing/pricing.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from '@/modules/users/user.model';
import {
  ALLOWED_TRANSITIONS,
  OrderModel,
  TERMINAL_STATUSES,
  type Order,
  type OrderDoc,
  type OrderStatus,
} from './order.model';
import type { orderItemInput } from './order.schema';

type ItemInput = z.infer<typeof orderItemInput>;

const orderSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

export function generateOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PG${ymd}-${orderSuffix()}`;
}

export const ORDER_POPULATE = [
  { path: 'items.files', select: 'originalName mimeType size pageCount sensitive status' },
  { path: 'items.proofs.file', select: 'originalName mimeType size publicUrl' },
];

/** Re-prices every item on the server. The client's totals are never trusted. */
export async function buildItems(
  items: ItemInput[],
  ctx: PricingContext,
  owner?: AuthContext,
  { requireUploads = true }: { requireUploads?: boolean } = {},
) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await ProductModel.find({ _id: { $in: productIds }, isActive: true }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const allFileIds = items.flatMap((i) => i.fileIds);
  const files = allFileIds.length ? await FileModel.find({ _id: { $in: allFileIds } }) : [];
  const fileMap = new Map(files.map((f) => [f.id as string, f]));

  const built = [];
  for (const [index, item] of items.entries()) {
    const product = productMap.get(item.productId);
    if (!product) throw ApiError.unprocessable(`Item ${index + 1}: product is no longer available`);

    const itemFiles = item.fileIds.map((id) => {
      const file = fileMap.get(id);
      if (!file || file.status !== 'uploaded' || file.order) {
        throw ApiError.unprocessable(`Item ${index + 1}: an uploaded file is missing, please re-upload`);
      }
      // Files must belong to whoever places the order (staff upload their own for walk-ins).
      if (owner && (String(file.owner.id) !== owner.id || file.owner.kind !== owner.kind)) {
        throw ApiError.forbidden();
      }
      return file;
    });

    if (requireUploads && product.requiresUpload && itemFiles.length === 0 && product.workflow !== 'quote') {
      throw ApiError.unprocessable(`Item ${index + 1}: please upload your file for ${product.name.en}`);
    }

    // For page-based items the page count comes from the uploaded PDFs whenever we could read them.
    let pageCount = item.pageCount;
    if (product.unit === 'page' && itemFiles.length > 0 && itemFiles.every((f) => f.pageCount)) {
      pageCount = itemFiles.reduce((sum, f) => sum + (f.pageCount ?? 0), 0);
    }

    const quote = quoteProduct(
      product,
      ctx.audience,
      { options: item.options, quantity: item.quantity, pageCount, copies: item.copies },
      ctx.discountPercent,
    );
    if (!quote.valid) {
      throw ApiError.unprocessable(`${product.name.en}: ${quote.errors[0]?.message}`, {
        itemIndex: index,
        errors: quote.errors,
      });
    }

    built.push({
      product: product._id,
      productName: product.name,
      productSlug: product.slug,
      workflow: product.workflow,
      unit: product.unit,
      options: quote.selectedOptions,
      quantity: quote.quantity,
      copies: quote.copies,
      pageCount: quote.pageCount ?? undefined,
      units: quote.units,
      unitPrice: quote.unitPrice,
      fixedFees: quote.fixedFees,
      discount: quote.discount,
      lineTotal: quote.subtotal,
      notes: item.notes,
      files: itemFiles.map((f) => f._id),
    });
  }
  return built;
}

export async function computeTotals(subtotal: number, method: 'pickup' | 'delivery') {
  const settings = await getSettings();
  const deliveryFee =
    method === 'delivery' && settings.delivery.enabled && subtotal < settings.delivery.freeAbove
      ? settings.delivery.fee
      : 0;
  const taxable = subtotal + deliveryFee;
  let tax = 0;
  let total = taxable;
  const taxRate = settings.tax.enabled ? settings.tax.rate : 0;
  if (taxRate) {
    if (settings.tax.pricesIncludeTax) {
      tax = round2(taxable - taxable / (1 + taxRate / 100));
    } else {
      tax = round2((taxable * taxRate) / 100);
      total = taxable + tax;
    }
  }
  return { subtotal: round2(subtotal), deliveryFee, taxRate, tax, total: round2(total) };
}

export async function recalculateTotals(order: OrderDoc) {
  const subtotal = order.items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totals = await computeTotals(subtotal, (order.fulfilment?.method ?? 'pickup') as 'pickup');
  order.set('totals', totals);
  syncPaymentStatus(order);
}

/** Money kept by the shop: paid minus refunded. */
export const netPaid = (order: Pick<Order, 'payment'>) =>
  round2((order.payment?.amountPaid ?? 0) - (order.payment?.amountRefunded ?? 0));

export const amountDue = (order: Pick<Order, 'payment' | 'totals'>) =>
  Math.max(0, round2(order.totals.total - netPaid(order)));

export function paymentStatusFor(order: Pick<Order, 'payment' | 'totals'>) {
  const net = netPaid(order);
  if ((order.payment?.amountRefunded ?? 0) > 0 && net <= 0.009) return 'refunded' as const;
  if (net <= 0) return 'pending' as const;
  return net + 0.009 >= order.totals.total ? ('paid' as const) : ('partial' as const);
}

export function syncPaymentStatus(order: OrderDoc) {
  order.payment.status = paymentStatusFor(order);
}

/**
 * Attaches the order's uploads to it. Each file can belong to one order only: the update is
 * conditional, so two orders racing for the same file cannot both get it.
 */
export async function claimFiles(order: OrderDoc) {
  const fileIds = [...new Set(order.items.flatMap((i) => i.files.map(String)))];
  if (!fileIds.length) return true;
  const result = await FileModel.updateMany({ _id: { $in: fileIds }, order: null }, { $set: { order: order._id } });
  if (result.modifiedCount === fileIds.length) return true;
  await FileModel.updateMany({ _id: { $in: fileIds }, order: order._id }, { $unset: { order: 1 } });
  return false;
}

const isDuplicate = (err: unknown, field: string) =>
  (err as { code?: number }).code === 11000 &&
  Object.keys((err as { keyPattern?: object }).keyPattern ?? (err as { keyValue?: object }).keyValue ?? {}).includes(field);

export async function findByIdempotencyKey(key?: string) {
  return key ? OrderModel.findOne({ idempotencyKey: key }) : null;
}

/**
 * Saves a new order exactly once: a repeated idempotency key returns the first order
 * (`replayed: true`), a clashing order number is regenerated, and files are claimed atomically.
 */
export async function persistOrder(data: Record<string, unknown>, key?: string) {
  let order: OrderDoc | undefined;
  for (let attempt = 0; attempt < 5 && !order; attempt += 1) {
    try {
      order = await OrderModel.create({ ...data, orderNumber: generateOrderNumber(), idempotencyKey: key });
    } catch (err) {
      if (key && isDuplicate(err, 'idempotencyKey')) {
        const existing = await findByIdempotencyKey(key);
        if (existing) return { order: existing, replayed: true };
      }
      if (!isDuplicate(err, 'orderNumber')) throw err;
    }
  }
  if (!order) throw new Error('Could not allocate an order number');

  if (!(await claimFiles(order))) {
    await order.deleteOne();
    throw ApiError.conflict('One of your files is already used in another order. Please upload it again.');
  }
  logEvent('order.created', {
    orderNumber: order.orderNumber,
    source: order.source,
    status: order.status,
    total: order.totals.total,
    items: order.items.length,
  });
  return { order, replayed: false };
}

/** The customer's 4-digit handover code, created the first time it is needed. */
export async function ensureHandoverCode(orderId: OrderDoc['_id']) {
  const current = await OrderModel.findById(orderId).select('+handover.code').lean();
  if (current?.handover?.code) return current.handover.code;
  const code = String(crypto.randomInt(1000, 10_000));
  await OrderModel.updateOne(
    { _id: orderId, 'handover.code': { $exists: false } },
    { $set: { 'handover.code': code, 'handover.issuedAt': new Date(), 'handover.wrongAttempts': 0 } },
  );
  const saved = await OrderModel.findById(orderId).select('+handover.code').lean();
  return saved?.handover?.code ?? code;
}

/** The invoice PDF for the "delivered" / "picked up" email. Email channel only; never blocks the email. */
async function invoiceAttachment(order: OrderDoc, status: OrderStatus) {
  if (!emailChannel() || !order.contact?.email || (status !== 'delivered' && status !== 'picked_up')) return undefined;
  try {
    await ensureInvoiceNumber(order);
    return [{ filename: invoiceFileName(order), content: await renderInvoicePdf(order) }];
  } catch (err) {
    logger.warn({ err, orderNumber: order.orderNumber }, 'Invoice could not be attached to the email');
    return undefined;
  }
}

export async function notifyStatus(order: OrderDoc, note?: string) {
  const status = order.status as OrderStatus;
  const method = (order.fulfilment?.method ?? 'pickup') as 'pickup' | 'delivery';
  // A packed delivery order has nothing for the customer to do yet.
  if (status === 'ready' && method === 'delivery') return;
  // A new unpaid online order: the customer is still in checkout.
  if (status === 'awaiting_payment' && order.statusHistory.length <= 1) return;

  const needsCode = (status === 'ready' && method === 'pickup') || status === 'out_for_delivery';
  void notifications.orderStatus({
    phone: order.contact?.phone,
    email: order.contact?.email,
    name: order.contact?.name,
    customer: order.customer,
    institution: order.institution,
    attachments: await invoiceAttachment(order, status),
    orderNumber: order.orderNumber,
    status,
    orderId: order._id,
    note,
    code: needsCode ? await ensureHandoverCode(order._id) : undefined,
    dedupeKey: `order:${order.id}:${status}:${order.statusHistory.length}`,
  });
}

/**
 * Checks a move made with the admin status control. Moves outside ALLOWED_TRANSITIONS need an
 * admin override with a reason; handovers need the customer's code (or an override).
 */
export function assertTransition(
  order: OrderDoc,
  to: OrderStatus,
  { override, note, role }: { override?: boolean; note?: string; role?: string },
) {
  const from = order.status as OrderStatus;
  if (from === to) return;
  if (TERMINAL_STATUSES.includes(from)) throw ApiError.conflict(`Order is already ${from.replace('_', ' ')}`);
  if (ALLOWED_TRANSITIONS[from]?.includes(to)) return;
  if (!override) {
    if (to === 'picked_up' || to === 'delivered') {
      throw ApiError.conflict("Hand the order over with the customer's code (Hand over button)");
    }
    if (from === 'awaiting_payment') {
      throw ApiError.conflict('This order is waiting for online payment. Record a payment to move it forward.');
    }
    throw ApiError.conflict(`An order cannot go from "${from.replace(/_/g, ' ')}" to "${to.replace(/_/g, ' ')}"`);
  }
  if (role !== 'admin') throw ApiError.forbidden('Only the owner can override the order flow');
  if (!note || note.trim().length < 5) throw ApiError.badRequest('Write a reason for the override (at least 5 characters)');
}

export async function changeStatus(
  req: Request | null,
  order: OrderDoc,
  status: OrderStatus,
  options: { note?: string; notify?: boolean; byKind?: 'user' | 'institution' | 'system' } = {},
) {
  if (order.status === status) {
    await order.save();
    return order;
  }
  if (TERMINAL_STATUSES.includes(order.status as OrderStatus)) {
    throw ApiError.conflict(`Order is already ${order.status.replace('_', ' ')}`);
  }
  if (status === 'picked_up' && order.fulfilment?.method === 'delivery') {
    throw ApiError.badRequest('This is a delivery order');
  }
  if (status === 'out_for_delivery' && order.fulfilment?.method !== 'delivery') {
    throw ApiError.badRequest('This is a pickup order');
  }

  const previous = order.status;
  order.status = status;
  if (status !== 'awaiting_payment') order.payment.dueBy = undefined;
  order.statusHistory.push({
    status,
    note: options.note,
    by: req?.auth?.id,
    byKind: options.byKind ?? req?.auth?.kind ?? 'system',
    at: new Date(),
  });

  if (TERMINAL_STATUSES.includes(status)) {
    order.completedAt = new Date();
    const settings = await getSettings();
    const deleteAfter = new Date(Date.now() + settings.sensitiveRetentionDays * 86_400_000);
    const fileIds = order.items.flatMap((i) => i.files);
    await FileModel.updateMany(
      { _id: { $in: fileIds }, sensitive: true },
      { $set: { deleteAfter } },
    );
  }

  await order.save();
  logEvent('order.status', { orderNumber: order.orderNumber, from: previous, to: status, by: req?.auth?.id ?? 'system' });
  audit(req, {
    action: 'order.status',
    entity: 'Order',
    entityId: order._id,
    summary: `${order.orderNumber}: ${previous} → ${status}`,
    changes: { from: previous, to: status, note: options.note },
  });
  if (options.notify !== false) await notifyStatus(order, options.note);
  return order;
}

export async function resolveContact(auth: AuthContext, contactName?: string, contactPhone?: string) {
  if (auth.kind === 'institution') {
    const inst = await InstitutionModel.findById(auth.id).lean();
    if (!inst) throw ApiError.unauthorized();
    return {
      customer: undefined,
      institution: inst._id,
      contact: { name: `${inst.contactName} (${inst.name})`, phone: inst.phone, email: inst.email },
    };
  }
  const user = await UserModel.findById(auth.id);
  if (!user) throw ApiError.unauthorized();
  // Optional: customers who sign in by email are reached by email; a number only helps the rider.
  const phone = user.phone || contactPhone || undefined;
  if (contactName && !user.name) user.name = contactName;
  // Keep the number on the account, unless another account already uses it.
  if (!user.phone && contactPhone && !(await UserModel.exists({ phone: contactPhone }))) user.phone = contactPhone;
  if (user.isModified()) await user.save();
  return {
    customer: user._id,
    institution: undefined,
    contact: { name: user.name || contactName || '', phone, email: user.email },
  };
}

export { OrderModel };
