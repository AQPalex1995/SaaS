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
import { alertSeverityEnum, alertStatusEnum, confidenceLevelEnum } from './enums.js';
import { properties } from './properties.js';

/**
 * PROPERTY_SCORES — Opportunity and risk indicators for a property.
 */
export const propertyScores = pgTable(
  'property_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    scoreType: varchar('score_type', { length: 100 }).notNull(),
    scoreValue: numeric('score_value', { precision: 8, scale: 4 }),
    maxValue: numeric('max_value', { precision: 8, scale: 4 }).default('100'),
    label: varchar('label', { length: 100 }),
    description: text('description'),
    confidence: confidenceLevelEnum('confidence').default('unknown'),

    factors: jsonb('factors'),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow(),
    algorithm: varchar('algorithm', { length: 50 }),
    version: varchar('version', { length: 20 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxScoresProperty: index('idx_scores_property').on(table.propertyId),
    idxScoresType: index('idx_scores_type').on(table.scoreType),
  })
);

/**
 * PROPERTY_ALERTS — Warnings, risks, and notifications about a property.
 */
export const propertyAlerts = pgTable(
  'property_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    alertType: varchar('alert_type', { length: 100 }).notNull(),
    severity: alertSeverityEnum('severity').default('info'),
    status: alertStatusEnum('status').default('active'),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    source: varchar('source', { length: 100 }),

    data: jsonb('data'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedBy: varchar('dismissed_by', { length: 100 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAlertsProperty: index('idx_alerts_property').on(table.propertyId),
    idxAlertsSeverity: index('idx_alerts_severity').on(table.severity),
    idxAlertsStatus: index('idx_alerts_status').on(table.status),
  })
);
