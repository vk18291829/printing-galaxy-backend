import { Types } from 'mongoose';
import { ProductModel } from '@/modules/catalog/product.model';
import { ReviewModel } from './review.model';

export interface RatingSummary {
  average: number;
  count: number;
  /** Approved reviews per star, index 0 = 1 star. */
  breakdown: [number, number, number, number, number];
}

export async function ratingSummary(productId: unknown): Promise<RatingSummary> {
  const rows = await ReviewModel.aggregate<{ _id: number; n: number }>([
    { $match: { product: new Types.ObjectId(String(productId)), status: 'approved' } },
    { $group: { _id: '$rating', n: { $sum: 1 } } },
  ]);
  const breakdown: RatingSummary['breakdown'] = [0, 0, 0, 0, 0];
  for (const r of rows) breakdown[r._id - 1] = r.n;
  const count = breakdown.reduce((a, b) => a + b, 0);
  const sum = breakdown.reduce((a, n, i) => a + n * (i + 1), 0);
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, breakdown };
}

/** Keeps the denormalised rating on the product in step with approved reviews. */
export async function refreshProductRating(productId: unknown) {
  const { average, count } = await ratingSummary(productId);
  await ProductModel.updateOne({ _id: productId }, { $set: { rating: { average, count } } });
}
