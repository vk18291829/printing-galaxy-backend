import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { AUDIENCES, localizedSchema } from '@/common/types';

const categorySchema = new Schema(
  {
    name: { type: localizedSchema, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: localizedSchema, default: () => ({ en: '' }) },
    /** Tabler icon name rendered by the frontends, e.g. "id-badge-2". */
    icon: { type: String, default: 'printer' },
    imageUrl: String,
    audiences: { type: [String], enum: AUDIENCES, default: () => [...AUDIENCES] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export type Category = InferSchemaType<typeof categorySchema>;
export type CategoryDoc = HydratedDocument<Category>;
export const CategoryModel = model('Category', categorySchema);
