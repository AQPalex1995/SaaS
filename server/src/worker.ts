import { startWorker, type JobHandler, type WorkerHandle } from './workers/runner.js';
import { QUEUE_NAMES, type QueueName } from './workers/queue.js';
import type { Job } from 'bullmq';
import { processGeocodingJob, type GeocodingJobData } from './workers/consumers/geocoding.worker.js';
import { processResearchJob, type ResearchJobData } from './workers/consumers/research.worker.js';
import { logger } from './logger.js';

/**
 * Worker process entrypoint.
 *
 * Run in a separate process/container from the API: `npm run worker`
 * (or `npm run dev:worker`). Which queues this process consumes is
 * controlled by WORKER_QUEUES (comma-separated). Default: all queues.
 *
 * Real handlers are wired per queue. Queues without a real consumer yet
 * simply acknowledge and log so they never deadlock silently.
 */

function buildHandler(queue: QueueName): JobHandler {
  switch (queue) {
    case 'geocoding':
      return (job) => processGeocodingJob(job as Job<GeocodingJobData>);
    case 'research':
      return (job) => processResearchJob(job as Job<ResearchJobData>);
    default:
      return async (job) => {
        logger.info(
          { worker: job.queueName, jobId: job.id, jobName: job.name },
          'Received job (no handler registered yet — acknowledged and dropped)'
        );
      };
  }
}

function resolveQueues(): QueueName[] {
  const raw = process.env.WORKER_QUEUES;
  if (!raw || raw.trim() === '') return [...QUEUE_NAMES];
  const selected = raw
    .split(',')
    .map((s) => s.trim().toLowerCase() as QueueName)
    .filter((n) => (QUEUE_NAMES as string[]).includes(n));
  return selected.length > 0 ? selected : [...QUEUE_NAMES];
}

async function main() {
  const queues = resolveQueues();
  logger.info({ queues }, 'Starting worker process');

  const handles: WorkerHandle[] = [];

  for (const q of queues) {
    handles.push(await startWorker(q, buildHandler(q), { concurrency: 5 }));
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Worker shutting down gracefully');
    await Promise.all(handles.map((h) => h.drain())).catch(() => {});
    logger.info('Worker stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker process');
  process.exit(1);
});