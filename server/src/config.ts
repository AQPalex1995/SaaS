import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

export type NodeEnv = 'development' | 'test' | 'production';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  appUrl: string;
  apiUrl: string;
  logLevel: string;
  corsOrigins: string[];
  storageProvider: string;
  storageBucket: string;
  storageEndpoint?: string;
  storageRegion?: string;
  storageLocalDir: string;
  nominatimUrl: string;
  osmUserAgent: string;
  remajuHomeUrl: string;
  remajuUserAgent: string;
  scoutDbPath: string;
}

/**
 * Cloud-agnostic configuration.
 *
 * The application MUST NOT know whether PostgreSQL / Redis live on
 * localhost, Docker, Cloud SQL, or any other managed provider. All
 * connectivity happens through DATABASE_URL and REDIS_URL.
 *
 * In development we fall back to convenient local defaults.
 * In test/production a missing variable is an explicit error
 * (no secrets/credentials are baked into the codebase).
 */
const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnv;
const isDevelopment = nodeEnv === 'development';

function env(key: string, devDefault?: string): string {
  const value = process.env[key];
  if (value && value.trim() !== '') return value;
  if (devDefault !== undefined && isDevelopment) return devDefault;
  throw new Error(`Missing required environment variable: ${key}`);
}

function parseOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Locate the Legacy Scout SQLite database. Dev convenience: the sync scripts
 * and the research endpoint run either from `server/` or from the repo root,
 * so accept both common locations. Production requires SCOUT_DB_PATH.
 */
function defaultScoutDbPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'scout.db'),
    path.resolve(process.cwd(), '..', 'data', 'scout.db'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

// Cloud Run injects PORT; local dev uses API_PORT. Keep both supported.
const portRaw = process.env.PORT ?? process.env.API_PORT ?? (isDevelopment ? '3001' : '8080');
// Cloud Run requires binding to 0.0.0.0; local dev binds 127.0.0.1 by default.
const host = process.env.HOST ?? process.env.API_HOST ?? (isDevelopment ? '127.0.0.1' : '0.0.0.0');

export const serverConfig: ServerConfig = {
  nodeEnv,
  port: parseInt(portRaw, 10),
  host,
  databaseUrl: env(
    'DATABASE_URL',
    'postgresql://land_intel:land_intel_dev_2024@localhost:5433/land_intelligence'
  ),
  redisUrl: env('REDIS_URL', 'redis://localhost:6380'),
  appUrl: env('APP_URL', 'http://localhost:8787'),
  apiUrl: env('API_URL', 'http://127.0.0.1:3001'),
  logLevel: env('LOG_LEVEL', 'info'),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  storageProvider: env('STORAGE_PROVIDER', 'local'),
  storageBucket: env('STORAGE_BUCKET', 'land-intel-local'),
  storageEndpoint: process.env.STORAGE_ENDPOINT || undefined,
  storageRegion: process.env.STORAGE_REGION || undefined,
  storageLocalDir: env('STORAGE_LOCAL_DIR', './data/storage'),
  nominatimUrl: env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
  osmUserAgent: env(
    'OSM_USER_AGENT',
    'LandIntelligence/0.1 (land-intel-dev; +http://localhost:3001)'
  ),
  remajuHomeUrl: env('REMAJU_HOME_URL', 'https://remaju.pj.gob.pe/remaju/index.xhtml'),
  remajuUserAgent: env(
    'REMAJU_USER_AGENT',
    'LandIntelligence/0.1 (land-intel-dev; public remate info reader; +http://localhost:3001)'
  ),
  scoutDbPath: env('SCOUT_DB_PATH', defaultScoutDbPath()),
};
