import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getPool, closePool } from './connection.js';
import { ensureExtensions, migrationsFolder } from './init.js';
import { logger } from '../logger.js';
import { isMainRunner } from './run-guard.js';

/**
 * Run all pending Drizzle migrations after ensuring PostGIS extensions exist.
 * Usage: tsx server/src/db/migrate.ts  (or node dist/db/migrate.js)
 */
export async function runMigrations() {
  logger.info('Running database migrations...');
  await ensureExtensions();
  const db = getDb();
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
    logger.info('Migrations completed successfully.');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    throw err;
  } finally {
    await closePool();
  }
}

if (isMainRunner(import.meta.url)) {
  runMigrations().catch((err) => {
    logger.error({ err }, 'Migration run failed');
    process.exit(1);
  });
}