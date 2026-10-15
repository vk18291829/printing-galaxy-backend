import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { localizedSchema } from '@/common/types';

/**
 * How the priced quantity ("units") is derived:
 *  - page:   units = pageCount × copies (notes, PPT prints)
 *  - others: units = quantity entered by the customer
 */
export const PRODUCT_UNITS = ['page', 'piece', 'card', 'copy', 'set', 'photo'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/**
 * standard – priced instantly, optional upload
 * design   – personalised item, staff sends a proof before production
 * identity – identity-document PVC card (sensitive uploads)
 * quote    – staff quotes the price manually before payment (project files)
 */
export const PRODUCT_WORKFLOWS = ['standard', 'design', 'identity', 'quote'] as const;
export type ProductWorkflow = (typeof PRODUCT_WORKFLOWS)[number];

const optionValueSchema = new Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: localizedSchema, required: true },
    /** Added to the unit price for every unit (e.g. colour +₹4/page). */
    unitDelta: { type: Number, default: 0 },
    /** Added once per copy (e.g. spiral binding ₹40/copy). */
    fixedFee: { type: Number, default: 0, min: 0 },
    /** Minimum copies when this value is chosen (e.g. spiral binding ≥ 3). */
    minCopies: { type: Number, min: 1 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

const optionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: localizedSchema, required: true },
    required: { type: Boolean, default: true },
    values: { type: [optionValueSchema], default: [] },
  },
  { _id: false },
);

const tierSchema = new Schema(
  {
    minQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const priceBookSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    minQty: { type: Number, default: 1, min: 1 },
    tiers: { type: [tierSchema], default: [] },
  },
  { _id: false },
);

/** Two independent price books: individuals (retail) and approved institutions. */
const pricingSchema = new Schema(
  {
    retail: { type: priceBookSchema, required: true, default: () => ({}) },
    institution: { type: priceBookSchema, required: true, default: () => ({}) },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    name: { type: localizedSchema, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    shortDescription: { type: localizedSchema, default: () => ({ en: '' }) },
    description: { type: localizedSchema, default: () => ({ en: '' }) },
    images: { type: [String], default: [] },
    icon: { type: String, default: 'printer' },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'piece' },
    workflow: { type: String, enum: PRODUCT_WORKFLOWS, default: 'standard' },
    /** e.g. "8.6 × 5.4 cm" shown as a spec chip. */
    specs: { type: [String], default: [] },
    requiresUpload: { type: Boolean, default: false },
    acceptedFileTypes: { type: [String], default: ['pdf', 'jpg', 'png'] },
    uploadHint: { type: localizedSchema, default: () => ({ en: '' }) },
    /** Identity documents: private storage, staff-only access, auto-delete after retention. */
    sensitive: { type: Boolean, default: false },
    options: { type: [optionSchema], default: [] },
    pricing: { type: pricingSchema, required: true, default: () => ({}) },
    leadTimeDays: { type: Number, default: 1, min: 0 },
    tags: { type: [String], default: [] },
    isFeatured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

productSchema.index({ 'name.en': 'text', 'name.hi': 'text', tags: 'text' });

productSchema.pre('validate', function sortTiers() {
  for (const book of [this.pricing.retail, this.pricing.institution]) {
    book.tiers.sort((a, b) => a.minQty - b.minQty);
  }
});

export type Product = InferSchemaType<typeof productSchema>;
export type ProductDoc = HydratedDocument<Product>;
export const ProductModel = model('Product', productSchema);
