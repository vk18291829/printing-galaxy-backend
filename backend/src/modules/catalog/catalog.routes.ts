import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, objectId } from '@/common/validation';
import { optionalAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { resolvePricingContext } from '@/modules/institutions/institution.service';
import { quoteProduct } from '@/modules/pricing/pricing.service';
import { CategoryModel } from './category.model';
import { productListQuery } from './catalog.schema';
import { ProductModel, type Product } from './product.model';

export const catalogRouter = Router();

catalogRouter.get('/categories', async (_req, res) => {
  const categories = await CategoryModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  const counts = await ProductModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json(categories.map((c) => ({ ...c, productCount: countMap.get(String(c._id)) ?? 0 })));
});

catalogRouter.get('/products', validate({ query: productListQuery }), async (_req, res) => {
  const { category, audience, featured, q } = res.locals.query as z.infer<typeof productListQuery>;
  const filter: FilterQuery<Product> = { isActive: true };

  if (category) {
    const cat = await CategoryModel.findOne({ slug: category, isActive: true }).select('_id').lean();
    if (!cat) throw ApiError.notFound('Category');
    filter.category = cat._id;
  }
  if (audience) filter[`pricing.${audience}.enabled`] = true;
  if (featured !== undefined) filter.isFeatured = featured;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'name.en': rx }, { 'name.hi': rx }, { tags: rx }];
  }

  const products = await ProductModel.find(filter)
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate('category', 'name slug icon')
    .lean();
  res.json(products);
});

catalogRouter.get('/products/:slug', async (req, res) => {
  const product = await ProductModel.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug icon')
    .lean();
  if (!product) throw ApiError.notFound('Product');
  res.json(product);
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
  res.json(quoteProduct(product, ctx.audience, input, ctx.discountPercent));
});
