import { z } from 'zod';
import { addressInput, indianPhone, objectId } from '@/common/validation';
import { ORDER_SEGMENTS } from '@/modules/catalog/segments';
import { ORDER_STATUSES, PAYMENT_METHODS, SIZE_UNITS } from './order.model';

export const orderItemInput = z.object({
  productId: objectId,
  options: z.record(z.string()).default({}),
  quantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  pageCount: z.coerce.number().int().min(0).max(100_000).optional(),
  copies: z.coerce.number().int().min(1).max(10_000).optional(),
  notes: z.string().trim().max(1000).optional(),
  fileIds: z.array(objectId).max(20).default([]),
  customSize: z
    .object({
      width: z.coerce.number().positive().max(10_000),
      height: z.coerce.number().positive().max(10_000),
      unit: z.enum(SIZE_UNITS),
    })
    .optional(),
});

export const createOrderSchema = z
  .object({
    items: z.array(orderItemInput).min(1, 'Your cart is empty').max(50),
    fulfilment: z.object({
      method: z.enum(['pickup', 'delivery']),
      address: addressInput.optional(),
    }),
    paymentMethod: z.enum(PAYMENT_METHODS),
    customerNote: z.string().trim().max(1000).optional(),
    contactName: z.string().trim().max(80).optional(),
    /** Required when the account has no number (email sign-ins): the shop or rider calls it. */
    contactPhone: indianPhone.optional(),
    /** Ask the shop for a price instead of placing the order straight away. */
    requestQuote: z.boolean().default(false),
    reference: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.fulfilment.method === 'pickup' || v.fulfilment.address, {
    message: 'Delivery address is required',
    path: ['fulfilment', 'address'],
  });

export const walkInOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(80),
    phone: indianPhone,
    /** Order updates go here when messages are sent by email. */
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  }),
  items: z.array(orderItemInput).min(1).max(50),
  fulfilment: z.object({
    method: z.enum(['pickup', 'delivery']),
    address: addressInput.optional(),
  }),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentProvider: z.enum(['cash', 'upi_counter']).default('cash'),
  internalNote: z.string().trim().max(2000).optional(),
});

/** Order placed by staff for a school or college, priced from its own price book. */
export const institutionOrderSchema = z.object({
  institutionId: objectId,
  items: z.array(orderItemInput).min(1).max(50),
  /** Delivery goes to the institution's address on file. */
  fulfilment: z.object({ method: z.enum(['pickup', 'delivery']) }),
  requestQuote: z.boolean().default(false),
  reference: z.string().trim().max(60).optional(),
  customerNote: z.string().trim().max(1000).optional(),
  internalNote: z.string().trim().max(2000).optional(),
});

export const institutionQuoteSchema = z.object({
  institutionId: objectId,
  productId: objectId,
  options: z.record(z.string()).default({}),
  quantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  pageCount: z.coerce.number().int().min(0).max(100_000).optional(),
  copies: z.coerce.number().int().min(1).max(10_000).optional(),
  method: z.enum(['pickup', 'delivery']).default('pickup'),
});

export const addItemFilesSchema = z.object({
  fileIds: z.array(objectId).min(1).max(10),
});

export const proofResponseSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  comment: z.string().trim().max(1000).optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
  notify: z.boolean().default(true),
  /** Admin only: make a move outside the normal flow (needs a note). */
  override: z.boolean().default(false),
  /** When cancelling a paid order, refund what was paid. */
  refund: z.boolean().default(false),
});

export const handoverSchema = z.object({
  code: z.string().trim().optional(),
  overrideReason: z.string().trim().max(300).optional(),
  amountCollected: z.coerce.number().min(0).default(0),
  provider: z.enum(['cash', 'upi_counter']).default('cash'),
  note: z.string().trim().max(300).optional(),
});

export const refundSchema = z.object({
  /** Leave empty to refund everything paid. */
  amount: z.coerce.number().positive().optional(),
  reason: z.string().trim().min(3, 'Write a reason for the refund').max(300),
  /** `cash`: money handed back at the counter, even for online payments. */
  method: z.enum(['original', 'cash']).default('original'),
});

export const assignSchema = z.object({
  assignedTo: objectId.nullable().optional(),
  deliveryPerson: objectId.nullable().optional(),
});

export const quoteItemsSchema = z.object({
  items: z
    .array(z.object({ itemId: objectId, lineTotal: z.coerce.number().min(0) }))
    .min(1),
  note: z.string().trim().max(500).optional(),
});

export const dueDateSchema = z.object({
  dueDate: z.coerce.date(),
  note: z.string().trim().max(300).optional(),
});

export const sendProofSchema = z.object({
  fileId: objectId,
  message: z.string().trim().max(500).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  provider: z.enum(['cash', 'upi_counter']),
  note: z.string().trim().max(300).optional(),
});

export const adminOrderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  audience: z.enum(['retail', 'institution']).optional(),
  segment: z.enum(ORDER_SEGMENTS).optional(),
  /** `due`: soonest ready-by date first (a staff member's work list). */
  sort: z.enum(['newest', 'due']).default('newest'),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  paymentStatus: z.enum(['pending', 'partial', 'paid', 'refunded', 'failed']).optional(),
  fulfilment: z.enum(['pickup', 'delivery']).optional(),
  assignedTo: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
