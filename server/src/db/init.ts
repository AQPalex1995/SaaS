import { fileURLToPath } from 'node:url';
import { getPool } from './connection.js';
import { logger } from '../logger.js';

/**
 * Idempotent PostGIS bootstrap.
 *
 * In Docker Compose the extension is created by `init.sql` (docker-entrypoint
 * initdb). In managed environments (future Cloud SQL) that hook does NOT run,
 * so migrations must guarantee the extensions themselves. This function is a
 * no-op when the extensions already exist.
 */
export async function ensureExtensions(): Promise<void> {
  const pool = getPool();
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  logger.info('Database extensions ensured (postgis, uuid-ossp)');
}

/**
 * Resolve the Drizzle migrations folder relative to this package, so the
 * migrator works regardless of the current working directory (local CLI,
 * Docker image, CI, etc.).
 */
export function migrationsFolder(): string {
  // server/src/db/init.ts -> server/drizzle
  return fileURLToPath(new URL('../../drizzle', import.meta.url));
}