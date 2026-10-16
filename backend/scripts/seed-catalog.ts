/**
 * Adds the newer categories and products without touching anything that already exists, so
 * prices and photos edited in the admin panel are kept. Also moves the wedding card into the
 * new Wedding & Invitations category if it is still under Business Works.
 *
 *   npm run seed:catalog -w backend
 */
import { connectDb, disconnectDb } from '@/config/db';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { EXTRA_CATEGORIES, EXTRA_PRODUCTS } from './extra-catalog';

async function run() {
  await connectDb();

  const ids = new Map<string, unknown>();
  let newCategories = 0;
  for (const c of EXTRA_CATEGORIES) {
    const res = await CategoryModel.updateOne({ slug: c.slug }, { $setOnInsert: c }, { upsert: true });
    newCategories += res.upsertedCount;
    ids.set(c.slug, (await CategoryModel.findOne({ slug: c.slug }).select('_id').lean())!._id);
  }

  let newProducts = 0;
  for (const { category, ...p } of EXTRA_PRODUCTS) {
    const res = await ProductModel.updateOne(
      { slug: p.slug },
      { $setOnInsert: { ...p, category: ids.get(category) } },
      { upsert: true, runValidators: true },
    );
    newProducts += res.upsertedCount;
  }

  const business = await CategoryModel.findOne({ slug: 'business-works' }).select('_id').lean();
  const moved = business
    ? await ProductModel.updateOne(
        { slug: 'wedding-card', category: business._id },
        { $set: { category: ids.get('wedding-invitations'), isFeatured: true, sortOrder: 0 }, $addToSet: { tags: { $each: ['wedding', 'highlight'] } } },
      )
    : null;

  console.log(`✔ ${newCategories} new categories, ${newProducts} new products${moved?.modifiedCount ? ', wedding card moved' : ''}`);
  console.log('  Run `npm run sample-images -w backend` to give the new items sample pictures.');
  await disconnectDb();
}

run().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
