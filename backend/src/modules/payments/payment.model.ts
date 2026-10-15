import { Schema, model, type InferSchemaType } from 'mongoose';

const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, enum: ['razorpay', 'cash', 'upi_counter'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['created', 'captured', 'failed', 'refunded'], default: 'created' },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: String,
    raw: Schema.Types.Mixed,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model('Payment', paymentSchema);
