import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/connection.js';
import { researchTasks } from '../../db/schema/index.js';

type DbLike = Pick<Database, 'update' | 'select'>;

/**
 * ResearchTask lifecycle (Phase 3 / T3.2).
 *
 * Target states: pending → running → completed | failed | requires_manual_action
 * | blocked | unavailable | skipped.
 *
 * - settled: no more work is currently expected from the task
 *   (completed, failed, skipped, unavailable, blocked, requires_manual_action).
 * - immutable: the task can never leave this state again
 *   (completed, skipped).
 * - retryable: the task may go back to pending/running and be re-tried
 *   (failed, blocked, unavailable, requires_manual_action).
 * - resolvable by hand: `requires_manual_action` can also move straight to
 *   `completed` when a human finishes the manual action and the recorded
 *   `result` (data entered by the operator) settles the task (Phase 3 / T3.4).
 *
 * Transitions are validated locally (assertTaskTransition) and enforced
 * atomically by transitionTask() with a conditional UPDATE, so a status can
 * only move through an allowed edge and immutable states are protected.
 */

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'requires_manual_action'
  | 'blocked'
  | 'unavailable'
  | 'skipped';

/** Allowed transition edges per source state. */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: [
    'running',
    'completed',
    'failed',
    'requires_manual_action',
    'blocked',
    'unavailable',
    'skipped',
  ],
  running: [
    'completed',
    'failed',
    'requires_manual_action',
    'blocked',
    'unavailable',
    'skipped',
  ],
  requires_manual_action: [
    'running',
    'pending',
    'completed',
  ],
  blocked: ['running', 'pending', 'unavailable'],
  failed: ['running', 'pending'],
  unavailable: ['running', 'pending'],
  completed: [],
  skipped: [],
};

/** Immutable states: a task reaching one must never change again. */
export const TASK_TERMINAL = new Set<TaskStatus>(['completed', 'skipped']);

/**
 * Settled states: "no more work is expected" — used to decide when a ResearchCase
 * can reach a terminal state (all its tasks settled).
 * `requires_manual_action` counts as settled so a pending human action does not
 * leave the case suspended forever.
 */
export const TASK_SETTLED = new Set<TaskStatus>([
  'completed',
  'failed',
  'skipped',
  'unavailable',
  'blocked',
  'requires_manual_action',
]);

/** States whose automated work has finished (grabbed an end timestamp). */
export const TASK_DONE = new Set<TaskStatus>([
  'completed',
  'failed',
  'skipped',
  'unavailable',
  'blocked',
]);

/** States that can be retried (moved back to pending/running). */
const TASK_RETRYABLE = new Set<TaskStatus>([
  'failed',
  'blocked',
  'unavailable',
  'requires_manual_action',
]);

/** Task statuses that surface as case-level warnings. */
export const TASK_WARNING = new Set<TaskStatus>([
  'requires_manual_action',
  'blocked',
  'unavailable',
]);

export function isTaskTerminal(status: TaskStatus | string): boolean {
  return TASK_TERMINAL.has(status as TaskStatus);
}

export function isTaskSettled(status: TaskStatus | string): boolean {
  return TASK_SETTLED.has(status as TaskStatus);
}

/** True when `from → to` re-opens a retryable task for execution. */
export function isTaskRetry(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_RETRYABLE.has(from) && (to === 'pending' || to === 'running');
}

/** Throw unless `from → to` is an allowed transition. Pure (unit-testable). */
export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Transición de research task inválida: ${from} → ${to}`);
  }
}

type TaskSet = Partial<typeof researchTasks.$inferInsert> & { status: TaskStatus };

/**
 * Move a research task to `to`, enforcing the allowed transitions defined above.
 * Uses a conditional UPDATE to stay race-safe: if another writer changed the
 * status in between, this throws instead of clobbering.
 *
 * Automation (kept in one place so workers stop hand-managing timestamps):
 * - `startedAt` is set when entering `running`, or when a task reaches a settled
 *   state without ever having passed `running` (implicit work window).
 * - `completedAt` is set when the automated work is done (never for
 *   `requires_manual_action`, which pauses waiting for a human).
 * - `completed` clears `error` / `requiresManualAction`.
 * - `requires_manual_action` sets `requiresManualAction = true`.
 * - Retrying a retryable state clears `completedAt` and bumps `retryCount`.
 *
 * Idempotent: calling with the current status is a no-op (returns false).
 */
export async function transitionTask(
  db: DbLike,
  researchTaskId: string,
  to: TaskStatus,
  extra: Partial<typeof researchTasks.$inferInsert> = {},
): Promise<void> {
  const rows = await db
    .select({
      id: researchTasks.id,
      status: researchTasks.status,
      startedAt: researchTasks.startedAt,
      retryCount: researchTasks.retryCount,
    })
    .from(researchTasks)
    .where(eq(researchTasks.id, researchTaskId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Research task ${researchTaskId} not found`);
  }
  const from = rows[0].status as TaskStatus;
  if (from === to) return; // idempotent no-op

  assertTaskTransition(from, to);

  const set: TaskSet = { ...extra, status: to, updatedAt: new Date() };

  if (to === 'running' && !set.startedAt) {
    set.startedAt = new Date();
  } else if (isTaskSettled(to) && !rows[0].startedAt && !set.startedAt) {
    set.startedAt = new Date();
  }

  if (TASK_DONE.has(to) && !set.completedAt) {
    set.completedAt = new Date();
  }

  if (to === 'completed') {
    set.error = set.error ?? null;
    set.requiresManualAction = false;
    set.manualActionDescription = null;
  }
  if (to === 'requires_manual_action' && set.requiresManualAction === undefined) {
    set.requiresManualAction = true;
  }

  if (isTaskRetry(from, to)) {
    set.completedAt = null;
    set.retryCount = (rows[0].retryCount ?? 0) + 1;
  }

  const applied = await db
    .update(researchTasks)
    .set(set)
    .where(and(eq(researchTasks.id, researchTaskId), eq(researchTasks.status, from)))
    .returning({ id: researchTasks.id });

  if (applied.length === 0) {
    throw new Error(
      `Research task ${researchTaskId} cambió de estado durante la transición (${from} → ${to})`,
    );
  }
}