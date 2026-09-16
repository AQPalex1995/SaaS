import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties.js';

/**
 * JUDICIAL_CASES — Judicial proceedings related to a property.
 * Source: CEJ (Consulta de Expedientes Judiciales), Poder Judicial.
 */
export const judicialCases = pgTable(
  'judicial_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    caseNumber: varchar('case_number', { length: 100 }),
    court: varchar('court', { length: 200 }),
    caseType: varchar('case_type', { length: 100 }),
    subject: text('subject'),
    status: varchar('status', { length: 100 }),
    filingDate: date('filing_date'),
    parties: text('parties'),

    source: varchar('source', { length: 100 }).notNull().default('cej'),
    sourceUrl: text('source_url'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxJudicialProperty: index('idx_judicial_property').on(table.propertyId),
    idxJudicialCaseNumber: index('idx_judicial_case_number').on(table.caseNumber),
  })
);

/**
 * JUDICIAL_EVENTS — Events/updates within a judicial case.
 */
export const judicialEvents = pgTable(
  'judicial_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judicialCaseId: uuid('judicial_case_id')
      .notNull()
      .references(() => judicialCases.id, { onDelete: 'cascade' }),

    eventDate: date('event_date'),
    eventType: varchar('event_type', { length: 100 }),
    description: text('description'),
    resolution: text('resolution'),

    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxJudicialEventsCase: index('idx_judicial_events_case').on(table.judicialCaseId),
  })
);
