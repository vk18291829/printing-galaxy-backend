import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

/**
 * Background jobs. With REDIS_URL set they go through BullMQ (retries, survives restarts, can run
 * in a separate `worker` process). Without Redis they run one at a time inside the API process,
 * which is enough for a single shop and keeps development dependency-free.
 */
export type JobName = 'bulk.validate' | 'bulk.generate';
export interface JobData {
  bulkJobId: string;
}
type Handler = (data: JobData) => Promise<void>;

const QUEUE_NAME = 'printing-galaxy';
const handlers = new Map<JobName, Handler>();

export function registerHandler(name: JobName, handler: Handler) {
  handlers.set(name, handler);
}

function redisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

let queue: Queue<JobData, void, JobName> | null = null;
function bullQueue() {
  queue ??= new Queue<JobData, void, JobName>(QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });
  return queue;
}

// ── In-process fallback ──────────────────────────────────────────────────────
const pending: { name: JobName; data: JobData }[] = [];
let draining = false;

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.length) {
      const job = pending.shift()!;
      const handler = handlers.get(job.name);
      if (!handler) {
        logger.error({ job: job.name }, 'No handler registered for job');
        continue;
      }
      try {
        await handler(job.data);
      } catch (err) {
        // Handlers record failures on their own documents; this only stops a crash.
        logger.error({ err, job: job.name }, 'Background job failed');
      }
    }
  } finally {
    draining = false;
  }
}

export const queueMode = () => (env.REDIS_URL ? 'redis' : 'in-process');

export async function enqueue(name: JobName, data: JobData) {
  if (env.REDIS_URL) {
    await bullQueue().add(name, data);
    return;
  }
  pending.push({ name, data });
  setImmediate(() => void drain());
}

let worker: Worker<JobData, void, JobName> | null = null;

/** Starts consuming jobs. In-process mode needs nothing beyond registered handlers. */
export function startWorker() {
  if (!env.REDIS_URL || worker) return;
  worker = new Worker<JobData, void, JobName>(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler for ${job.name}`);
      await handler(job.data);
    },
    { connection: redisConnection(), concurrency: 2 },
  );
  worker.on('failed', (job, err) => logger.error({ err, job: job?.name, id: job?.id }, 'Job failed'));
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));
  logger.info('Background worker connected to Redis');
}

export async function closeQueue() {
  await Promise.allSettled([worker?.close(), queue?.close()]);
}

/** For tests: resolves once the in-process queue is empty. */
export async function idle() {
  while (pending.length || draining) await new Promise((r) => setTimeout(r, 10));
}
