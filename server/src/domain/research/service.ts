import { eq, desc, inArray } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import { researchCases, researchTasks, researchResults, properties } from '../../db/schema/index.js';
import type { ResearchCaseDTO, ResearchTaskDTO, ResearchResultDTO } from '../../dto/index.js';
import { logger } from '../../logger.js';
import {
  ResearchOrchestrator,
  type OrchestratorOptions,
  type OrchestrationResult,
} from './orchestrator.js';

/** Default task types created for each new research case. */
const DEFAULT_TASK_TYPES = [
  'identity',
  'geolocation',
  'registry',
  'bgr',
  'urbanism',
  'judicial',
  'market',
  'risk',
] as const;

/**
 * Research Service — Orchestrates property investigations.
 */
export class ResearchService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  /**
   * Create a new research case for a property.
   * Automatically generates all default tasks.
   */
  async createResearch(propertyId: string, createdBy?: string): Promise<ResearchCaseDTO> {
    // Verify property exists
    const prop = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (prop.length === 0) {
      throw new Error(`Property ${propertyId} not found`);
    }

    // Create the research case (lifecycle: created → queued → running → ...)
    const [researchCase] = await this.db
      .insert(researchCases)
      .values({
        propertyId,
        status: 'created',
        totalTaskCount: DEFAULT_TASK_TYPES.length,
        createdBy: createdBy ?? 'system',
      })
      .returning();

    // Create all default tasks
    for (const taskType of DEFAULT_TASK_TYPES) {
      await this.db.insert(researchTasks).values({
        researchCaseId: researchCase.id,
        taskType,
        status: 'pending',
        priority: taskType === 'identity' ? 'high' : 'medium',
      });
    }

    logger.info(
      { researchCaseId: researchCase.id, propertyId },
      'Research case created with default tasks'
    );

    return this.toCaseDTO(researchCase);
  }

  /**
   * Get a research case by ID.
   */
  async getCaseById(id: string): Promise<ResearchCaseDTO | null> {
    const rows = await this.db
      .select()
      .from(researchCases)
      .where(eq(researchCases.id, id))
      .limit(1);

    return rows.length > 0 ? this.toCaseDTO(rows[0]) : null;
  }

  /**
   * Get research cases for a property.
   */
  async getCasesByProperty(propertyId: string): Promise<ResearchCaseDTO[]> {
    const rows = await this.db
      .select()
      .from(researchCases)
      .where(eq(researchCases.propertyId, propertyId))
      .orderBy(desc(researchCases.createdAt));

    return rows.map(this.toCaseDTO);
  }

  /**
   * Get tasks for a research case.
   */
  async getTasks(researchCaseId: string): Promise<ResearchTaskDTO[]> {
    const rows = await this.db
      .select()
      .from(researchTasks)
      .where(eq(researchTasks.researchCaseId, researchCaseId))
      .orderBy(researchTasks.taskType);

    return rows.map(this.toTaskDTO);
  }

  /**
   * Get results for a research case across all its tasks.
   */
  async getResults(researchCaseId: string): Promise<ResearchResultDTO[]> {
    // Get task IDs for this case
    const tasks = await this.db
      .select({ id: researchTasks.id })
      .from(researchTasks)
      .where(eq(researchTasks.researchCaseId, researchCaseId));

    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const rows = await this.db
      .select()
      .from(researchResults)
      .where(inArray(researchResults.researchTaskId, taskIds))
      .orderBy(desc(researchResults.createdAt));

    return rows.map(this.toResultDTO);
  }

  /**
   * Orchestrate execution of a research case.
   */
  async executeResearch(
    researchCaseId: string,
    options?: OrchestratorOptions,
  ): Promise<OrchestrationResult> {
    const orchestrator = new ResearchOrchestrator(this.db);
    return orchestrator.executeCase(researchCaseId, options);
  }

  private toCaseDTO(row: typeof researchCases.$inferSelect): ResearchCaseDTO {
    return {
      id: row.id,
      propertyId: row.propertyId,
      status: row.status ?? 'pending',
      summary: row.summary,
      errorCount: row.errorCount ?? 0,
      warningCount: row.warningCount ?? 0,
      completedTaskCount: row.completedTaskCount ?? 0,
      totalTaskCount: row.totalTaskCount ?? 0,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTaskDTO(row: typeof researchTasks.$inferSelect): ResearchTaskDTO {
    return {
      id: row.id,
      researchCaseId: row.researchCaseId,
      taskType: row.taskType ?? '',
      status: row.status ?? 'pending',
      priority: row.priority ?? 'medium',
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      error: row.error,
      requiresManualAction: row.requiresManualAction ?? false,
      manualActionDescription: row.manualActionDescription,
      retryCount: row.retryCount ?? 0,
      maxRetries: row.maxRetries ?? 3,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toResultDTO(row: typeof researchResults.$inferSelect): ResearchResultDTO {
    return {
      id: row.id,
      researchTaskId: row.researchTaskId,
      propertyId: row.propertyId,
      source: row.source,
      sourceUrl: row.sourceUrl,
      retrievedAt: row.retrievedAt?.toISOString() ?? null,
      dataType: row.dataType,
      data: row.data as Record<string, unknown> | null,
      confidence: row.confidence ?? 'unknown',
      verification: row.verification ?? 'reported',
      parserVersion: row.parserVersion,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
