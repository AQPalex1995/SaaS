import { manualActions, researchResults, researchTasks } from '../../db/schema/index.js';
import { getQueue, withRedisTimeout, QUEUE_NAMES, type QueueName } from '../../workers/queue.js';
import type { Database } from '../../db/connection.js';
import { logger } from '../../logger.js';

/**
 * Phase 4 / T4.9 — Operations monitoring.
 *
 * Read-side aggregates over the research domain so an operator can see the
 * health of the human-in-the-loop pipeline without writing SQL by hand:
 *   - manual action cycle (requested → completed/cancelled, stale pending)
 *   - judicial/REM@JU pipeline (task statuses, results per source/parser)
 *   - stuck work: stale pending actions + orphan `requires_manual_action`
 *     tasks (no pending resolution), with age.
 */

export const DEFAULT_STALE_HOURS = 7 * 24; // 7 days without resolution

export interface ManualCycleMetrics {
  total: number;
  requested: number;
  completed: number;
  cancelled: number;
  stalePending: number;
  avgCompletionHours: number | null;
}

export interface TaskStatusCounts {
  total: number;
  completed: number;
  requiresManualAction: number;
  failed: number;
  cancelled: number;
  pending: number;
  running: number;
}

export interface JudicialPipelineMetrics {
  tasks: TaskStatusCounts;
  resultsBySource: Record<string, number>;
  resultsByParser: Record<string, number>;
}

export type StuckKind = 'stale_pending_action' | 'orphan_task';

export interface StuckItem {
  id: string;
  researchCaseId: string | null;
  taskType: string | null;
  kind: StuckKind;
  ageHours: number;
}

export interface OperationsSummary {
  generatedAt: string;
  staleThresholdHours: number;
  manualCycle: ManualCycleMetrics;
  judicialPipeline: JudicialPipelineMetrics;
  stuck: { total: number; thresholdHours: number; items: StuckItem[] };
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

export interface QueueStatus {
  connected: boolean;
  queues: Partial<Record<string, QueueCounts | null>>;
}

export type QueueReporter = (name: QueueName) => Promise<QueueCounts | null>;

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

export class MonitoringService {
  constructor(private readonly db: Database, private readonly staleThresholdHours = DEFAULT_STALE_HOURS) {}

  /**
   * Operational summary: manual cycle, judicial/REM@JU pipeline and stuck work.
   * Pure read aggregation over `manual_actions`, `research_tasks` and
   * `research_results` — safe for the offline in-memory test db.
   */
  async getOperationsSummary(now = new Date()): Promise<OperationsSummary> {
    const [actions, tasks, results] = await Promise.all([
      this.db.select().from(manualActions),
      this.db.select().from(researchTasks),
      this.db.select().from(researchResults),
    ]);

    const requested = actions.filter((a) => a.status === 'requested');
    const completed = actions.filter((a) => a.status === 'completed');
    const cancelled = actions.filter((a) => a.status === 'cancelled');

    const stalePending = requested.filter(
      (a) => hoursBetween(new Date(a.requestedAt), now) > this.staleThresholdHours,
    ).length;

    const completionDeltas = completed
      .filter((a) => a.completedAt && a.requestedAt)
      .map((a) => hoursBetween(new Date(a.requestedAt), new Date(a.completedAt!)));
    const avgCompletionHours =
      completionDeltas.length > 0
        ? completionDeltas.reduce((sum, d) => sum + d, 0) / completionDeltas.length
        : null;

    const judicialTasks = tasks.filter((t) => t.taskType === 'judicial');
    const countStatus = (status: string) => judicialTasks.filter((t) => t.status === status).length;
    const judicialTasksCounts: TaskStatusCounts = {
      total: judicialTasks.length,
      completed: countStatus('completed'),
      requiresManualAction: countStatus('requires_manual_action'),
      failed: countStatus('failed'),
      cancelled: countStatus('cancelled'),
      pending: countStatus('pending'),
      running: countStatus('running'),
    };

    const judicialResults = results.filter((r) => r.dataType === 'judicial');
    const resultsBySource: Record<string, number> = {};
    const resultsByParser: Record<string, number> = {};
    for (const r of judicialResults) {
      resultsBySource[r.source] = (resultsBySource[r.source] ?? 0) + 1;
      if (r.parserVersion) resultsByParser[r.parserVersion] = (resultsByParser[r.parserVersion] ?? 0) + 1;
    }

    // Stuck work: stale pending actions + orphan requires_manual_action tasks.
    const items: StuckItem[] = [];
    for (const a of stalePendingItems(actions, this.staleThresholdHours, now)) items.push(a);
    for (const t of orphanTasks(tasks, actions, this.staleThresholdHours, now)) items.push(t);
    items.sort((a, b) => b.ageHours - a.ageHours);

    return {
      generatedAt: now.toISOString(),
      staleThresholdHours: this.staleThresholdHours,
      manualCycle: {
        total: actions.length,
        requested: requested.length,
        completed: completed.length,
        cancelled: cancelled.length,
        stalePending,
        avgCompletionHours,
      },
      judicialPipeline: {
        tasks: judicialTasksCounts,
        resultsBySource,
        resultsByParser,
      },
      stuck: { total: items.length, thresholdHours: this.staleThresholdHours, items },
    };
  }

  /**
   * Queue depth per BullMQ queue. When Redis is not available it degrades
   * gracefully (`connected: false`) instead of raising.
   */
  async getQueueStatus(report?: QueueReporter): Promise<QueueStatus> {
    const reporter = report ?? defaultQueueReporter;
    const queues: QueueStatus['queues'] = {};
    let connected = false;
    for (const name of QUEUE_NAMES) {
      try {
        const counts = await reporter(name);
        queues[name] = counts;
        if (counts) connected = true;
      } catch (err) {
        logger.warn({ err, queue: name }, 'Queue status check failed');
        queues[name] = null;
      }
    }
    return { connected, queues };
  }
}

async function defaultQueueReporter(name: QueueName): Promise<QueueCounts | null> {
  const queue = getQueue(name);
  if (!queue) return null;
  const counts = await withRedisTimeout(queue.getJobCounts());
  if (!counts) return null;
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    paused: counts.paused ?? 0,
  };
}

function stalePendingItems(
  actions: any[],
  thresholdHours: number,
  now: Date,
): StuckItem[] {
  return actions
    .filter(
      (a) =>
        a.status === 'requested' &&
        hoursBetween(new Date(a.requestedAt), now) > thresholdHours,
    )
    .map((a) => ({
      id: a.id,
      researchCaseId: null,
      taskType: null,
      kind: 'stale_pending_action' as const,
      ageHours: hoursBetween(new Date(a.requestedAt), now),
    }));
}

function orphanTasks(tasks: any[], actions: any[], thresholdHours: number, now: Date): StuckItem[] {
  const pendingByTask = new Set(
    actions.filter((a) => a.status === 'requested').map((a) => a.researchTaskId),
  );
  return tasks
    .filter((t) => t.status === 'requires_manual_action')
    .filter((t) => !pendingByTask.has(t.id))
    .filter((t) => hoursBetween(new Date(t.updatedAt), now) > thresholdHours)
    .map((t) => ({
      id: t.id,
      researchCaseId: t.researchCaseId,
      taskType: t.taskType,
      kind: 'orphan_task' as const,
      ageHours: hoursBetween(new Date(t.updatedAt), now),
    }));
}