import { Schema, model } from 'mongoose';

const notificationSchema = new Schema(
  {
    channel: { type: String, enum: ['whatsapp', 'sms', 'console'], required: true },
    to: { type: String, required: true },
    template: { type: String, required: true },
    body: String,
    /** Template variables, kept so a failed WhatsApp message can be re-sent as SMS. */
    params: { type: [String], default: undefined },
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], required: true },
    error: String,
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
    /** WhatsApp message id (wamid), matched against delivery status webhooks. */
    providerMessageId: { type: String, index: true, sparse: true },
    /** Set when a failed WhatsApp message was re-sent as SMS. */
    fallbackSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });

export const NotificationLogModel = model('NotificationLog', notificationSchema);
