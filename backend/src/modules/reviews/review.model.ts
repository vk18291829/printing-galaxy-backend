import { Schema, model, type InferSchemaType } from 'mongoose';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const reviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    author: {
      id: { type: Schema.Types.ObjectId, required: true },
      kind: { type: String, enum: ['user', 'institution'], required: true },
    },
    /** Name shown publicly, captured when the review is written. */
    authorName: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    /** New and edited reviews wait for staff approval before they are shown. */
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
    /** The author has a delivered or picked-up order containing this product. */
    verifiedPurchase: { type: Boolean, default: false },
    /** Picked by staff for the home page testimonials. */
    featured: { type: Boolean, default: false, index: true },
    reply: {
      text: { type: String, trim: true, maxlength: 1000 },
      at: Date,
    },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// One review per author per product; writing again edits it.
reviewSchema.index({ product: 1, 'author.id': 1 }, { unique: true });
reviewSchema.index({ createdAt: -1 });

export type Review = InferSchemaType<typeof reviewSchema>;
export const ReviewModel = model('Review', reviewSchema);
