import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { addressSchema, AUDIENCES, localizedSchema } from '@/common/types';

export const ORDER_STATUSES = [
  'quote_pending', // waiting for staff to price a custom job
  'awaiting_payment', // online payment chosen but not received yet; hidden from production
  'received',
  'proof_sent',
  'approved',
  'printing',
  'ready',
  'out_for_delivery',
  'delivered',
  'picked_up',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'picked_up', 'cancelled'];

/** Not yet in the production queue: staff do not work on these. */
export const PRE_PRODUCTION_STATUSES: OrderStatus[] = ['quote_pending', 'awaiting_payment'];

/**
 * Moves staff may make with the normal status control. Anything else needs an admin override
 * with a reason. `picked_up` and `delivered` are reached through the handover-code flows.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  quote_pending: ['cancelled'],
  awaiting_payment: ['cancelled'],
  received: ['proof_sent', 'approved', 'printing', 'cancelled'],
  proof_sent: ['received', 'approved', 'cancelled'],
  approved: ['proof_sent', 'printing', 'cancelled'],
  printing: ['ready', 'approved', 'cancelled'],
  ready: ['printing', 'out_for_delivery', 'cancelled'],
  out_for_delivery: ['ready', 'cancelled'],
  delivered: [],
  picked_up: [],
  cancelled: [],
};

/** Wrong handover codes allowed before staff must step in. */
export const HANDOVER_MAX_ATTEMPTS = 5;
/** Failed delivery attempts before the shop is alerted to call the customer. */
export const DELIVERY_MAX_ATTEMPTS = 3;

export const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'refunded', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['online', 'counter'] as const;

const selectedOptionSchema = new Schema(
  {
    key: String,
    label: localizedSchema,
    value: String,
    valueLabel: localizedSchema,
    unitDelta: Number,
    fixedFee: Number,
  },
  { _id: false },
);

const proofSchema = new Schema(
  {
    file: { type: Schema.Types.ObjectId, ref: 'FileObject', required: true },
    message: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'changes_requested'],
      default: 'pending',
    },
    customerComment: String,
    respondedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: localizedSchema, required: true },
  productSlug: String,
  workflow: String,
  unit: String,
  options: { type: [selectedOptionSchema], default: [] },
  quantity: { type: Number, default: 1 },
  copies: { type: Number, default: 1 },
  pageCount: Number,
  units: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  fixedFees: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  lineTotal: { type: Number, required: true },
  notes: { type: String, trim: true, maxlength: 1000 },
  files: [{ type: Schema.Types.ObjectId, ref: 'FileObject' }],
  proofs: { type: [proofSchema], default: [] },
});

const statusEventSchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: String,
    by: { type: Schema.Types.ObjectId },
    byKind: { type: String, enum: ['user', 'institution', 'system'] },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const fulfilmentSchema = new Schema(
  {
    method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    address: addressSchema,
  },
  { _id: false },
);

const totalsSchema = new Schema(
  {
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const paymentInfoSchema = new Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, default: 'online' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    amountPaid: { type: Number, default: 0 },
    /** Money sent back (Razorpay refunds or cash returned at the counter). */
    amountRefunded: { type: Number, default: 0 },
    razorpayOrderId: String,
    /** Unpaid online orders are cancelled after this time. */
    dueBy: Date,
  },
  { _id: false },
);

/**
 * Handover code: the customer gives it to the rider (delivery OTP) or shows it at the counter
 * (pickup code). Never returned to staff or riders; only the customer's own order view shows it.
 */
const handoverSchema = new Schema(
  {
    code: { type: String, select: false },
    issuedAt: Date,
    wrongAttempts: { type: Number, default: 0 },
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Handed over without the code by an admin, with a reason. */
    overrideReason: String,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    audience: { type: String, enum: AUDIENCES, required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', index: true },
    contact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    source: { type: String, enum: ['online', 'walk_in'], default: 'online' },
    items: { type: [orderItemSchema], required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'received', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },
    fulfilment: { type: fulfilmentSchema, required: true, default: () => ({}) },
    totals: { type: totalsSchema, required: true },
    payment: { type: paymentInfoSchema, required: true, default: () => ({}) },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    deliveryPerson: { type: Schema.Types.ObjectId, ref: 'User' },
    handover: { type: handoverSchema, default: () => ({}) },
    deliveryAttempts: { type: Number, default: 0 },
    /** `<kind>:<id>:<client key>`: a retried checkout returns the first order instead of a copy. */
    idempotencyKey: { type: String, unique: true, sparse: true, select: false },
    customerNote: { type: String, trim: true, maxlength: 1000 },
    internalNote: { type: String, trim: true, maxlength: 2000 },
    cancelReason: String,
    completedAt: Date,
    /** Assigned the first time the invoice is downloaded; never reused. */
    invoice: {
      number: { type: String, unique: true, sparse: true },
      issuedAt: Date,
    },
  },
  // Concurrent edits (staff, rider, payment webhook) fail with a conflict instead of overwriting each other.
  { timestamps: true, optimisticConcurrency: true, toJSON: { versionKey: false } },
);

orderSchema.path('items').validate((v: unknown[]) => v.length > 0, 'An order needs at least one item');
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ 'contact.phone': 1 });
orderSchema.index({ status: 1, 'payment.dueBy': 1 });

export type Order = InferSchemaType<typeof orderSchema>;
export type OrderDoc = HydratedDocument<Order>;
export const OrderModel = model('Order', orderSchema);
