/**
 * One-off: keeps school products and everyday products apart. School Works becomes
 * institutions-only (and its products stop taking individual orders); every other category
 * becomes individuals-only. Safe to run more than once.
 *
 *   npm run split-audiences -w backend
 */
import { connectDb, disconnectDb } from '@/config/db';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';

const INSTITUTION_CATEGORIES = ['school-works'];

async function run() {
  await connectDb();
  const school = await CategoryModel.updateMany({ slug: { $in: INSTITUTION_CATEGORIES } }, { $set: { audiences: ['institution'] } });
  const rest = await CategoryModel.updateMany({ slug: { $nin: INSTITUTION_CATEGORIES } }, { $set: { audiences: ['retail'] } });
  const schoolIds = await CategoryModel.find({ slug: { $in: INSTITUTION_CATEGORIES } }).distinct('_id');
  const products = await ProductModel.updateMany({ category: { $in: schoolIds } }, { $set: { 'pricing.retail.enabled': false } });
  console.log(`✔ ${school.modifiedCount} institution categories, ${rest.modifiedCount} individual categories, ${products.modifiedCount} school products closed to individuals`);
  await disconnectDb();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
