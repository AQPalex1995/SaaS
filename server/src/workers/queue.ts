import { Queue, type QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import { serverConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * Land Intelligence — Queue Infrastructure
 *
 * Six named queues are prepared for future worker implementations.
 * Workers are NOT activated in this phase — only the queue definitions.
 */

let redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(serverConfig.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      // Bound every command so a dead-but-stale 'ready' socket can't hang
      // callers (the per-call withRedisTimeout() guard is the outer safety net).
      commandTimeout: 5_000,
      // Never give up: back off and keep trying so the connection
      // self-heals when Redis comes back (e.g. Docker restart).
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    redisConnection.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis connection error (queues may be unavailable)');
    });
  }
  return redisConnection;
}

const REDIS_OP_TIMEOUT_MS = 1_500;
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * Run a Redis operation guarded by a hard timeout.
 * A dead-but-stale connection (status 'ready' while the socket is gone)
 * can otherwise leave commands buffered forever, hanging callers like /health.
 */
export async function withRedisTimeout<T>(op: Promise<T>, ms = REDIS_OP_TIMEOUT_MS): Promise<T | null> {
  return await Promise.race([op, timeout(ms)]);
}

const queueOptions: QueueOptions = {
  connection: { lazyConnect: true } as any,
};

export type QueueName =
  | 'scraping'
  | 'research'
  | 'geocoding'
  | 'gis'
  | 'market'
  | 'notifications';

const QUEUE_NAMES: QueueName[] = [
  'scraping',
  'research',
  'geocoding',
  'gis',
  'market',
  'notifications',
];

export { QUEUE_NAMES };

const queues = new Map<QueueName, Queue>();

/**
 * Get or create a BullMQ queue by name.
 * Returns null if Redis is not available (graceful degradation).
 */
export function getQueue(name: QueueName): Queue | null {
  if (queues.has(name)) return queues.get(name)!;

  try {
    const conn = getRedisConnection();
    const queue = new Queue(name, { connection: conn });
    queues.set(name, queue);
    return queue;
  } catch (err) {
    logger.warn({ queueName: name, err }, 'Failed to create queue');
    return null;
  }
}

/**
 * Test Redis connectivity.
 */
export async function testRedis(): Promise<boolean> {
  try {
    const conn = getRedisConnection();
    if (conn.status === 'wait') {
      await withRedisTimeout(conn.connect().catch(() => {}));
    }
    if (conn.status !== 'ready' && conn.status !== 'connecting') return false;
    const pong = await withRedisTimeout(conn.ping().catch(() => null));
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Close all queue connections.
 */
export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close().catch(() => {});
  }
  queues.clear();
  if (redisConnection) {
    await redisConnection.quit().catch(() => {});
    redisConnection = null;
  }
}
