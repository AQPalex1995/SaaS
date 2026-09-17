import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import {
  researchStatusEnum,
  taskStatusEnum,
  taskTypeEnum,
  taskPriorityEnum,
  verificationStatusEnum,
  confidenceLevelEnum,
} from './enums.js';
import { properties } from './properties.js';

/**
 * RESEARCH_CASES — An investigation on a specific property.
 *
 * A ResearchCase groups multiple ResearchTasks and their results.
 * One property can have multiple research cases over time.
 */
export const researchCases = pgTable(
  'research_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    status: researchStatusEnum('status').default('created').notNull(),
    summary: text('summary'),
    errorCount: integer('error_count').default(0),
    warningCount: integer('warning_count').default(0),
    completedTaskCount: integer('completed_task_count').default(0),
    totalTaskCount: integer('total_task_count').default(0),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 100 }),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxResearchProperty: index('idx_research_property').on(table.propertyId),
    idxResearchStatus: index('idx_research_status').on(table.status),
  })
);

/**
 * RESEARCH_TASKS — Individual tasks within a research case.
 *
 * Task types: identity, geolocation, registry, bgr, urbanism,
 * judicial, market, risk, documentation, manual_verification.
 */
export const researchTasks = pgTable(
  'research_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    researchCaseId: uuid('research_case_id')
      .notNull()
      .references(() => researchCases.id, { onDelete: 'cascade' }),

    taskType: taskTypeEnum('task_type').notNull(),
    status: taskStatusEnum('status').default('pending').notNull(),
    priority: taskPriorityEnum('priority').default('medium'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    error: text('error'),
    resultReference: uuid('result_reference'),
    requiresManualAction: boolean('requires_manual_action').default(false),
    manualActionDescription: text('manual_action_description'),

    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxTasksResearch: index('idx_tasks_research').on(table.researchCaseId),
    idxTasksType: index('idx_tasks_type').on(table.taskType),
    idxTasksStatus: index('idx_tasks_status').on(table.status),
  })
);

/**
 * RESEARCH_RESULTS — Normalized results from research tasks.
 *
 * Every result preserves the raw data from the source
 * alongside the parsed/normalized version.
 * Conflicting results are stored side-by-side (never overwritten).
 */
export const researchResults = pgTable(
  'research_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    researchTaskId: uuid('research_task_id')
      .notNull()
      .references(() => researchTasks.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    source: varchar('source', { length: 100 }).notNull(),
    sourceUrl: text('source_url'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow(),

    dataType: varchar('data_type', { length: 100 }),
    data: jsonb('data'),
    rawData: jsonb('raw_data'),

    confidence: confidenceLevelEnum('confidence').default('unknown'),
    verification: verificationStatusEnum('verification').default('reported'),
    parserVersion: varchar('parser_version', { length: 20 }),

    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxResultsTask: index('idx_results_task').on(table.researchTaskId),
    idxResultsProperty: index('idx_results_property').on(table.propertyId),
    idxResultsSource: index('idx_results_source').on(table.source),
  })
);
