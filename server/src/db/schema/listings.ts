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
import { listingStatusEnum, sourceTypeEnum, currencyEnum } from './enums.js';
import { properties } from './properties.js';

/**
 * PROPERTY_LISTINGS — A single listing/publication from a specific source.
 *
 * One PROPERTY can have many LISTINGS (Facebook, Marketplace, Urbania, etc.).
 * Raw data is preserved for auditing and re-processing.
 */
export const propertyListings = pgTable(
  'property_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    sourceType: sourceTypeEnum('source_type').notNull(),
    externalId: varchar('external_id', { length: 255 }),
    sourceUrl: text('source_url'),

    title: varchar('title', { length: 500 }),
    description: text('description'),
    price: numeric('price', { precision: 15, scale: 2 }),
    currency: currencyEnum('currency').default('unknown'),
    areaM2: numeric('area_m2', { precision: 12, scale: 2 }),
    address: varchar('address', { length: 500 }),
    district: varchar('district', { length: 100 }),

    latitude: numeric('latitude', { precision: 12, scale: 8 }),
    longitude: numeric('longitude', { precision: 12, scale: 8 }),

    phone: varchar('phone', { length: 20 }),
    imageUrl: text('image_url'),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow(),

    status: listingStatusEnum('status').default('active'),
    contentHash: varchar('content_hash', { length: 64 }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxListingsProperty: index('idx_listings_property').on(table.propertyId),
    idxListingsSource: index('idx_listings_source').on(table.sourceType),
    idxListingsExternal: index('idx_listings_external').on(table.externalId),
    idxListingsHash: index('idx_listings_hash').on(table.contentHash),
    idxListingsScraped: index('idx_listings_scraped').on(table.scrapedAt),
  })
);
