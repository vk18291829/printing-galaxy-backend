import { Schema, model } from 'mongoose';

/**
 * Every webhook received (Razorpay, WhatsApp). The provider's event id is unique, so a retried
 * delivery of the same event is recognised and skipped. Kept 90 days for the System activity page.
 */
const webhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ['razorpay', 'whatsapp'], required: true },
    eventId: { type: String, unique: true, sparse: true },
    event: { type: String, required: true },
    status: { type: String, enum: ['processed', 'ignored', 'failed', 'duplicate'], default: 'processed' },
    summary: String,
    error: String,
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true },
);

webhookEventSchema.index({ createdAt: -1 });
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

export const WebhookEventModel = model('WebhookEvent', webhookEventSchema);
