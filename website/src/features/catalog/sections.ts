/**
 * Which retail categories live where. The Products page is for individuals; business and wedding
 * ranges have their own pages (school works are institution-only and never listed for retail).
 */
export const BUSINESS_CATEGORIES = ['business-works', 'banners-signage', 'office-stationery'];
export const WEDDING_CATEGORIES = ['wedding-invitations'];
export const NOT_INDIVIDUAL = [...BUSINESS_CATEGORIES, ...WEDDING_CATEGORIES];

/** Where a category's products are browsed: its own page, or the Products page filtered to it. */
export function categoryHome(slug: string) {
  if (BUSINESS_CATEGORIES.includes(slug)) return '/business-printing';
  if (WEDDING_CATEGORIES.includes(slug)) return '/wedding-cards';
  return `/products?category=${slug}`;
}
