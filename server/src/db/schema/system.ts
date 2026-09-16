import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { auditActionEnum } from './enums.js';

/**
 * USERS — System users (for audit tracking, not full auth yet).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }),
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user'),
  isActive: varchar('is_active', { length: 5 }).default('true'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * AUDIT_LOGS — Tracks important system events and data changes.
 *
 * Every significant operation is recorded for traceability.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),

    userId: varchar('user_id', { length: 100 }),
    requestId: varchar('request_id', { length: 100 }),
    jobId: varchar('job_id', { length: 100 }),
    researchCaseId: uuid('research_case_id'),
    propertyId: uuid('property_id'),
    sourceId: varchar('source_id', { length: 100 }),

    previousData: jsonb('previous_data'),
    newData: jsonb('new_data'),
    description: text('description'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAuditAction: index('idx_audit_action').on(table.action),
    idxAuditEntity: index('idx_audit_entity').on(table.entityType, table.entityId),
    idxAuditProperty: index('idx_audit_property').on(table.propertyId),
    idxAuditCreated: index('idx_audit_created').on(table.createdAt),
  })
);
