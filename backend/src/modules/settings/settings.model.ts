import { Schema, model, type InferSchemaType } from 'mongoose';

const sub = <T extends Schema>(schema: T) => ({ type: schema, required: true, default: () => ({}) });

const shopSchema = new Schema(
  {
    name: { type: String, default: 'Printing Galaxy' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    /** State of the shop's GST registration; decides CGST+SGST vs IGST on invoices. */
    state: { type: String, default: '' },
    mapUrl: { type: String, default: '' },
    hours: { type: String, default: 'Mon–Sat, 9:00 AM – 8:00 PM' },
    gstin: { type: String, default: '' },
    /** Registered business name, if different from the shop name (shown in the footer, as e-commerce rules require). */
    legalName: { type: String, default: '' },
    /** Grievance officer: the person customers can escalate a complaint to. */
    grievanceName: { type: String, default: '' },
    grievanceEmail: { type: String, default: '' },
    grievancePhone: { type: String, default: '' },
  },
  { _id: false },
);

/** Full profile URLs shown as icons in the website footer and contact page; empty = hidden. */
const socialSchema = new Schema(
  {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    youtube: { type: String, default: '' },
    x: { type: String, default: '' },
    linkedin: { type: String, default: '' },
  },
  { _id: false },
);

const taxSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    rate: { type: Number, default: 18, min: 0, max: 28 },
    pricesIncludeTax: { type: Boolean, default: true },
    /** HSN/SAC printed on invoices (9989 = printing and reproduction services). */
    sacCode: { type: String, default: '9989' },
  },
  { _id: false },
);

const deliverySchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    fee: { type: Number, default: 40, min: 0 },
    freeAbove: { type: Number, default: 999, min: 0 },
  },
  { _id: false },
);

const paymentsSchema = new Schema(
  {
    onlineEnabled: { type: Boolean, default: true },
    counterEnabled: { type: Boolean, default: true },
    /** Unpaid online orders are cancelled after this many minutes. */
    onlineTimeoutMinutes: { type: Number, default: 30, min: 5, max: 1440 },
    /** Days a customer has to pay once a custom quote is priced. */
    quotePaymentDays: { type: Number, default: 3, min: 1, max: 30 },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    shop: sub(shopSchema),
    social: sub(socialSchema),
    tax: sub(taxSchema),
    delivery: sub(deliverySchema),
    payments: sub(paymentsSchema),
    /** Days to keep sensitive (identity document) files after an order is completed. */
    sensitiveRetentionDays: { type: Number, default: 30, min: 1, max: 365 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export type Settings = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model('Settings', settingsSchema);

export async function getSettings() {
  const existing = await SettingsModel.findOne({ key: 'global' });
  if (existing) return existing;
  return SettingsModel.create({ key: 'global' });
}
