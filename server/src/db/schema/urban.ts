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

/**
 * URBAN_ZONES — Urban zoning data (zonificación urbanística).
 * Source: PDM, PAT, IMPLA, municipalities.
 */
export const urbanZones = pgTable(
  'urban_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    zoneName: varchar('zone_name', { length: 200 }),
    zoneCode: varchar('zone_code', { length: 50 }),
    zoneType: varchar('zone_type', { length: 100 }),
    landUse: varchar('land_use', { length: 200 }),
    description: text('description'),

    source: varchar('source', { length: 100 }).notNull(),
    sourceUrl: text('source_url'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxUrbanZonesProperty: index('idx_urban_zones_property').on(table.propertyId),
  })
);

/**
 * URBAN_PARAMETERS — Construction parameters (parámetros urbanísticos).
 */
export const urbanParameters = pgTable(
  'urban_parameters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    maxHeight: numeric('max_height', { precision: 8, scale: 2 }),
    maxFloors: varchar('max_floors', { length: 20 }),
    maxBuildableArea: numeric('max_buildable_area', { precision: 5, scale: 2 }),
    minFreeArea: numeric('min_free_area', { precision: 5, scale: 2 }),
    setbackFront: numeric('setback_front', { precision: 8, scale: 2 }),
    setbackSide: numeric('setback_side', { precision: 8, scale: 2 }),
    setbackRear: numeric('setback_rear', { precision: 8, scale: 2 }),
    density: varchar('density', { length: 100 }),
    compatibleUses: text('compatible_uses'),
    observations: text('observations'),

    source: varchar('source', { length: 100 }).notNull(),
    sourceUrl: text('source_url'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxUrbanParamsProperty: index('idx_urban_params_property').on(table.propertyId),
  })
);
