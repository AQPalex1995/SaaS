import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { serverConfig } from '../config.js';
import { logger } from '../logger.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Get or create the PostgreSQL connection pool.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: serverConfig.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      logger.error({ err }, 'PostgreSQL pool error');
    });
  }
  return pool;
}

/**
 * Get the Drizzle ORM database instance.
 */
export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Database = ReturnType<typeof getDb>;

/**
 * Test database connectivity and PostGIS availability.
 */
export async function testConnection(): Promise<{
  connected: boolean;
  postgis: boolean;
  version: string;
}> {
  const p = getPool();
  try {
    const versionResult = await p.query('SELECT version()');
    const version = (versionResult.rows[0]?.version as string) ?? 'unknown';

    let postgis = false;
    try {
      const gisResult = await p.query('SELECT PostGIS_version()');
      postgis = !!gisResult.rows[0];
    } catch {
      // PostGIS not available
    }

    return { connected: true, postgis, version };
  } catch (err) {
    logger.error({ err }, 'Database connection test failed');
    return { connected: false, postgis: false, version: 'error' };
  }
}

/**
 * Gracefully close the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
