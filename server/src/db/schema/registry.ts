import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { verificationStatusEnum, confidenceLevelEnum } from './enums.js';
import { properties } from './properties.js';

/**
 * REGISTRY_PROPERTIES — SUNARP property registry data (partida registral).
 */
export const registryProperties = pgTable(
  'registry_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    registryNumber: varchar('registry_number', { length: 50 }),
    registryOffice: varchar('registry_office', { length: 100 }),
    registryZone: varchar('registry_zone', { length: 100 }),
    registeredArea: numeric('registered_area', { precision: 12, scale: 2 }),
    registeredAddress: text('registered_address'),
    registeredDistrict: varchar('registered_district', { length: 100 }),

    source: varchar('source', { length: 100 }).notNull().default('sunarp'),
    sourceUrl: text('source_url'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxRegistryProperty: index('idx_registry_property').on(table.propertyId),
    idxRegistryNumber: index('idx_registry_number').on(table.registryNumber),
  })
);

/**
 * REGISTRY_OWNERS — Registered property owners (titulares registrales).
 */
export const registryOwners = pgTable(
  'registry_owners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registryPropertyId: uuid('registry_property_id')
      .notNull()
      .references(() => registryProperties.id, { onDelete: 'cascade' }),

    ownerName: varchar('owner_name', { length: 300 }),
    ownerType: varchar('owner_type', { length: 50 }),
    documentType: varchar('document_type', { length: 20 }),
    documentNumber: varchar('document_number', { length: 20 }),
    ownershipPercentage: numeric('ownership_percentage', { precision: 5, scale: 2 }),
    registeredDate: date('registered_date'),

    source: varchar('source', { length: 100 }).notNull().default('sunarp'),
    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOwnersRegistry: index('idx_owners_registry').on(table.registryPropertyId),
  })
);

/**
 * REGISTRY_CHARGES — Liens, mortgages, encumbrances (cargas y gravámenes).
 */
export const registryCharges = pgTable(
  'registry_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registryPropertyId: uuid('registry_property_id')
      .notNull()
      .references(() => registryProperties.id, { onDelete: 'cascade' }),

    chargeType: varchar('charge_type', { length: 100 }),
    description: text('description'),
    amount: numeric('amount', { precision: 15, scale: 2 }),
    currency: varchar('currency', { length: 3 }),
    creditor: varchar('creditor', { length: 300 }),
    registeredDate: date('registered_date'),
    isActive: varchar('is_active', { length: 10 }).default('unknown'),

    source: varchar('source', { length: 100 }).notNull().default('sunarp'),
    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxChargesRegistry: index('idx_charges_registry').on(table.registryPropertyId),
  })
);

/**
 * REGISTRY_TITLES — Title history (historial de títulos).
 */
export const registryTitles = pgTable(
  'registry_titles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registryPropertyId: uuid('registry_property_id')
      .notNull()
      .references(() => registryProperties.id, { onDelete: 'cascade' }),

    titleNumber: varchar('title_number', { length: 50 }),
    titleDate: date('title_date'),
    titleType: varchar('title_type', { length: 100 }),
    notary: varchar('notary', { length: 200 }),
    description: text('description'),

    source: varchar('source', { length: 100 }).notNull().default('sunarp'),
    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxTitlesRegistry: index('idx_titles_registry').on(table.registryPropertyId),
  })
);
