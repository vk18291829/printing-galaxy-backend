import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { addressSchema } from '@/common/types';

export const INSTITUTION_TYPES = ['school', 'college', 'coaching', 'enterprise'] as const;
export const INSTITUTION_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

const institutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: INSTITUTION_TYPES, required: true },
    contactName: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    address: { type: addressSchema, required: true },
    gstin: { type: String, trim: true, uppercase: true },
    /** Rough number of students / employees, used by the owner when approving. */
    size: { type: Number, min: 0 },
    logoUrl: String,
    brandColor: String,
    status: { type: String, enum: INSTITUTION_STATUSES, default: 'pending', index: true },
    statusReason: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    /** Optional extra discount on top of institution prices, set by the owner. */
    extraDiscountPercent: { type: Number, min: 0, max: 50, default: 0 },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

institutionSchema.index({ name: 'text', email: 'text' });

institutionSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    return ret;
  },
});

export type Institution = InferSchemaType<typeof institutionSchema>;
export type InstitutionDoc = HydratedDocument<Institution>;
export const InstitutionModel = model('Institution', institutionSchema);
