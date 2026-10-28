import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, objectId } from '@/common/validation';
import { requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { OrderModel } from '@/modules/orders/order.model';
import { isSchoolCategory } from './audience';
import { CategoryModel } from './category.model';
import { categoryInputSchema, productInputSchema } from './catalog.schema';
import { ProductModel, type Product } from './product.model';

export const adminCatalogRouter = Router();
const idParams = z.object({ id: objectId });

// ── Categories ──────────────────────────────────────────────────────────────

adminCatalogRouter.get('/categories', async (_req, res) => {
  res.json(await CategoryModel.find().sort({ sortOrder: 1 }).lean());
});

/** School categories are institution-only whatever the form says. */
function schoolOnly<T extends { slug: string; audiences?: string[] }>(body: T): T {
  return isSchoolCategory(body.slug) ? { ...body, audiences: ['institution'] } : body;
}

adminCatalogRouter.post('/categories', requirePermission('catalog'), validate({ body: categoryInputSchema }), async (req, res) => {
  const category = await CategoryModel.create(schoolOnly(req.body));
  audit(req, { action: 'category.create', entity: 'Category', entityId: category._id, summary: category.name.en });
  res.status(201).json(category);
});

adminCatalogRouter.put(
  '/categories/:id',
  requirePermission('catalog'),
  validate({ params: idParams, body: categoryInputSchema }),
  async (req, res) => {
    const category = await CategoryModel.findByIdAndUpdate(req.params.id, schoolOnly(req.body), {
      new: true,
      runValidators: true,
    });
    if (!category) throw ApiError.notFound('Category');
    audit(req, { action: 'category.update', entity: 'Category', entityId: category._id, summary: category.name.en });
    res.json(category);
  },
);

adminCatalogRouter.delete('/categories/:id', requirePermission('catalog'), validate({ params: idParams }), async (req, res) => {
  const inUse = await ProductModel.exists({ category: req.params.id });
  if (inUse) throw ApiError.conflict('Move or delete the products in this category first');
  const category = await CategoryModel.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category');
  audit(req, { action: 'category.delete', entity: 'Category', entityId: category._id, summary: category.name.en });
  res.status(204).end();
});

// ── Products ────────────────────────────────────────────────────────────────

const productListQuery = z.object({
  category: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

adminCatalogRouter.get('/products', validate({ query: productListQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof productListQuery>;
  const filter: FilterQuery<Product> = {};
  if (q.category) filter.category = q.category;
  if (q.status) filter.isActive = q.status === 'active';
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ 'name.en': rx }, { 'name.hi': rx }, { slug: rx }];
  }
  const products = await ProductModel.find(filter)
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate('category', 'name slug')
    .lean();
  res.json(products);
});

adminCatalogRouter.get('/products/:id', validate({ params: idParams }), async (req, res) => {
  const product = await ProductModel.findById(req.params.id).lean();
  if (!product) throw ApiError.notFound('Product');
  res.json(product);
});

/** Checks the category exists; school products never get an individual price book. */
async function assertCategory(id: string, body: { pricing: { retail: { enabled: boolean } } }) {
  const category = await CategoryModel.findById(id).select('slug').lean();
  if (!category) throw ApiError.badRequest('Category not found');
  if (isSchoolCategory(category.slug)) body.pricing.retail.enabled = false;
}

adminCatalogRouter.post('/products', requirePermission('catalog'), validate({ body: productInputSchema }), async (req, res) => {
  await assertCategory(req.body.category, req.body);
  const product = await ProductModel.create(req.body);
  audit(req, { action: 'product.create', entity: 'Product', entityId: product._id, summary: product.name.en });
  res.status(201).json(product);
});

adminCatalogRouter.put(
  '/products/:id',
  requirePermission('catalog'),
  validate({ params: idParams, body: productInputSchema }),
  async (req, res) => {
    await assertCategory(req.body.category, req.body);
    const product = await ProductModel.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product');
    const before = product.toObject().pricing;
    product.set(req.body);
    await product.save();

    const priceChanged = JSON.stringify(before) !== JSON.stringify(product.toObject().pricing);
    audit(req, {
      action: priceChanged ? 'product.price' : 'product.update',
      entity: 'Product',
      entityId: product._id,
      summary: product.name.en,
      changes: priceChanged ? { before, after: product.toObject().pricing } : undefined,
    });
    res.json(product);
  },
);

adminCatalogRouter.patch(
  '/products/:id/active',
  requirePermission('catalog'),
  validate({ params: idParams, body: z.object({ isActive: z.boolean() }) }),
  async (req, res) => {
    const product = await ProductModel.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: req.body.isActive } },
      { new: true },
    );
    if (!product) throw ApiError.notFound('Product');
    audit(req, {
      action: 'product.update',
      entity: 'Product',
      entityId: product._id,
      summary: `${product.name.en} ${product.isActive ? 'enabled' : 'disabled'}`,
    });
    res.json(product);
  },
);

adminCatalogRouter.delete('/products/:id', requirePermission('catalog'), validate({ params: idParams }), async (req, res) => {
  const used = await OrderModel.exists({ 'items.product': req.params.id });
  if (used) throw ApiError.conflict('This product has orders. Disable it instead of deleting.');
  const product = await ProductModel.findByIdAndDelete(req.params.id);
  if (!product) throw ApiError.notFound('Product');
  audit(req, { action: 'product.delete', entity: 'Product', entityId: product._id, summary: product.name.en });
  res.status(204).end();
});
