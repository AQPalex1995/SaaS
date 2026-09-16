/**
 * Land Intelligence — Complete Database Schema
 *
 * Re-exports all table definitions and enum types.
 * This is the single import point for the entire schema.
 */

// ── Enum types ──────────────────────────────────────────────
export * from './enums.js';

// ── PostGIS custom types ────────────────────────────────────
export * from './geo.js';

// ── Core domain ─────────────────────────────────────────────
export { properties } from './properties.js';
export { propertyListings } from './listings.js';
export { propertySources } from './sources.js';
export { propertyLocations, propertyGeometries } from './locations.js';

// ── Registry (SUNARP) ───────────────────────────────────────
export {
  registryProperties,
  registryOwners,
  registryCharges,
  registryTitles,
} from './registry.js';

// ── Urban (PDM / IMPLA / municipalities) ────────────────────
export { urbanZones, urbanParameters } from './urban.js';

// ── Judicial (CEJ) ──────────────────────────────────────────
export { judicialCases, judicialEvents } from './judicial.js';

// ── Market ──────────────────────────────────────────────────
export { marketComparables, marketPrices } from './market.js';

// ── Research engine ─────────────────────────────────────────
export { researchCases, researchTasks, researchResults } from './research.js';

// ── Documents & links ───────────────────────────────────────
export { documents, externalLinks } from './documents.js';

// ── Scores & alerts ─────────────────────────────────────────
export { propertyScores, propertyAlerts } from './scores.js';

// ── Scraping operations ─────────────────────────────────────
export { scrapingJobs, scrapingRuns, scrapingErrors } from './scraping.js';

// ── System ──────────────────────────────────────────────────
export { users, auditLogs } from './system.js';
