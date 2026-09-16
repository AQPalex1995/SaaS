import { getDb, closePool } from './connection.js';
import { properties, propertySources, users } from './schema/index.js';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import { isMainRunner } from './run-guard.js';

/**
 * Seed the database with minimal development data.
 * Uses NO real sensitive data — only fictional examples.
 *
 * Usage: tsx server/src/db/seed.ts
 */
export async function runSeed() {
  logger.info('Seeding database...');
  const db = getDb();

  try {
    // ── Default user (system) ───────────────────────
    await db
      .insert(users)
      .values({
        username: 'system',
        displayName: 'Sistema',
        role: 'admin',
      })
      .onConflictDoNothing();

    // ── Register known data sources ─────────────────
    const sources = [
      { sourceType: 'facebook_marketplace' as const, name: 'Facebook Marketplace', isEnabled: true },
      { sourceType: 'facebook_group' as const, name: 'Facebook Grupos', isEnabled: true },
      { sourceType: 'adondevivir' as const, name: 'AdondeVivir', isEnabled: true },
      { sourceType: 'urbania' as const, name: 'Urbania', isEnabled: true },
      { sourceType: 'sunarp' as const, name: 'SUNARP Conoce Aquí', isEnabled: false, requiresAuth: true },
      { sourceType: 'sunarp_bgr' as const, name: 'SUNARP Base Gráfica Registral', isEnabled: false },
      { sourceType: 'sunarp_sprl' as const, name: 'SUNARP SPRL', isEnabled: false, requiresAuth: true },
      { sourceType: 'remaju' as const, name: 'REM@JU', isEnabled: false },
      { sourceType: 'google_maps' as const, name: 'Google Maps', isEnabled: false },
      { sourceType: 'openstreetmap' as const, name: 'OpenStreetMap', isEnabled: false },
      { sourceType: 'impla' as const, name: 'IMPLA Arequipa', isEnabled: false },
      { sourceType: 'pdm' as const, name: 'Plan de Desarrollo Metropolitano', isEnabled: false },
      { sourceType: 'municipality' as const, name: 'Municipalidades', isEnabled: false },
      { sourceType: 'cadastre' as const, name: 'Catastro', isEnabled: false },
      { sourceType: 'cej' as const, name: 'Poder Judicial CEJ', isEnabled: false },
      { sourceType: 'sbn' as const, name: 'SBN', isEnabled: false },
      { sourceType: 'cofopri' as const, name: 'COFOPRI', isEnabled: false },
      { sourceType: 'seace' as const, name: 'SEACE', isEnabled: false },
    ];

    for (const src of sources) {
      await db.insert(propertySources).values(src).onConflictDoNothing();
    }

    // ── Sample property (fictional, for testing) ────
    await db
      .insert(properties)
      .values({
        publicId: `LI-${nanoid(8)}`,
        title: 'Terreno de ejemplo en Cayma (dato ficticio)',
        description: 'Este es un terreno de ejemplo para desarrollo. NO es real.',
        propertyType: 'terreno',
        status: 'active',
        price: '85000',
        currency: 'PEN',
        priceSource: 'seed',
        priceVerification: 'reported',
        areaM2: '200',
        areaSource: 'seed',
        areaVerification: 'reported',
        district: 'Cayma',
        province: 'Arequipa',
        department: 'Arequipa',
        locationSource: 'seed',
        locationVerification: 'reported',
        latitude: '-16.3889',
        longitude: '-71.5400',
      })
      .onConflictDoNothing();

    logger.info('Seed completed successfully.');
  } catch (err) {
    logger.error({ err }, 'Seed failed');
    throw err;
  } finally {
    await closePool();
  }
}

if (isMainRunner(import.meta.url)) {
  runSeed().catch((err) => {
    logger.error({ err }, 'Seed run failed');
    process.exit(1);
  });
}