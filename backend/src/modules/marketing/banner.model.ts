import { Schema, model, type InferSchemaType } from 'mongoose';
import { localizedSchema } from '@/common/types';

/**
 * hero    – large slide in the home page carousel
 * promo   – tile in the promotions row under the categories
 * feature – "new feature" announcement banner
 * offer   – one message in the offer strip above the site header
 */
export const BANNER_KINDS = ['hero', 'promo', 'feature', 'offer'] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];

/** Colour presets the website maps to gradients; used when there is no image. */
export const BANNER_THEMES = ['blue', 'magenta', 'sunset', 'mint', 'dark'] as const;

const bannerSchema = new Schema(
  {
    kind: { type: String, enum: BANNER_KINDS, required: true, index: true },
    title: { type: localizedSchema, required: true },
    subtitle: { type: localizedSchema, default: () => ({ en: '' }) },
    ctaLabel: { type: localizedSchema, default: () => ({ en: '' }) },
    /** Site path ("/products?category=gifts") or full URL. */
    link: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    theme: { type: String, enum: BANNER_THEMES, default: 'blue' },
    /** Short chip text, e.g. "NEW" or "20% OFF". */
    badge: { type: String, trim: true, maxlength: 24, default: '' },
    couponCode: { type: String, trim: true, uppercase: true, maxlength: 24, default: '' },
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export type Banner = InferSchemaType<typeof bannerSchema>;
export const BannerModel = model('Banner', bannerSchema);
