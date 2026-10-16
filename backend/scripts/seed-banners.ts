/**
 * Adds the starter home page banners and offer strip without touching products or
 * categories (unlike the full seed, which re-applies catalogue data). Skips if any banner exists.
 */
import { connectDb, disconnectDb } from '@/config/db';
import { BannerModel } from '@/modules/marketing/banner.model';
import { STARTER_BANNERS } from './starter-banners';

async function run() {
  await connectDb();
  if (await BannerModel.exists({})) {
    console.log('• banners already exist, nothing added');
  } else {
    await BannerModel.insertMany(STARTER_BANNERS);
    console.log(`✔ ${STARTER_BANNERS.length} banners`);
  }
  await disconnectDb();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
