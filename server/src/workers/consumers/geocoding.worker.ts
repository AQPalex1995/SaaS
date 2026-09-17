import type { Job } from 'bullmq';
import { eq, and, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb, type Database } from '../../db/connection.js';
import {
  properties,
  propertyLocations,
  propertyGeometries,
  researchCases,
  researchTasks,
  auditLogs,
} from '../../db/schema/index.js';
import { osmConnector } from '../../connectors/implementations/osm.js';
import { logger } from '../../logger.js';
import { updateCaseProgress } from '../../domain/research/lifecycle.js';

type DbLike = Pick<Database, 'update' | 'select'>;

export interface GeocodingJobData {
  propertyId: string;
}

type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'requires_manual_action'
  | 'unavailable'
  | 'skipped';

/** Mark the (first pending) geolocation task of a property and refresh progress. */
export async function markGeolocationTask(
  propertyId: string,
  status: TaskStatus,
  error?: string,
  db: DbLike = getDb(),
): Promise<void> {
  const rows = await db
    .select({
      caseId: researchCases.id,
      taskId: researchTasks.id,
      taskStatus: researchTasks.status,
    })
    .from(researchCases)
    .innerJoin(researchTasks, eq(researchTasks.researchCaseId, researchCases.id))
    .where(
      and(
        eq(researchCases.propertyId, propertyId),
        eq(researchTasks.taskType, 'geolocation'),
      ),
    );

  for (const row of rows) {
    if (row.taskStatus !== 'pending' && row.taskStatus !== 'running') continue;
    const completed = status === 'completed';
    await db
      .update(researchTasks)
      .set({
        status,
        error: error && !completed ? error : null,
        requiresManualAction: status === 'requires_manual_action',
        manualActionDescription:
          status === 'requires_manual_action' ? error ?? null : null,
        startedAt: row.taskStatus === 'running' ? undefined : new Date(),
        completedAt: completed || status === 'failed' || status === 'skipped' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(researchTasks.id, row.taskId));
    await updateCaseProgress(db, row.caseId);
  }
}

function buildGeocodingQuery(prop: {
  district: string | null;
  address: string | null;
}): string {
  if (prop.district) {
    return `${prop.district}, Arequipa, Perú`;
  }
  if (prop.address) {
    return `${prop.address}, Arequipa, Perú`;
  }
  return '';
}

export async function processGeocodingJob(job: Job<GeocodingJobData>): Promise<void> {
  const propertyId = job.data?.propertyId;
  if (!propertyId) throw new Error('Job geocoding sin propertyId');

  const db = getDb();
  const propRows = await db
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  const prop = propRows[0];
  if (!prop) {
    logger.warn({ propertyId }, 'Geocoding: propiedad no encontrada, abortando');
    return;
  }

  if (prop.latitude && prop.longitude && prop.locationVerification === 'verified') {
    await markGeolocationTask(propertyId, 'skipped', 'Ya geolocalizada (coordenadas verificadas)');
    return;
  }

  const query = buildGeocodingQuery(prop);
  if (!query) {
    await markGeolocationTask(
      propertyId,
      'requires_manual_action',
      'Sin dirección ni distrito para geolocalizar',
    );
    return;
  }

  const result = await osmConnector.search({ query });
  const item = result.items[0];
  if (!item || item.latitude == null || item.longitude == null) {
    await markGeolocationTask(
      propertyId,
      'failed',
      `Sin resultados en OpenStreetMap para "${query}"`,
    );
    return;
  }

  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  const geom = `SRID=4326;POINT(${lng} ${lat})`;
  const confirmedDistrict = item.district ? normalizeDistrict(item.district) : prop.district;
  const pointGeo = geom;

  await db.transaction(async (tx) => {
    // Lock the property row to serialize concurrent geocoding jobs for the
    // same property. If another job already geolocated it (e.g. a research
    // case and the sync both enqueued), skip the inserts to avoid duplicates.
    const locked = await tx.execute(
      sql`SELECT latitude, longitude, location_verification FROM properties WHERE id = ${propertyId} FOR UPDATE`,
    );
    const lockedRow = locked.rows[0] as
      | { latitude: string | null; longitude: string | null; location_verification: string | null }
      | undefined;
    if (
      lockedRow &&
      lockedRow.latitude != null &&
      lockedRow.longitude != null &&
      lockedRow.location_verification === 'verified'
    ) {
      await markGeolocationTask(
        propertyId,
        'skipped',
        'Ya geolocalizada por otra ejecución',
        tx as unknown as DbLike,
      );
      return;
    }

    await tx
      .update(properties)
      .set({
        latitude: String(lat),
        longitude: String(lng),
        geomPoint: pointGeo,
        district: confirmedDistrict ?? null,
        locationSource: 'openstreetmap',
        locationConfidence: 'medium',
        locationVerification: 'verified',
        updatedAt: new Date(),
      })
      .where(eq(properties.id, propertyId));

    await tx.insert(propertyLocations).values({
      propertyId,
      address: prop.address ?? null,
      district: confirmedDistrict ?? null,
      province: 'Arequipa',
      department: 'Arequipa',
      latitude: String(lat),
      longitude: String(lng),
      source: 'openstreetmap',
      sourceUrl: item.sourceUrl ?? null,
      confidence: 'medium',
      verification: 'verified',
      retrievedAt: new Date(),
      metadata: { displayName: item.title ?? null, query },
    });

    await tx.insert(propertyGeometries).values({
      propertyId,
      geomPoint: pointGeo,
      geomType: 'point',
      source: 'openstreetmap',
      sourceUrl: item.sourceUrl ?? null,
      confidence: 'medium',
      verification: 'verified',
      retrievedAt: new Date(),
    });

    await tx.insert(auditLogs).values({
      action: 'task_completed',
      entityType: 'research_task',
      propertyId,
      sourceId: 'openstreetmap',
      newData: { lat, lng, district: confirmedDistrict },
      description: `Geolocalización completada vía OpenStreetMap (${query})`,
    });

    await markGeolocationTask(
      propertyId,
      'completed',
      undefined,
      tx as unknown as DbLike,
    );
  });

  logger.info({ propertyId, lat, lng, district: confirmedDistrict }, 'Propiedad geolocalizada vía OpenStreetMap');
}

/** Normalize OSM district names to the Scout district list where possible. */
function normalizeDistrict(d: string): string {
  const known = [
    'alto selva alegre',
    'cayma',
    'cerro colorado',
    'characato',
    'chiguata',
    'jacobo hunter',
    'josé luis bustamante y rivero',
    'jose luis bustamante y rivero',
    'bustamante y rivero',
    'la joya',
    'mariano melgar',
    'miraflores',
    'mollebaya',
    'paucarpata',
    'sabandía',
    'sachaca',
    'socabaya',
    'tiabaya',
    'uchumayo',
    'yanahuara',
    'yura',
    'camana',
    'camaná',
  ];
  const normalized = normalizeText(d);
  for (const k of known) {
    if (normalized.includes(normalizeText(k))) return titleCase(k);
  }
  return d.trim();
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ');
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}