import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * One money movement on an order. `kind: 'refund'` rows send money back; for those `status` is
 * `refund_pending` → `refunded` (or `failed`).
 */
const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    kind: { type: String, enum: ['payment', 'refund'], default: 'payment' },
    provider: { type: String, enum: ['razorpay', 'cash', 'upi_counter'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['created', 'captured', 'failed', 'refunded', 'refund_pending'],
      default: 'created',
    },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpayRefundId: { type: String, unique: true, sparse: true },
    /** For refunds: the payment being refunded. */
    refundOf: { type: Schema.Types.ObjectId, ref: 'Payment' },
    /** Client-supplied key: a retried "record payment" never counts the money twice. */
    idempotencyKey: { type: String, unique: true, sparse: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
    raw: Schema.Types.Mixed,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, provider: 1, createdAt: 1 });

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model('Payment', paymentSchema);
