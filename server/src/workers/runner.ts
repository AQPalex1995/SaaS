import { Worker, type Job, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import { serverConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * BullMQ Worker infrastructure.
 *
 * Queues live in `queue.ts` (server process); CONSUMERS live here so the API
 * and the async processing can run as separate processes/containers
 * (mandatory before scaling on a cloud platform).
 *
 * A worker gets its own Redis connection with a continuous retry strategy —
 * unlike `queue.ts`, which intentionally stops retrying after one attempt so
 * the API degrades gracefully when Redis is offline.
 */

export type JobHandler = (job: Job) => Promise<void>;

const WORKER_READY_TIMEOUT_MS = 15_000;

export interface WorkerHandle {
  name: string;
  /** Stops polling and closes the Redis connection. Resolves once fully stopped. */
  stop: () => Promise<void>;
  /** Graceful drain: waits for in-flight jobs, then closes connections. */
  drain: () => Promise<void>;
}

function createWorkerConnection(): IORedis {
  const connection = new IORedis(serverConfig.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    // NOTE: no commandTimeout here on purpose. BullMQ's queue polling uses
    // BLOCKING commands (BLMOVE/BRPOPLPUSH) that legitimately block for tens
    // of seconds; a short commandTimeout would trip on every poll. Resilience
    // to Redis outages is handled by the continuous retryStrategy plus the
    // bounded waitUntilReady() at startup in startWorker().
    // Workers must keep retrying while Redis recovers (e.g. container restart).
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  connection.on('error', (err) => {
    logger.warn({ err: err.message }, 'Worker Redis connection error');
  });
  return connection;
}

/**
 * Start a BullMQ Worker for the given queue. The connection is exclusive to
 * this worker and is closed on `stop()`.
 */
export async function startWorker(
  name: string,
  handler: JobHandler,
  options: { concurrency?: number } = {}
): Promise<WorkerHandle> {
  const connection = createWorkerConnection();
  const concurrency = options.concurrency ?? 5;

  // Processor wrapper: logs failures, keeps job metadata clean.
  const processor: Processor = async (job) => {
    try {
      await handler(job);
    } catch (err) {
      logger.error({ worker: name, jobId: job.id, jobName: job.name, err }, 'Worker job failed');
      throw err;
    }
  };

  const worker = new Worker(name, processor, { connection, concurrency });
  worker.on('failed', (job, err) => {
    logger.error({ worker: name, jobId: job?.id, err: err.message }, 'Job failed');
  });

  // Do NOT block startup on Redis being up. If Redis was offline at boot,
  // waitUntilReady() would hang (or the stale-socket ping would time out) and
  // no worker would ever start. With a bound timeout the worker continues and
  // auto-connects when Redis returns.
  try {
    await Promise.race([
      worker.waitUntilReady(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), WORKER_READY_TIMEOUT_MS)),
    ]);
  } catch {
    /* ignore — the connection keeps retrying on its own */
  }
  logger.info({ worker: name, concurrency, redisReady: connection.status === 'ready' }, 'Worker started');

  return {
    name,
    stop: async () => {
      await worker.close();
      await connection.quit().catch(() => {});
    },
    drain: async () => {
      // With force=false, close() waits for active jobs to finish (graceful).
      await worker.close(false);
      await connection.quit().catch(() => {});
    },
  };
}