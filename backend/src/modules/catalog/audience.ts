import type { Audience } from '@/common/types';
import { CategoryModel } from './category.model';
import type { Product } from './product.model';

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
