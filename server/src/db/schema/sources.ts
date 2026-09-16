import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sourceTypeEnum, connectorStatusEnum } from './enums.js';

/**
 * PROPERTY_SOURCES — Registry of data sources/connectors.
 *
 * Each row represents a configured data source (Facebook, SUNARP, etc.).
 * Tracks connector health, last check time, and configuration.
 */
export const propertySources = pgTable('property_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: sourceTypeEnum('source_type').notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),

  baseUrl: text('base_url'),
  status: connectorStatusEnum('status').default('unavailable'),
  isEnabled: boolean('is_enabled').default(false),
  requiresAuth: boolean('requires_auth').default(false),
  requiresManualAction: boolean('requires_manual_action').default(false),

  config: jsonb('config'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  lastError: text('last_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
