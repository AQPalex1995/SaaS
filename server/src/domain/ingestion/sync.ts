import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { sql, and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, type Database } from '../../db/connection.js';
import {
  properties,
  propertyListings,
  auditLogs,
} from '../../db/schema/index.js';
import { serverConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { enqueueGeocoding } from '../../workers/jobs.js';

// ── Type: raw row stored inside the SQLite data JSON column ────

export interface ScoutListingRow {
  id_publicacion?: string;
  fecha_busqueda?: string;
  hora_busqueda?: string;
  fecha_publicacion?: string;
  tipo?: string;
  titulo?: string;
  descripcion?: string;
  m2?: string;
  distrito?: string;
  distrito_origen?: string;
  precio?: string;
  moneda?: string;
  precio_real_afiche?: string;
  telefono?: string;
  imagen_url?: string;
  url_publicacion?: string;
  url?: string;
  fuente?: string;
  favorito?: string;
  notas?: string;
  [key: string]: unknown;
}

// ── Allowed enum values from the schema ────────────────────────

const VALID_PROPERTY_TYPES = new Set([
  'terreno', 'lote', 'casa', 'departamento', 'duplex',
  'agricola', 'comercial', 'industrial', 'otro',
]);

// ── Sanitize an object so its JSON serialization never contains
// unpaired surrogates (which PostgreSQL rejects as invalid JSON). ──

// eslint-disable-next-line no-control-regex
const SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sanitizeForJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, val) =>
    typeof val === 'string' ? val.replace(SURROGATE_RE, '') : val,
  ));
}

// ── Pure helpers (exported for tests) ──────────────────────────

