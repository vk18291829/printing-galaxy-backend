import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CARD_KINDS, FIELD_KEYS } from './card-kinds';

const hex = { type: String, match: /^#[0-9a-fA-F]{6}$/ };

/** An institution's saved card design: logo, colours, layout and which details to print. */
const templateSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: CARD_KINDS, required: true },
    orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },
    logo: { type: Schema.Types.ObjectId, ref: 'FileObject' },
    logoUrl: String,
    colors: {
      primary: { ...hex, default: '#1D6CF0' },
      accent: { ...hex, default: '#FFC20E' },
      text: { ...hex, default: '#131A2B' },
    },
    headerText: { type: String, trim: true, maxlength: 80 },
    subText: { type: String, trim: true, maxlength: 140 },
    fields: { type: [{ type: String, enum: FIELD_KEYS }], default: [] },
    backText: { type: String, trim: true, maxlength: 400 },
    signatureLabel: { type: String, trim: true, maxlength: 40, default: 'Principal' },
    validUpto: { type: String, trim: true, maxlength: 30 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export type InstitutionTemplate = InferSchemaType<typeof templateSchema>;
export type InstitutionTemplateDoc = HydratedDocument<InstitutionTemplate>;
export const InstitutionTemplateModel = model('InstitutionTemplate', templateSchema);

export const BULK_STATUSES = [
  'queued', // waiting for the worker
  'validating',
  'needs_fixes', // the report has errors; upload a corrected file
  'generating',
  'ready', // print sheet generated, institution can place the order
  'ordered',
  'failed', // unexpected error; staff can retry
] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

const issueSchema = new Schema(
  {
    row: Number,
    field: String,
    message: { type: String, required: true },
  },
  { _id: false },
);

const recordSchema = new Schema(
  {
    row: { type: Number, required: true },
    data: { type: Map, of: String, default: {} },
    /** Name of the matched image inside the photos ZIP. */
    photo: String,
  },
  { _id: false },
);

const bulkJobSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    template: { type: Schema.Types.ObjectId, ref: 'InstitutionTemplate', required: true },
    kind: { type: String, enum: CARD_KINDS, required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    options: { type: Map, of: String, default: {} },
    dataFile: { type: Schema.Types.ObjectId, ref: 'FileObject', required: true },
    photosFile: { type: Schema.Types.ObjectId, ref: 'FileObject' },
    status: { type: String, enum: BULK_STATUSES, default: 'queued', index: true },
    report: {
      rows: { type: Number, default: 0 },
      validRows: { type: Number, default: 0 },
      photosInZip: { type: Number, default: 0 },
      photosMatched: { type: Number, default: 0 },
      columns: { type: [String], default: [] },
      ignoredColumns: { type: [String], default: [] },
      errors: { type: [issueSchema], default: [] },
      warnings: { type: [issueSchema], default: [] },
    },
    records: { type: [recordSchema], default: [], select: false },
    output: {
      file: { type: Schema.Types.ObjectId, ref: 'FileObject' },
      sheets: Number,
      cards: Number,
      generatedAt: Date,
    },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    error: String,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

bulkJobSchema.index({ createdAt: -1 });

export type BulkJob = InferSchemaType<typeof bulkJobSchema>;
export type BulkJobDoc = HydratedDocument<BulkJob>;
export const BulkJobModel = model('BulkJob', bulkJobSchema);
