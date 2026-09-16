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
import { currencyEnum, confidenceLevelEnum } from './enums.js';
import { properties } from './properties.js';

/**
 * MARKET_COMPARABLES — Comparable properties for market analysis.
 */
export const marketComparables = pgTable(
  'market_comparables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    comparableTitle: varchar('comparable_title', { length: 500 }),
    comparableUrl: text('comparable_url'),
    comparablePrice: numeric('comparable_price', { precision: 15, scale: 2 }),
    comparableCurrency: currencyEnum('comparable_currency').default('unknown'),
    comparableAreaM2: numeric('comparable_area_m2', { precision: 12, scale: 2 }),
    comparableDistrict: varchar('comparable_district', { length: 100 }),
    distanceMeters: numeric('distance_meters', { precision: 10, scale: 2 }),
    pricePerM2: numeric('price_per_m2', { precision: 12, scale: 2 }),

    similarity: numeric('similarity', { precision: 5, scale: 4 }),
    source: varchar('source', { length: 100 }).notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxMarketCompProperty: index('idx_market_comp_property').on(table.propertyId),
  })
);

/**
 * MARKET_PRICES — Price estimations and historical price data.
 */
export const marketPrices = pgTable(
  'market_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    estimatedPrice: numeric('estimated_price', { precision: 15, scale: 2 }),
    currency: currencyEnum('currency').default('unknown'),
    pricePerM2: numeric('price_per_m2', { precision: 12, scale: 2 }),
    estimationType: varchar('estimation_type', { length: 50 }),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    comparablesUsed: jsonb('comparables_used'),

    source: varchar('source', { length: 100 }).notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxMarketPricesProperty: index('idx_market_prices_property').on(table.propertyId),
  })
);
