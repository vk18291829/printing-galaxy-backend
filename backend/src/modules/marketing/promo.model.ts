import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A promotional SMS template the owner registered on DLT and added in MSG91. `text` is the DLT
 * text with {#var#} where the owner fills in values (at most 30 characters each) when sending.
 * Only used on the SMS channel; promotional emails are written freely.
 */
const smsTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    msg91TemplateId: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const SmsTemplateModel = model('SmsTemplate', smsTemplateSchema);

export const CAMPAIGN_STATUSES = ['sending', 'sent', 'failed', 'stopped'] as const;

/** One promotional send to every opted-in customer, by email or SMS. */
const campaignSchema = new Schema(
  {
    channel: { type: String, enum: ['email', 'sms'], required: true },
    /** Email: subject. SMS: template name. */
    title: { type: String, required: true },
    /** The message as customers read it. */
    text: { type: String, required: true },
    /** Email only: optional button. */
    link: String,
    buttonLabel: String,
    /** SMS only. */
    template: { type: Schema.Types.ObjectId, ref: 'SmsTemplate' },
    msg91TemplateId: String,
    params: { type: [String], default: undefined },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'sending', index: true },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    error: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    finishedAt: Date,
  },
  { timestamps: true },
);

campaignSchema.index({ createdAt: -1 });

export type Campaign = InferSchemaType<typeof campaignSchema>;
export type CampaignDoc = HydratedDocument<Campaign>;
export const CampaignModel = model('Campaign', campaignSchema);
