import { and, desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import {
  auditLogs,
  manualActions,
  researchTasks,
} from '../../db/schema/index.js';
import type { ManualActionDTO } from '../../dto/index.js';
import { logger } from '../../logger.js';
import { updateCaseProgress } from './lifecycle.js';
import { recordResearchResult } from './result-provenance.js';
import { transitionTask } from './task-lifecycle.js';

/**
 * Manual Action Service (Phase 3 / T3.4).
 *
 * Generic mechanism for sources that require human intervention to deliver
 * their data:
 *
 *   CAPTCHA, LOGIN, PAYMENT, USER ACTION
 *
 * Flow:
 *   1. A research task lands on `requires_manual_action` and the caller asks
 *      `requestManualAction()` → a `manual_actions` row is created with the
 *      instructions/url an operator needs (`requested_at` at insert time).
 *   2. An operator resolves it via `completeManualAction()` → the row records
 *      `completed_at`, `completed_by` and the human-entered `result`.
 *   3. If the owning research task is still waiting on the human, the result is
 *      persisted into `research_results` (source='manual', provenance
 *      verification='verified', confidence='high') and the task settles as
 *      `completed` with a `result_reference` to it.
 *
 * Requests are idempotent per task: a task with an active `requested` action
 * does not produce duplicates when re-processed.
 */
export class ManualActionService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  /**
   * Create a manual action request for a research task.
   * Idempotent: if the task already has an active (``requested``) action,
   * returns it without creating a duplicate.
   */
  async requestManualAction(
    researchTaskId: string,
    propertyId: string,
    input: RequestManualActionInput,
  ): Promise<ManualActionDTO> {
    const existing = await this.db
      .select()
      .from(manualActions)
      .where(
        and(
          eq(manualActions.researchTaskId, researchTaskId),
          eq(manualActions.status, 'requested'),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return this.toDTO(existing[0]);
    }

    const [row] = await this.db
      .insert(manualActions)
      .values({
        researchTaskId,
        propertyId,
        actionKind: input.actionKind ?? 'user_action',
        instructions: input.instructions,
        url: input.url ?? null,
        source: input.source ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();

    logger.info(
      { researchTaskId, propertyId, manualActionId: row.id, actionKind: row.actionKind },
      'Manual action requested',
    );

    return this.toDTO(row);
  }

  /**
   * Get a single manual action by ID.
   */
  async getManualAction(id: string): Promise<ManualActionDTO | null> {
    const rows = await this.db
      .select()
      .from(manualActions)
      .where(eq(manualActions.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDTO(rows[0]) : null;
  }

  /**
   * List manual actions, optionally filtered by status / property / task.
   * Ordered by most recent request first.
   */
  async listManualActions(filters: ManualActionFilters = {}): Promise<ManualActionDTO[]> {
    const conditions = [];
    if (filters.status) conditions.push(eq(manualActions.status, filters.status));
    if (filters.propertyId) conditions.push(eq(manualActions.propertyId, filters.propertyId));
    if (filters.researchTaskId)
      conditions.push(eq(manualActions.researchTaskId, filters.researchTaskId));

    const rows =
      conditions.length > 0
        ? await this.db
            .select()
            .from(manualActions)
            .where(and(...conditions))
            .orderBy(desc(manualActions.requestedAt))
        : await this.db
            .select()
            .from(manualActions)
            .orderBy(desc(manualActions.requestedAt));

    return rows.map((r) => this.toDTO(r));
  }

  /**
   * Complete a manual action with the human-entered result.
   * Records `completed_at`, `completed_by` and `result`, then — when the
   * owning research task is still waiting on the human — persists the result
   * into `research_results` (source='manual') and settles the task as
   * `completed` with a result reference.
   */
  async completeManualAction(
    id: string,
    input: CompleteManualActionInput,
  ): Promise<ManualActionDTO> {
    const rows = await this.db
      .select()
      .from(manualActions)
      .where(eq(manualActions.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new Error(`Manual action ${id} not found`);
    }

    const action = rows[0];
    if (action.status !== 'requested') {
      throw new Error(`Manual action ${id} already ${action.status}`);
    }

    const completedBy = input.completedBy ?? 'system';
    const now = new Date();

    const [updated] = await this.db
      .update(manualActions)
      .set({
        status: 'completed',
        result: input.result ?? null,
        completedBy,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(manualActions.id, id))
      .returning();

    // Settle the owning task if it is still waiting on the human.
    const taskRows = await this.db
      .select({
        id: researchTasks.id,
        researchCaseId: researchTasks.researchCaseId,
        taskType: researchTasks.taskType,
        status: researchTasks.status,
      })
      .from(researchTasks)
      .where(eq(researchTasks.id, action.researchTaskId))
      .limit(1);

    if (taskRows.length > 0 && taskRows[0].status === 'requires_manual_action') {
      const task = taskRows[0];

      const resultReference = await recordResearchResult(this.db, {
        researchTaskId: task.id,
        propertyId: action.propertyId,
        source: 'manual',
        sourceUrl: action.url ?? null,
        dataType: task.taskType,
        data: input.result ?? {},
        rawData: input.result ?? null,
        confidence: 'high',
        verification: 'verified',
        parserVersion: 'manual-v1',
        metadata: {
          manualActionId: id,
          externalSource: action.source,
        },
      });

      await this.db.insert(auditLogs).values({
        action: 'manual_result_entered',
        entityType: 'research_task',
        entityId: task.id,
        userId: completedBy,
        researchCaseId: task.researchCaseId,
        propertyId: action.propertyId,
        sourceId: action.source ?? 'manual',
        newData: { result: input.result ?? {}, manualActionId: id },
        description: `Resultado manual ingresado para la tarea ${task.taskType}`,
      });

      await transitionTask(this.db, task.id, 'completed', {
        resultReference,
      });
      await updateCaseProgress(this.db, task.researchCaseId);

      logger.info(
        { researchTaskId: task.id, manualActionId: id, resultReference },
        'Manual action completed and research task settled',
      );
    }

    return this.toDTO(updated);
  }

  /**
   * Cancel a pending manual action (the operator decided it is not needed).
   * The owning task stays in `requires_manual_action`; a future re-run may
   * request a fresh action.
   */
  async cancelManualAction(id: string, cancelledBy?: string): Promise<ManualActionDTO> {
    const rows = await this.db
      .select()
      .from(manualActions)
      .where(eq(manualActions.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new Error(`Manual action ${id} not found`);
    }

    if (rows[0].status === 'completed') {
      throw new Error(`Manual action ${id} already completed`);
    }

    if (rows[0].status === 'cancelled') {
      return this.toDTO(rows[0]);
    }

    const now = new Date();
    const [updated] = await this.db
      .update(manualActions)
      .set({
        status: 'cancelled',
        completedBy: cancelledBy ?? 'system',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(manualActions.id, id))
      .returning();

    logger.info({ manualActionId: id }, 'Manual action cancelled');

    return this.toDTO(updated);
  }

  private toDTO(row: typeof manualActions.$inferSelect): ManualActionDTO {
    return {
      id: row.id,
      researchTaskId: row.researchTaskId,
      propertyId: row.propertyId,
      actionKind: row.actionKind,
      status: row.status,
      instructions: row.instructions,
      url: row.url,
      source: row.source,
      requestedAt: (row.requestedAt ?? new Date()).toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      completedBy: row.completedBy,
      result: row.result as Record<string, unknown> | null,
      createdAt: (row.createdAt ?? new Date()).toISOString(),
      updatedAt: (row.updatedAt ?? new Date()).toISOString(),
    };
  }
}

export type ManualActionKind =
  | 'captcha'
  | 'login'
  | 'payment'
  | 'user_action'
  | 'other';

export interface RequestManualActionInput {
  actionKind?: ManualActionKind;
  instructions: string;
  url?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CompleteManualActionInput {
  result: Record<string, unknown>;
  completedBy?: string;
}

export interface ManualActionFilters {
  status?: 'requested' | 'completed' | 'cancelled';
  propertyId?: string;
  researchTaskId?: string;
}