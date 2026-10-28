import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { authenticate, getAuth, optionalAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { OrderModel } from '@/modules/orders/order.model';
import { UserModel } from '@/modules/users/user.model';
import { notifyStaff } from '@/modules/push/push.service';
import { ReviewModel } from './review.model';
import { ratingSummary, refreshProductRating } from './review.service';

export const reviewsRouter = Router();

const PUBLIC_FIELDS = 'authorName rating title comment verifiedPurchase reply createdAt updatedAt';

async function findProduct(slug: string) {
  const product = await ProductModel.findOne({ slug, isActive: true }).select('_id').lean();
  if (!product) throw ApiError.notFound('Product');
  return product;
}

/** Approved reviews, the rating summary and (when signed in) the visitor's own review. */
reviewsRouter.get('/products/:slug/reviews', optionalAuth, async (req, res) => {
  const product = await findProduct(String(req.params.slug));
  const [summary, reviews, mine] = await Promise.all([
    ratingSummary(product._id),
    ReviewModel.find({ product: product._id, status: 'approved' }).sort({ createdAt: -1 }).limit(50).select(PUBLIC_FIELDS).lean(),
    req.auth ? ReviewModel.findOne({ product: product._id, 'author.id': req.auth.id }).select(`${PUBLIC_FIELDS} status`).lean() : null,
  ]);
  res.json({ summary, reviews, mine });
});

const reviewInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().default(''),
  comment: z.string().trim().max(2000).optional().default(''),
});

reviewsRouter.post('/products/:slug/reviews', authenticate, validate({ body: reviewInput }), async (req, res) => {
  const auth = getAuth(req);
  if (auth.kind === 'user' && auth.role !== 'customer') throw new ApiError(403, 'Staff accounts cannot write reviews', 'FORBIDDEN');
  const product = await findProduct(String(req.params.slug));

  const author =
    auth.kind === 'user'
      ? await UserModel.findById(auth.id).select('name').lean()
      : await InstitutionModel.findById(auth.id).select('name').lean();
  if (!author) throw ApiError.unauthorized();
  const authorName = author.name || 'Customer';

  const verifiedPurchase = Boolean(
    await OrderModel.exists({
      [auth.kind === 'user' ? 'customer' : 'institution']: auth.id,
      'items.product': product._id,
      status: { $in: ['delivered', 'picked_up'] },
    }),
  );

  const body = req.body as z.infer<typeof reviewInput>;
  const review = await ReviewModel.findOneAndUpdate(
    { product: product._id, 'author.id': auth.id },
    {
      $set: { ...body, authorName, verifiedPurchase, status: 'pending', author: { id: auth.id, kind: auth.kind } },
      $setOnInsert: { product: product._id },
    },
    { upsert: true, new: true, runValidators: true },
  );
  // An edited review is hidden again until re-approved.
  await refreshProductRating(product._id);
  void notifyStaff({
    kind: 'review',
    title: `New review · ${product.name?.en ?? 'Product'}`,
    body: `${'★'.repeat(review.rating)} by ${authorName}. Waiting for approval.`,
    path: '/reviews',
    permission: 'reviews',
  });
  res.status(201).json(review);
});

/** Testimonials for the home page: featured reviews first, then recent 4–5 star ones. */
reviewsRouter.get('/reviews/highlights', async (_req, res) => {
  const reviews = await ReviewModel.find({ status: 'approved', rating: { $gte: 4 }, comment: { $ne: '' } })
    .sort({ featured: -1, createdAt: -1 })
    .limit(9)
    .select(`${PUBLIC_FIELDS} product`)
    .populate('product', 'name slug images icon')
    .lean();
  res.json(reviews.filter((r) => r.product));
});
