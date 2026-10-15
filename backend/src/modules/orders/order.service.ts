import type { Request } from 'express';
import { customAlphabet } from 'nanoid';
import type { z } from 'zod';
import { ApiError } from '@/common/errors';
import type { AuthContext } from '@/common/types';
import { audit } from '@/modules/audit/audit.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import type { PricingContext } from '@/modules/institutions/institution.service';
import { notifications } from '@/modules/notifications/notification.service';
import { quoteProduct, round2 } from '@/modules/pricing/pricing.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from '@/modules/users/user.model';
import {
  OrderModel,
  TERMINAL_STATUSES,
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

export function syncPaymentStatus(order: OrderDoc) {
  const paid = order.payment?.amountPaid ?? 0;
  const total = order.totals.total;
  if (order.payment.status === 'refunded') return;
  order.payment.status = paid <= 0 ? 'pending' : paid + 0.009 >= total ? 'paid' : 'partial';
}

export async function attachFilesToOrder(order: OrderDoc) {
  const fileIds = order.items.flatMap((i) => i.files);
  if (fileIds.length) await FileModel.updateMany({ _id: { $in: fileIds } }, { $set: { order: order._id } });
}

async function contactLanguage(order: OrderDoc): Promise<'en' | 'hi'> {
  if (!order.customer) return 'en';
  const user = await UserModel.findById(order.customer).select('language').lean();
  return (user?.language as 'en' | 'hi') ?? 'en';
}

export async function notifyStatus(order: OrderDoc, note?: string) {
  void notifications.orderStatus({
    phone: order.contact?.phone,
    lang: await contactLanguage(order),
    orderNumber: order.orderNumber,
    status: order.status,
    orderId: order._id,
    note,
  });
}

const FORWARD_FLOW: OrderStatus[] = [
  'quote_pending',
  'received',
  'proof_sent',
  'approved',
  'printing',
  'ready',
  'out_for_delivery',
  'delivered',
];

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

export function isForwardMove(from: OrderStatus, to: OrderStatus) {
  return FORWARD_FLOW.indexOf(to) >= FORWARD_FLOW.indexOf(from);
}

export async function resolveContact(auth: AuthContext, contactName?: string) {
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
  if (contactName && !user.name) {
    user.name = contactName;
    await user.save();
  }
  return {
    customer: user._id,
    institution: undefined,
    contact: { name: user.name || contactName || '', phone: user.phone, email: user.email },
  };
}

export { OrderModel };
