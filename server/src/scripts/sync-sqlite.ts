import { syncSqliteToPostgres } from '../domain/ingestion/sync.js';
import { closePool } from '../db/connection.js';
import { serverConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * One-shot CLI: sync Legacy Scout SQLite listings into PostgreSQL.
 *
 * Usage: npm run sync:sqlite        (uses SCOUT_DB_PATH or auto-detected path)
 *        npm run sync:sqlite -- path/to/scout.db
 */
async function main() {
  const dbPath = process.argv[2] || serverConfig.scoutDbPath;
  logger.info({ dbPath }, 'sync:sqlite iniciado');
  const summary = await syncSqliteToPostgres({ dbPath });
  logger.info(summary, 'sync:sqlite finalizado');
  await closePool();
}

main().catch((err) => {
  logger.error({ err }, 'sync:sqlite falló');
  process.exit(1);
});