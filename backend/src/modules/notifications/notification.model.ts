import { Schema, model } from 'mongoose';

const notificationSchema = new Schema(
  {
    /** 'whatsapp' only on older entries. */
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'console'], required: true },
    to: { type: String, required: true },
    /** Message kind, e.g. order_ready, low_stock, promo. */
    template: { type: String, required: true },
    /** MSG91 template id the SMS used. */
    templateId: String,
    /** Email subject. */
    subject: String,
    /** Held a pickup / delivery code: the body is masked and it cannot be re-sent. */
    secret: Boolean,
    body: String,
    /** Template variables, kept so a failed message can be re-sent. Never set when they hold a code. */
    params: { type: [String], default: undefined },
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], required: true },
    error: String,
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
    /** Times staff re-sent this message from the System activity page. */
    retries: { type: Number, default: 0 },
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });

export const NotificationLogModel = model('NotificationLog', notificationSchema);

/**
 * Claims a message before it is sent: the same order update retried (double click, job retry)
 * never messages the customer twice. Entries expire after 7 days.
 */
const notificationClaimSchema = new Schema({
  _id: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 7 * 86_400 },
});

export const NotificationClaimModel = model('NotificationClaim', notificationClaimSchema);
