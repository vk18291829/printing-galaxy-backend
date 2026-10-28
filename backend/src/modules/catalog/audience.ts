import type { Audience } from '@/common/types';
import { logger } from '@/config/logger';
import { CategoryModel } from './category.model';
import { ProductModel, type Product } from './product.model';
import { SCHOOL_CATEGORY_SLUGS } from './segments';

/** Active categories offered to one audience (Products page = retail, Institutions page = institution). */
export async function categoryIdsFor(audience: Audience) {
  return CategoryModel.find({ isActive: true, audiences: audience }).distinct('_id');
}

/**
 * Turns off the audience's price book on products whose category is not offered to that audience,
 * so school products can't be quoted or ordered by individuals (and the other way round).
 */
export async function restrictToCategoryAudience<T extends Pick<Product, 'category' | 'pricing'>>(products: T[], audience: Audience): Promise<T[]> {
  const allowed = new Set((await categoryIdsFor(audience)).map(String));
  return products.map((p) =>
    allowed.has(String(p.category)) ? p : { ...p, pricing: { ...p.pricing, [audience]: { ...p.pricing[audience], enabled: false } } },
  );
}

/**
 * Prices a visitor may see. Institution tiers are only for approved institutions (everyone else still
 * sees that a product is offered to schools: the book stays `enabled`), and a switched-off price
 * book never shows its old tiers.
 */
export function hideInstitutionPrices<T extends Pick<Product, 'pricing'>>(product: T, audience: Audience): T {
  const { retail, institution } = product.pricing;
  return {
    ...product,
    pricing: {
      retail: retail.enabled ? retail : { ...retail, tiers: [] },
      institution: audience === 'institution' && institution.enabled ? institution : { ...institution, tiers: [] },
    },
  };
}

export const isSchoolCategory = (slug?: string) => Boolean(slug && SCHOOL_CATEGORY_SLUGS.includes(slug));

/**
 * School products are never sold to individuals: school categories are institution-only and their
 * products have no individual price book. Runs at startup to repair older data; the admin routes
 * apply the same rule on every save.
 */
export async function enforceSchoolOnlyCatalog() {
  const fixed = await CategoryModel.updateMany(
    { slug: { $in: SCHOOL_CATEGORY_SLUGS }, audiences: { $ne: ['institution'] } },
    { $set: { audiences: ['institution'] } },
  );
  const ids = await CategoryModel.find({ slug: { $in: SCHOOL_CATEGORY_SLUGS } }).distinct('_id');
  const products = await ProductModel.updateMany({ category: { $in: ids }, 'pricing.retail.enabled': true }, { $set: { 'pricing.retail.enabled': false } });
  if (fixed.modifiedCount || products.modifiedCount) {
    logger.info({ categories: fixed.modifiedCount, products: products.modifiedCount }, 'School catalogue set to institutions only');
  }
}
