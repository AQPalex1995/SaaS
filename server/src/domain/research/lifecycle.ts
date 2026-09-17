import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/connection.js';
import { researchCases, researchTasks } from '../../db/schema/index.js';

type DbLike = Pick<Database, 'update' | 'select'>;

/**
 * ResearchCase lifecycle (Phase 3 / T3.1).
 *
 * Target states: created → queued → running → completed | partial | failed.
 * `pending` and `cancelled` are kept for backward compatibility (legacy rows).
 *
 * Transitions are validated locally (assertCaseTransition) and enforced
 * atomically by transitionCase() with a conditional UPDATE, so a status can
 * only move through an allowed edge and terminal states are immutable.
 */

export type CaseStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'pending';

/** Allowed transition edges per source state. */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  pending: ['queued', 'running', 'completed', 'partial', 'failed'],
  created: ['queued', 'running', 'completed', 'partial', 'failed'],
  queued: ['running', 'completed', 'partial', 'failed'],
  running: ['completed', 'partial', 'failed', 'cancelled'],
  completed: [],
  partial: [],
  failed: [],
  cancelled: [],
};

/** Terminal states: after reaching one, the case must never change again. */
export const CASE_TERMINAL = new Set<CaseStatus>([
  'completed',
  'partial',
  'failed',
  'cancelled',
]);

export function isCaseTerminal(status: CaseStatus | string): boolean {
  return CASE_TERMINAL.has(status as CaseStatus);
}

/** Throw unless `from → to` is an allowed transition. Pure (unit-testable). */
export function assertCaseTransition(from: CaseStatus, to: CaseStatus): void {
  if (!CASE_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Transición de research case inválida: ${from} → ${to}`);
  }
}

type CaseUpdate = Partial<typeof researchCases.$inferInsert> & { status: CaseStatus };

/**
 * Move a research case to `to`, enforcing allowed transitions and immutability
 * of terminal states. Uses a conditional UPDATE to stay race-safe: if another
 * writer changed the status in between, this throws instead of clobbering.
 *
 * Idempotent: calling with the current status is a no-op (returns false).
 */
export async function transitionCase(
  db: DbLike,
  researchCaseId: string,
  to: CaseStatus,
  extra: Partial<typeof researchCases.$inferInsert> = {},
): Promise<void> {
  const rows = await db
    .select({ id: researchCases.id, status: researchCases.status })
    .from(researchCases)
    .where(eq(researchCases.id, researchCaseId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Research case ${researchCaseId} not found`);
  }
  const from = rows[0].status as CaseStatus;
  if (from === to) return; // idempotent no-op

  assertCaseTransition(from, to);

  const set: CaseUpdate = { ...extra, status: to, updatedAt: new Date() };
  if (to === 'running' && !set.startedAt) {
    set.startedAt = new Date();
  }
  if (isCaseTerminal(to) && !set.completedAt) {
    set.completedAt = new Date();
  }

  const applied = await db
    .update(researchCases)
    .set(set)
    .where(and(eq(researchCases.id, researchCaseId), eq(researchCases.status, from)))
    .returning({ id: researchCases.id });

  if (applied.length === 0) {
    throw new Error(
      `Research case ${researchCaseId} cambió de estado durante la transición (${from} → ${to})`,
    );
  }
}

/** Task statuses that mean "no more work is expected from this task". */
const TASK_TERMINAL = new Set([
  'completed',
  'failed',
  'skipped',
  'unavailable',
  'requires_manual_action',
  'blocked',
]);

/** Task statuses that surface as case-level warnings. */
const TASK_WARNING = new Set(['requires_manual_action', 'blocked', 'unavailable']);

/**
 * Recompute case counters from its tasks and land the case on a terminal state
 * when all tasks are terminal:
 *   - completed  → every task terminal, no failures
 *   - partial    → every task terminal but at least one failed
 *          (a source failing must not leave the case running forever)
 * Otherwise it keeps the current state (work still in progress) and only
 * refreshes the counters.
 */
export async function updateCaseProgress(
  db: DbLike,
  researchCaseId: string,
): Promise<void> {
  const rows = await db
    .select({ status: researchTasks.status })
    .from(researchTasks)
    .where(eq(researchTasks.researchCaseId, researchCaseId));

  const total = rows.length;
  if (total === 0) return;

  const terminal = rows.filter((r) => TASK_TERMINAL.has(r.status)).length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const warnings = rows.filter((r) => TASK_WARNING.has(r.status)).length;

  const counters: Partial<typeof researchCases.$inferInsert> = {
    completedTaskCount: terminal,
    totalTaskCount: total,
    errorCount: failed,
    warningCount: warnings,
  };

  if (terminal >= total) {
    const to: CaseStatus = failed > 0 ? 'partial' : 'completed';
    const summary =
      failed > 0
        ? `Caso con ejecución parcial: ${failed} tarea(s) con error`
        : 'Caso completado correctamente';
    await transitionCase(db, researchCaseId, to, { ...counters, summary });
    return;
  }

  await db
    .update(researchCases)
    .set({ ...counters, updatedAt: new Date() })
    .where(eq(researchCases.id, researchCaseId));
}