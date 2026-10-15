import { connectDb, disconnectDb } from '@/config/db';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { closeQueue, startWorker } from '@/jobs/queue';
// Registers the bulk job handlers.
import '@/modules/bulk/bulk.service';

/** Standalone job worker (needs REDIS_URL). Run several to spread heavy PDF generation. */
async function main() {
  if (!env.REDIS_URL) {
    logger.fatal('REDIS_URL is not set. Without Redis, jobs run inside the API process; no worker is needed.');
    process.exit(1);
  }
  await connectDb();
  startWorker();

  const shutdown = async () => {
    await closeQueue();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
