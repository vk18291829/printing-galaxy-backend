import { Schema, model, type InferSchemaType } from 'mongoose';
import { PERSON_KINDS } from './roster.model';

/** Days a teacher's photo link works before the school has to make a new one. */
export const PHOTO_LINK_DAYS = 7;

/**
 * A link a school shares with a class teacher to photograph one class without an account.
 * It only shows that class's names and roll numbers, and only allows adding photos.
 * The token is stored as a SHA-256 hash; the plain token exists only in the shared URL.
 */
const photoLinkSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    kind: { type: String, enum: PERSON_KINDS, default: 'student' },
    class: { type: String, trim: true, maxlength: 40 },
    section: { type: String, trim: true, maxlength: 40 },
    label: { type: String, trim: true, maxlength: 80 },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    photosTaken: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false, transform: (_d, ret: Record<string, unknown>) => (delete ret.tokenHash, ret) } },
);

export type PhotoLink = InferSchemaType<typeof photoLinkSchema>;
export const PhotoLinkModel = model('RosterPhotoLink', photoLinkSchema);
