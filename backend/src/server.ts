import { createApp } from '@/app';
import { connectDb, disconnectDb } from '@/config/db';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { scheduleFileRetention } from '@/jobs/file-retention';
import { closeQueue, startWorker } from '@/jobs/queue';
import { resumeBulkJobs } from '@/modules/bulk/bulk.service';
import { ensureDevBuckets } from '@/modules/uploads/storage';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 API ready on http://localhost:${env.PORT}/api/v1`);
  });
  scheduleFileRetention();
  void ensureDevBuckets();

  // With Redis, jobs can also run in a separate `npm run worker` process; RUN_WORKER=false opts out here.
  if (process.env.RUN_WORKER !== 'false') startWorker();
  if (!env.REDIS_URL) void resumeBulkJobs().catch((err) => logger.error({ err }, 'Could not resume bulk jobs'));

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeQueue();
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
