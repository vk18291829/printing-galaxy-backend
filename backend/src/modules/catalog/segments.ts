import type { Audience } from '@/common/types';

/**
 * Which line of business an order belongs to, so the shop can work each one separately:
 * individuals (students, families, walk-ins), schools & colleges, businesses and weddings.
 * Category slugs match the website's catalogue sections (website/src/features/catalog/sections.ts).
 */
export const ORDER_SEGMENTS = ['individual', 'institution', 'business', 'wedding'] as const;
export type OrderSegment = (typeof ORDER_SEGMENTS)[number];

export const BUSINESS_CATEGORY_SLUGS = ['business-works', 'banners-signage', 'office-stationery'];
export const WEDDING_CATEGORY_SLUGS = ['wedding-invitations'];
/** School & college range: institutions only, whatever a category's settings say. */
export const SCHOOL_CATEGORY_SLUGS = ['school-works'];

export function segmentOf(audience: Audience, categorySlugs: string[]): OrderSegment {
  if (audience === 'institution') return 'institution';
  if (categorySlugs.some((s) => WEDDING_CATEGORY_SLUGS.includes(s))) return 'wedding';
  if (categorySlugs.some((s) => BUSINESS_CATEGORY_SLUGS.includes(s))) return 'business';
  return 'individual';
}
