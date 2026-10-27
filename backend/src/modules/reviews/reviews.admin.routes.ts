import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { escapeRegex, objectId, paginate } from '@/common/validation';
import { requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { REVIEW_STATUSES, ReviewModel, type Review } from './review.model';
import { refreshProductRating } from './review.service';

export const adminReviewsRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(REVIEW_STATUSES).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  product: objectId.optional(),
  q: z.string().trim().max(100).optional(),
});

adminReviewsRouter.get('/', validate({ query: listQuery }), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof listQuery>;
  const filter: FilterQuery<Review> = {};
  if (q.status) filter.status = q.status;
  if (q.rating) filter.rating = q.rating;
  if (q.product) filter.product = q.product;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const products = await ProductModel.find({ $or: [{ 'name.en': rx }, { 'name.hi': rx }] }).select('_id').lean();
    filter.$or = [{ authorName: rx }, { title: rx }, { comment: rx }, { product: { $in: products.map((p) => p._id) } }];
  }

  const { skip, limit } = paginate(q.page, q.limit);
  const [items, total, statusRows, ratingRows] = await Promise.all([
    ReviewModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('product', 'name slug images icon').lean(),
    ReviewModel.countDocuments(filter),
    ReviewModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ReviewModel.aggregate<{ _id: null; avg: number; n: number }>([
      { $match: { status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]),
  ]);

  const counts = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, statusRows.find((r) => r._id === s)?.n ?? 0]));
  res.json({
    items,
    total,
    page: q.page,
    pages: Math.ceil(total / limit),
    stats: { ...counts, averageRating: Math.round((ratingRows[0]?.avg ?? 0) * 10) / 10 },
  });
});

const updateSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  featured: z.boolean().optional(),
  /** Empty string removes the reply. */
  reply: z.string().trim().max(1000).optional(),
});

adminReviewsRouter.patch('/:id', validate({ params: z.object({ id: objectId }), body: updateSchema }), async (req, res) => {
  const body = req.body as z.infer<typeof updateSchema>;
  const review = await ReviewModel.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review');

  if (body.status) review.status = body.status;
  if (body.featured !== undefined) review.featured = body.featured;
  if (body.reply !== undefined) review.reply = body.reply ? { text: body.reply, at: new Date() } : undefined;
  await review.save();
  await refreshProductRating(review.product);

  audit(req, { action: 'review.update', entity: 'Review', entityId: review._id, changes: body });
  res.json(review);
});

adminReviewsRouter.delete('/:id', requirePermission('reviews'), validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  const review = await ReviewModel.findByIdAndDelete(req.params.id);
  if (!review) throw ApiError.notFound('Review');
  await refreshProductRating(review.product);
  audit(req, { action: 'review.delete', entity: 'Review', entityId: review._id, summary: `${review.rating}★ by ${review.authorName}` });
  res.status(204).end();
});