export function contentHash(row: ScoutListingRow): string {
  const title = (row.titulo ?? '').trim().toLowerCase();
  const price = (row.precio ?? '').replace(/[^\d]/g, '');
  const desc = (row.descripcion ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${title}|${price}|${desc}`).digest('hex');
}

export type SourceType = 'facebook_marketplace' | 'facebook_group' | 'adondevivir' | 'urbania';

export function mapSourceType(row: ScoutListingRow): SourceType {
  const fuente = (row.fuente ?? '').toLowerCase();
  const id = row.id_publicacion ?? '';
  if (fuente.includes('adondevivir') || id.startsWith('av-')) return 'adondevivir';
  if (fuente.includes('urbania') || id.startsWith('urb-')) return 'urbania';
  if (fuente.includes('grupo') || id.includes('_')) return 'facebook_group';
  return 'facebook_marketplace';
}

export type PropertyType =
  | 'terreno' | 'lote' | 'casa' | 'departamento' | 'duplex'
  | 'agricola' | 'comercial' | 'industrial' | 'otro';

export function mapPropertyType(tipo?: string): PropertyType {
  const t = (tipo ?? '').trim().toLowerCase();
  if (VALID_PROPERTY_TYPES.has(t)) return t as PropertyType;
  return 'otro';
}

export function mapCurrency(moneda?: string): 'PEN' | 'USD' | 'unknown' {
  const m = (moneda ?? '').trim().toUpperCase();
  if (m === 'PEN' || m === 'USD') return m;
  return 'unknown';
}

export function parseScrapedAt(row: ScoutListingRow): Date {
  const raw = `${row.fecha_busqueda ?? ''} ${row.hora_busqueda ?? ''}`.trim();
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ── SQLite reader (dynamic import for Node 22 compat in Docker) ──

export interface SqliteReader {
  all(): ScoutListingRow[];
  find(externalId: string): ScoutListingRow | null;
  close(): void;
}

export async function openScoutDb(dbPath: string): Promise<SqliteReader> {
  if (!existsSync(dbPath)) {
    throw new Error(`Base SQLite no encontrada: ${dbPath}`);
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const stmt = db.prepare('SELECT id, data, seen_at FROM listings');

  const all = (): ScoutListingRow[] => {
    const rows = stmt.all() as Array<{ id: string; data: string; seen_at: string }>;
    return rows
      .map((r) => {
        try {
          return { ...(JSON.parse(r.data) as ScoutListingRow) };
        } catch {
          return null;
        }
      })
      .filter((r): r is ScoutListingRow => r !== null && !!r.id_publicacion);
  };

  const cache = new Map<string, ScoutListingRow>();
  const reader: SqliteReader = {
    all() {
      if (cache.size === 0) {
        for (const row of all()) cache.set(row.id_publicacion!, row);
      }
      return [...cache.values()];
    },
    find(externalId: string) {
      if (cache.size === 0) reader.all();
      return cache.get(externalId) ?? null;
    },
    close() {
      db.close();
    },
  };
  return reader;
}

// ── Sync one row ──────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function listingInsert(row: ScoutListingRow) {
  return {
    sourceType: mapSourceType(row),
    externalId: row.id_publicacion ?? null,
    sourceUrl: row.url_publicacion || row.url || null,
    title: row.titulo || null,
    description: row.descripcion || null,
    price: row.precio || null,
    currency: mapCurrency(row.moneda),
    areaM2: row.m2 || null,
    address: null,
    district: row.distrito || null,
    latitude: null,
    longitude: null,
    phone: row.telefono || null,
    imageUrl: row.imagen_url || null,
    publishedAt: null,
    scrapedAt: parseScrapedAt(row),
    status: 'active' as const,
  };
}

function propertyInsert(row: ScoutListingRow) {
  return {
    publicId: `LI-${nanoid(8)}`,
    title: row.titulo || null,
    description: row.descripcion || null,
    propertyType: mapPropertyType(row.tipo),
    status: 'active' as const,
    price: row.precio || null,
    currency: mapCurrency(row.moneda),
    priceSource: 'scout-legacy',
    priceConfidence: 'low' as const,
    priceVerification: 'reported' as const,
    areaM2: row.m2 || null,
    areaSource: 'scout-legacy',
    areaConfidence: 'low' as const,
    areaVerification: 'reported' as const,
    district: row.distrito || null,
    province: 'Arequipa',
    department: 'Arequipa',
    locationSource: row.distrito ? 'scout-legacy' : null,
    locationConfidence: 'low' as const,
    locationVerification: 'reported' as const,
    latitude: null,
    longitude: null,
    metadata: { source: 'scout-legacy', scoutId: row.id_publicacion ?? null },
  };
}

export interface SyncSummary {
  scanned: number;
  updated: number;
  createdProperties: number;
  linkedProperties: number;
  createdListings: number;
  errors: number;
}

async function syncOneRow(
  db: Database,
  row: ScoutListingRow,
  summary: SyncSummary,
): Promise<void> {
  const externalId = row.id_publicacion;
  if (!externalId) { summary.errors++; return; }
  const sourceType = mapSourceType(row);
  const hash = contentHash(row);

  // ── 1. Check if listing already exists (source_type + external_id) ──
  const existingRows = await db
    .select({ id: propertyListings.id })
    .from(propertyListings)
    .where(
      and(
        eq(propertyListings.sourceType, sourceType),
        eq(propertyListings.externalId, externalId),
      ),
    )
    .limit(1);

  if (existingRows.length > 0) {
    // Update existing listing with latest scrape data
    const existingId = existingRows[0].id;
    await db
      .update(propertyListings)
      .set({ ...listingInsert(row), contentHash: hash, rawData: sanitizeForJson(row) })
      .where(eq(propertyListings.id, existingId));
    summary.updated++;
    return;
  }

  // ── 2. Find existing unified property by content_hash ──
  const dupRows = await db
    .select({ propertyId: propertyListings.propertyId })
    .from(propertyListings)
    .where(eq(propertyListings.contentHash, hash))
    .limit(1);

  let propertyId = dupRows[0]?.propertyId ?? null;
  let isNewProperty = false;

  if (!propertyId) {
    // Create new property
    const [prop] = await db
      .insert(properties)
      .values(propertyInsert(row))
      .returning({ id: properties.id });
    propertyId = prop.id;
    isNewProperty = true;
    summary.createdProperties++;

    await db.insert(auditLogs).values({
      action: 'property_created',
      entityType: 'property',
      entityId: propertyId,
      sourceId: 'sync-sqlite',
      newData: sanitizeForJson({ title: row.titulo, district: row.distrito }),
      description: `Propiedad creada desde Scout SQLite (${externalId})`,
    });
  } else {
    summary.linkedProperties++;
  }

  // ── 3. Insert listing linked to property ──
  const [listingIns] = await db
    .insert(propertyListings)
    .values({
      ...listingInsert(row),
      propertyId,
      contentHash: hash,
      rawData: sanitizeForJson(row),
    })
    .returning({ id: propertyListings.id });

  summary.createdListings++;

  // ── 4. Update listing count / primary ──
  if (isNewProperty) {
    await db
      .update(properties)
      .set({ listingCount: 1, primaryListingId: listingIns.id })
      .where(eq(properties.id, propertyId));
  } else {
    await db
      .update(properties)
      .set({
        listingCount: sql`COALESCE(${properties.listingCount}, 0) + 1`,
      })
      .where(eq(properties.id, propertyId));
  }

  // ── 5. Audit listing_created ──
  await db.insert(auditLogs).values({
    action: 'listing_created',
    entityType: 'property_listing',
    entityId: listingIns.id,
    propertyId,
    sourceId: 'sync-sqlite',
    newData: sanitizeForJson({ externalId, sourceType }),
    description: `Listing ${externalId} sincronizado desde Scout`,
  });

  // ── 6. Enqueue geocoding only for genuinely unlocated properties ──
  // (district present AND no verified coordinates). Without this guard a
  // re-run of sync:sqlite would re-enqueue ~4k geocoding jobs against the
  // public Nominatim API even for already-located properties.
  if (row.distrito) {
    const located = await db
      .select({
        latitude: properties.latitude,
        longitude: properties.longitude,
        locationVerification: properties.locationVerification,
      })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    const alreadyLocated =
      !!located[0]?.latitude &&
      !!located[0]?.longitude &&
      located[0].locationVerification === 'verified';
    if (!alreadyLocated) {
      await enqueueGeocoding(propertyId).catch((err) =>
        logger.warn({ err, propertyId }, 'No se pudo encolar geocodificación'),
      );
    }
  }
}

// ── Public: sync entire SQLite DB ──────────────────────────────

export async function syncSqliteToPostgres(
  options: { dbPath?: string } = {},
): Promise<SyncSummary> {
  const dbPath = options.dbPath ?? serverConfig.scoutDbPath;
  const reader = await openScoutDb(dbPath);
  const rows = reader.all();
  reader.close();

  logger.info({ dbPath, scanned: rows.length }, 'Sync SQLite → PostgreSQL iniciado');
  const db = getDb();
  const summary: SyncSummary = {
    scanned: rows.length,
    updated: 0,
    createdProperties: 0,
    linkedProperties: 0,
    createdListings: 0,
    errors: 0,
  };

  for (const row of rows) {
    try {
      await syncOneRow(db, row, summary);
    } catch (err) {
      summary.errors++;
      logger.error({ err, externalId: row.id_publicacion }, 'Error sincronizando fila');
    }
  }

  logger.info(summary, 'Sync SQLite → PostgreSQL completado');
  return summary;
}

// ── Resolve a SQLite listing external_id to a PostgreSQL property UUID ──

export async function resolveSqliteListing(
  externalId: string,
): Promise<string | null> {
  try {
    const dbPath = serverConfig.scoutDbPath;
    if (!existsSync(dbPath)) return null;
    const reader = await openScoutDb(dbPath);
    const row = reader.find(externalId);
    reader.close();
    if (!row) return null;

    const db = getDb();
    const sourceType = mapSourceType(row);

    // Check if listing already synced
    const existing = await db
      .select({ propertyId: propertyListings.propertyId })
      .from(propertyListings)
      .where(
        and(
          eq(propertyListings.sourceType, sourceType),
          eq(propertyListings.externalId, externalId),
        ),
      )
      .limit(1);

    if (existing[0]?.propertyId) return existing[0].propertyId;

    // Sync on-the-fly and return property id
    const summary: SyncSummary = {
      scanned: 0, updated: 0, createdProperties: 0,
      linkedProperties: 0, createdListings: 0, errors: 0,
    };
    await syncOneRow(db, row, summary);

    const after = await db
      .select({ propertyId: propertyListings.propertyId })
      .from(propertyListings)
      .where(
        and(
          eq(propertyListings.sourceType, sourceType),
          eq(propertyListings.externalId, externalId),
        ),
      )
      .limit(1);

    return after[0]?.propertyId ?? null;
  } catch (err) {
    logger.warn({ err, externalId }, 'Error resolving SQLite listing');
    return null;
  }
}

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
