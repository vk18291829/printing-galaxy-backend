import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import type { Audience } from '@/common/types';
import { escapeRegex, objectId } from '@/common/validation';
import { optionalAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { resolvePricingContext } from '@/modules/institutions/institution.service';
import { quoteProduct } from '@/modules/pricing/pricing.service';
import { categoryIdsFor, hideInstitutionPrices, restrictToCategoryAudience } from './audience';
import { CategoryModel } from './category.model';
import { productBrowseQuery, productListQuery } from './catalog.schema';
import { ProductModel, type Product } from './product.model';

export const catalogRouter = Router();

/**
 * Category condition for product lists. `undefined` = no condition, `null` = nothing can match.
 * `section` limits the list to categories offered to that audience; `excludeCategory` drops
 * categories (comma-separated slugs, e.g. the business and wedding ranges with their own pages).
 */
async function resolveCategoryFilter(category?: string, section?: Audience, excludeCategory?: string) {
  const excluded = excludeCategory?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  // Several categories at once (comma-separated), e.g. everything on the Business Printing page.
  if (category?.includes(',')) {
    const slugs = category.split(',').map((s) => s.trim()).filter((s) => s && !excluded.includes(s));
    const ids = await CategoryModel.find({ slug: { $in: slugs }, isActive: true, ...(section && { audiences: section }) }).distinct('_id');
    return ids.length ? { $in: ids } : null;
  }
  if (category) {
    const cat = await CategoryModel.findOne({ slug: category, isActive: true, ...(section && { audiences: section }) }).select('_id').lean();
    return cat && !excluded.includes(category) ? cat._id : null;
  }
  if (!section && !excluded.length) return undefined;
  const ids = await CategoryModel.find({ isActive: true, ...(section && { audiences: section }), ...(excluded.length && { slug: { $nin: excluded } }) }).distinct('_id');
  return { $in: ids };
}

catalogRouter.get('/categories', async (_req, res) => {
  const categories = await CategoryModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  const counts = await ProductModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json(categories.map((c) => ({ ...c, productCount: countMap.get(String(c._id)) ?? 0 })));
});

catalogRouter.get('/products', optionalAuth, validate({ query: productListQuery }), async (req, res) => {
  const { category, audience, section, excludeCategory, featured, q } = res.locals.query as z.infer<typeof productListQuery>;
  const filter: FilterQuery<Product> = { isActive: true };

  const categoryFilter = await resolveCategoryFilter(category, section, excludeCategory);
  // Unknown or hidden category (old link, typo): an empty list, not an error page.
  if (categoryFilter === null) return void res.json([]);
  if (categoryFilter) filter.category = categoryFilter;
  if (audience) filter[`pricing.${audience}.enabled`] = true;
  if (section) filter[`pricing.${section}.enabled`] = true;
  if (featured !== undefined) filter.isFeatured = featured;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'name.en': rx }, { 'name.hi': rx }, { tags: rx }];
  }

  const products = await ProductModel.find(filter)
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate('category', 'name slug icon audiences')
    .lean();
  const { audience: viewer } = await resolvePricingContext(req.auth);
  res.json(products.map((p) => hideInstitutionPrices(p, viewer)));
});

const BROWSE_SORT: Record<z.infer<typeof productBrowseQuery>['sort'], Record<string, 1 | -1>> = {
  popular: { isFeatured: -1, 'rating.count': -1, sortOrder: 1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  'price-asc': { minPrice: 1, _id: 1 },
  'price-desc': { minPrice: -1, _id: 1 },
  rating: { 'rating.average': -1, 'rating.count': -1, _id: 1 },
};

/** Paged, sortable product list for the catalogue page's infinite scroll. */
catalogRouter.get('/products/browse', optionalAuth, validate({ query: productBrowseQuery }), async (req, res) => {
  const { category, section, excludeCategory, q, sort, page, limit } = res.locals.query as z.infer<typeof productBrowseQuery>;
  const match: FilterQuery<Product> = { isActive: true };
  // Price sorting uses the visitor's own price book, decided by their account, not the query.
  const { audience } = await resolvePricingContext(req.auth);

  const categoryFilter = await resolveCategoryFilter(category, section, excludeCategory);
  if (categoryFilter === null) {
    res.json({ items: [], total: 0, page, pages: 0 });
    return;
  }
  if (categoryFilter) match.category = categoryFilter;
  if (section) match[`pricing.${section}.enabled`] = true;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ 'name.en': rx }, { 'name.hi': rx }, { tags: rx }, { 'shortDescription.en': rx }];
  }

  // Sort by the cheapest tier of the visitor's price book; products without one sort last.
  const priceField = `$pricing.${audience}.tiers.unitPrice`;
  const [result] = await ProductModel.aggregate<{ items: Product[]; total: { n: number }[] }>([
    { $match: match },
    {
      $addFields: {
        minPrice: {
          $ifNull: [{ $min: priceField }, { $ifNull: [{ $min: '$pricing.retail.tiers.unitPrice' }, sort === 'price-desc' ? -1 : 1e12] }],
        },
      },
    },
    { $sort: BROWSE_SORT[sort] },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category', pipeline: [{ $project: { name: 1, slug: 1, icon: 1, audiences: 1 } }] } },
          { $unwind: '$category' },
          { $project: { minPrice: 0, __v: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  const total = result?.total[0]?.n ?? 0;
  res.json({ items: (result?.items ?? []).map((p) => hideInstitutionPrices(p, audience)), total, page, pages: Math.ceil(total / limit) });
});

catalogRouter.get('/products/:slug', optionalAuth, async (req, res) => {
  const product = await ProductModel.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug icon audiences')
    .lean();
  if (!product) throw ApiError.notFound('Product');
  const { audience } = await resolvePricingContext(req.auth);
  res.json(hideInstitutionPrices(product, audience));
});

const quoteSchema = z.object({
  productId: objectId,
  options: z.record(z.string()).default({}),
  quantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  pageCount: z.coerce.number().int().min(0).max(100_000).optional(),
  copies: z.coerce.number().int().min(1).max(10_000).optional(),
});

/** Live price preview. Audience is taken from the signed-in account, never from the client. */
catalogRouter.post('/pricing/quote', optionalAuth, validate({ body: quoteSchema }), async (req, res) => {
  const { productId, ...input } = req.body as z.infer<typeof quoteSchema>;
  const product = await ProductModel.findOne({ _id: productId, isActive: true }).lean();
  if (!product) throw ApiError.notFound('Product');
  const ctx = await resolvePricingContext(req.auth);
  const [allowed] = await restrictToCategoryAudience([product], ctx.audience);
  res.json(quoteProduct(allowed!, ctx.audience, input, ctx.discountPercent));
});
