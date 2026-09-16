import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import {
  propertyTypeEnum,
  propertyStatusEnum,
  verificationStatusEnum,
  confidenceLevelEnum,
  currencyEnum,
} from './enums.js';
import { point, polygon } from './geo.js';

/**
 * PROPERTY — Central entity representing a real-world property.
 *
 * A property may have multiple listings (from different sources).
 * Data fields carry provenance metadata (source, confidence, verification).
 */
export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: varchar('public_id', { length: 20 }).notNull().unique(),
    title: varchar('title', { length: 500 }),
    description: text('description'),
    propertyType: propertyTypeEnum('property_type').default('otro'),
    status: propertyStatusEnum('status').default('active'),

    // ── Price (reported) ──────────────────────────────
    price: numeric('price', { precision: 15, scale: 2 }),
    currency: currencyEnum('currency').default('unknown'),
    priceSource: varchar('price_source', { length: 100 }),
    priceConfidence: confidenceLevelEnum('price_confidence').default('unknown'),
    priceVerification: verificationStatusEnum('price_verification').default('reported'),

    // ── Area ──────────────────────────────────────────
    areaM2: numeric('area_m2', { precision: 12, scale: 2 }),
    areaSource: varchar('area_source', { length: 100 }),
    areaConfidence: confidenceLevelEnum('area_confidence').default('unknown'),
    areaVerification: verificationStatusEnum('area_verification').default('reported'),

    // ── Location (text) ──────────────────────────────
    address: varchar('address', { length: 500 }),
    district: varchar('district', { length: 100 }),
    province: varchar('province', { length: 100 }).default('Arequipa'),
    department: varchar('department', { length: 100 }).default('Arequipa'),
    locationSource: varchar('location_source', { length: 100 }),
    locationConfidence: confidenceLevelEnum('location_confidence').default('unknown'),
    locationVerification: verificationStatusEnum('location_verification').default('reported'),

    // ── Coordinates ──────────────────────────────────
    latitude: numeric('latitude', { precision: 12, scale: 8 }),
    longitude: numeric('longitude', { precision: 12, scale: 8 }),

    // ── PostGIS Geometry ─────────────────────────────
    geomPoint: point('geom_point'),
    geomPolygon: polygon('geom_polygon'),

    // ── Metadata ─────────────────────────────────────
    listingCount: integer('listing_count').default(0),
    primaryListingId: uuid('primary_listing_id'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxPropertiesPublicId: index('idx_properties_public_id').on(table.publicId),
    idxPropertiesDistrict: index('idx_properties_district').on(table.district),
    idxPropertiesType: index('idx_properties_type').on(table.propertyType),
    idxPropertiesStatus: index('idx_properties_status').on(table.status),
    idxPropertiesCreated: index('idx_properties_created').on(table.createdAt),
  })
);
