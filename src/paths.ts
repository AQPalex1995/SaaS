import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PROFILE_DIR = path.join(DATA_DIR, 'profile');
export const DB_PATH = path.join(DATA_DIR, 'scout.db');
export const CSV_PATH = path.join(DATA_DIR, 'Arequipa_terrenos.csv');
export const BITACORA_PATH = path.join(DATA_DIR, 'bitacora_busquedas.csv');

export function ensureDataDirs(): void {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}