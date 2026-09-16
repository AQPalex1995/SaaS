import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { verificationStatusEnum, confidenceLevelEnum } from './enums.js';
import { properties } from './properties.js';
import { point, polygon } from './geo.js';

/**
 * PROPERTY_LOCATIONS — Detailed location data with provenance.
 *
 * A property may have multiple location records from different sources
 * (Facebook reported, SUNARP registered, manually verified, etc.).
 */
export const propertyLocations = pgTable(
  'property_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    address: varchar('address', { length: 500 }),
    district: varchar('district', { length: 100 }),
    province: varchar('province', { length: 100 }),
    department: varchar('department', { length: 100 }),
    postalCode: varchar('postal_code', { length: 10 }),
    reference: text('reference'),

    latitude: numeric('latitude', { precision: 12, scale: 8 }),
    longitude: numeric('longitude', { precision: 12, scale: 8 }),

    source: varchar('source', { length: 100 }).notNull(),
    sourceUrl: text('source_url'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxLocationsProperty: index('idx_locations_property').on(table.propertyId),
  })
);

/**
 * PROPERTY_GEOMETRIES — PostGIS geometries for spatial analysis.
 *
 * Stores both point and polygon representations.
 * Supports distance queries, zone intersection, spatial comparisons.
 */
export const propertyGeometries = pgTable(
  'property_geometries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    geomPoint: point('geom_point'),
    geomPolygon: polygon('geom_polygon'),
    geomType: varchar('geom_type', { length: 30 }),

    source: varchar('source', { length: 100 }).notNull(),
    sourceUrl: text('source_url'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxGeometriesProperty: index('idx_geometries_property').on(table.propertyId),
  })
);
