import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { scrapingJobStatusEnum, sourceTypeEnum } from './enums.js';

/**
 * SCRAPING_JOBS — Scheduled or triggered scraping job definitions.
 */
export const scrapingJobs = pgTable(
  'scraping_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    jobName: varchar('job_name', { length: 200 }),
    config: jsonb('config'),
    cronExpression: varchar('cron_expression', { length: 50 }),

    status: scrapingJobStatusEnum('status').default('pending'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxScrapingJobsSource: index('idx_scraping_jobs_source').on(table.sourceType),
    idxScrapingJobsStatus: index('idx_scraping_jobs_status').on(table.status),
  })
);

/**
 * SCRAPING_RUNS — Individual execution of a scraping job.
 */
export const scrapingRuns = pgTable(
  'scraping_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .references(() => scrapingJobs.id, { onDelete: 'set null' }),

    sourceType: sourceTypeEnum('source_type').notNull(),
    status: scrapingJobStatusEnum('status').default('running'),

    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    itemsFound: integer('items_found').default(0),
    itemsInserted: integer('items_inserted').default(0),
    itemsUpdated: integer('items_updated').default(0),
    errorCount: integer('error_count').default(0),

    summary: text('summary'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxScrapingRunsJob: index('idx_scraping_runs_job').on(table.jobId),
    idxScrapingRunsSource: index('idx_scraping_runs_source').on(table.sourceType),
    idxScrapingRunsStarted: index('idx_scraping_runs_started').on(table.startedAt),
  })
);

/**
 * SCRAPING_ERRORS — Errors during scraping runs.
 */
export const scrapingErrors = pgTable(
  'scraping_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .references(() => scrapingRuns.id, { onDelete: 'cascade' }),

    sourceType: sourceTypeEnum('source_type').notNull(),
    errorType: varchar('error_type', { length: 100 }),
    message: text('message'),
    url: text('url'),
    stackTrace: text('stack_trace'),
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxScrapingErrorsRun: index('idx_scraping_errors_run').on(table.runId),
  })
);
