import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getPool, closePool } from './connection.js';
import { ensureExtensions, migrationsFolder } from './init.js';
import { runSeed } from './seed.js';
import { logger } from '../logger.js';
import { isMainRunner } from './run-guard.js';

/**
 * One-command rebuild from an empty PostgreSQL: ensures PostGIS extensions,
 * applies all Drizzle migrations, then runs the development seed.
 *
 * This is the canonical bootstrap for both Docker Compose and any managed
 * PostgreSQL (e.g. future Cloud SQL) — no docker-entrypoint init hooks needed.
 *
 * Usage: npm run db:setup
 *        db:setup.migrate (no seed) equivalent: npm run db:migrate
 */
export async function runSetup() {
  logger.info('Running db:setup (extensions + migrations + seed)...');
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

  await runSeed();
}

if (isMainRunner(import.meta.url)) {
  runSetup().catch((err) => {
    logger.error({ err }, 'db:setup failed');
    process.exit(1);
  });
}