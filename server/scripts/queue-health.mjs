#!/usr/bin/env node
// Healthcheck for the worker process: verifies Redis is actually reachable.
// Exit 0 = healthy, 1 = unhealthy (Docker restart policy reacts to that).
import IORedis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://localhost:6379';
const conn = new IORedis(url, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  retryStrategy: () => null,
});
conn.on('error', () => {});

try {
  await conn.connect();
  const pong = await conn.ping();
  await conn.quit().catch(() => {});
  process.exit(pong === 'PONG' ? 0 : 1);
} catch {
  process.exit(1);
}