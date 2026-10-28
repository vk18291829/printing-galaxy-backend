import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { reserveSequence } from '@/common/counter.model';

/**
 * An institution's people (students and staff) kept between orders, so ID cards can be printed
 * from one maintained list instead of a fresh spreadsheet every time.
 */
export const PERSON_KINDS = ['student', 'staff'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

/** Same keys as the bulk spreadsheet fields (card-kinds.ts), minus the photo column. */
export const ROSTER_FIELDS = [
  'name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup',
  'phone', 'address', 'route', 'session', 'employeeId', 'designation', 'department', 'qualification',
] as const;
export type RosterField = (typeof ROSTER_FIELDS)[number];

export const PHOTO_SOURCES = ['upload', 'camera', 'import'] as const;

const text = { type: String, trim: true, maxlength: 200 };

const personSchema = new Schema(
  {
    institution: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    kind: { type: String, enum: PERSON_KINDS, required: true },
    /** Unique across the shop, e.g. PG000123. Printed on the card and used as the photo file name. */
    code: { type: String, required: true, unique: true },
    ...Object.fromEntries(ROSTER_FIELDS.map((f) => [f, f === 'name' ? { ...text, required: true } : text])),
    photo: {
      file: { type: Schema.Types.ObjectId, ref: 'FileObject' },
      source: { type: String, enum: PHOTO_SOURCES },
      updatedAt: Date,
    },
    /** Who added the record: the institution itself or shop staff. */
    addedBy: { type: String, enum: ['institution', 'user'], default: 'institution' },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

personSchema.index({ institution: 1, kind: 1, class: 1, section: 1, rollNo: 1 });

export type Person = InferSchemaType<typeof personSchema> & Partial<Record<RosterField, string>>;
export type PersonDoc = HydratedDocument<Person>;
export const PersonModel = model<Person>('RosterPerson', personSchema);

/** Reserves `count` person codes in one step, unique across all institutions (PG000123). */
export async function nextCodes(count: number) {
  return (await reserveSequence('roster', count)).map((n) => `PG${String(n).padStart(6, '0')}`);
}
