import { eq, and } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import {
  properties,
  registryProperties,
  researchCases,
  researchTasks,
} from '../../db/schema/index.js';
import {
  isCaseTerminal,
  transitionCase,
  updateCaseProgress,
  type CaseStatus,
} from './lifecycle.js';
import {
  isTaskSettled,
  transitionTask,
  type TaskStatus,
} from './task-lifecycle.js';
import { recordResearchResult } from './result-provenance.js';
import { ManualActionService } from './manual-action.service.js';
import { connectorRegistry } from '../../connectors/registry.js';
import type { SearchParams, SearchResult, SourceType } from '../../connectors/base.js';
import { osmConnector } from '../../connectors/implementations/osm.js';
import { REMAJU_HOME_URL, remajuConnector } from '../../connectors/implementations/remaju.js';
import { planRemajuMatches, toRemateEntry } from './remaju-research.js';
import { logger } from '../../logger.js';

export interface OrchestratorOptions {
  /**
   * If true, skip the geolocation task during the research loop.
   * Useful when geolocation is consumed asynchronously by the geocoding queue.
   * Default is false when calling orchestrator directly, true when called from research worker.
   */
  skipGeolocation?: boolean;
}

export interface OrchestratorDeps {
  /** Injectable REM@JU search (tests); defaults to the real public connector. */
  remajuSearch?: (params: SearchParams) => Promise<SearchResult>;
}

export interface OrchestrationResult {
  researchCaseId: string;
  propertyId: string;
  status: CaseStatus;
  completedTasks: number;
  totalTasks: number;
  errorCount: number;
  warningCount: number;
  summary: string | null;
}

/** Mapping of task types to external connector source IDs */
export const TASK_SOURCE_MAP: Record<string, SourceType> = {
  registry: 'sunarp',
  bgr: 'sunarp_bgr',
  urbanism: 'impla',
  judicial: 'remaju',
};

/**
 * Research Orchestrator — Coordinates property investigations.
 *
 * Flow:
 * PROPERTY
 *   ↓
 * ResearchCase
 *   ↓
 * ResearchTasks
 *   ↓
 * Workers / Execution
 *   ↓
 * ResearchResults
 *
 * Guarantees:
 * 1. Fault Isolation: A down, failing, or timeout source does NOT abort the research.
 * 2. Partial Execution: When some tasks fail, valid tasks complete and the case lands on 'partial'.
 * 3. Idempotency: Terminal cases and settled tasks are skipped without error.
 * 4. Provenance: Successful tasks record structured results in `research_results`.
 */
export class ResearchOrchestrator {
  private db: Database;
  private manualActions: ManualActionService;
  private remajuSearch: (params: SearchParams) => Promise<SearchResult>;

  constructor(db?: Database, deps: OrchestratorDeps = {}) {
    this.db = db ?? getDb();
    this.manualActions = new ManualActionService(this.db);
    this.remajuSearch = deps.remajuSearch ?? ((params) => remajuConnector.search(params));
  }

  /**
   * Execute or resume an entire research case.
   */
  async executeCase(
    researchCaseId: string,
    options: OrchestratorOptions = {},
  ): Promise<OrchestrationResult> {
    const caseRows = await this.db
      .select()
      .from(researchCases)
      .where(eq(researchCases.id, researchCaseId))
      .limit(1);

    if (caseRows.length === 0) {
      throw new Error(`Research case ${researchCaseId} not found`);
    }

    const currentCase = caseRows[0];

    // Idempotency check: terminal cases must never be re-processed.
    if (isCaseTerminal(currentCase.status)) {
      logger.info(
        { researchCaseId, status: currentCase.status },
        'Research case is already in a terminal state, skipping orchestration',
      );
      return {
        researchCaseId: currentCase.id,
        propertyId: currentCase.propertyId,
        status: currentCase.status as CaseStatus,
        completedTasks: currentCase.completedTaskCount ?? 0,
        totalTasks: currentCase.totalTaskCount ?? 0,
        errorCount: currentCase.errorCount ?? 0,
        warningCount: currentCase.warningCount ?? 0,
        summary: currentCase.summary,
      };
    }

    const propertyId = currentCase.propertyId;

    // Transition case to 'running'
    try {
      await transitionCase(this.db, researchCaseId, 'running');
    } catch (err: any) {
      logger.warn(
        { researchCaseId, err: err?.message },
        'Could not transition case to running (may have been transitioned concurrently)',
      );
    }

    // Load tasks for this case
    const tasks = await this.db
      .select()
      .from(researchTasks)
      .where(eq(researchTasks.researchCaseId, researchCaseId));

    // Execute each task with fault isolation
    for (const task of tasks) {
      // Skip tasks that are already settled (idempotency under retries / multiple workers)
      if (isTaskSettled(task.status)) {
        continue;
      }

      if (task.taskType === 'geolocation' && options.skipGeolocation) {
        // Geolocation is delegated to the geocoding worker queue
        continue;
      }

      try {
        await this.executeTask(task, propertyId);
      } catch (taskErr: any) {
        // FAULT ISOLATION: A failing or down source does NOT stop the rest of the research!
        logger.warn(
          {
            taskId: task.id,
            taskType: task.taskType,
            researchCaseId,
            err: taskErr?.message,
          },
          'Task execution failed, recording error and continuing with remaining tasks',
        );

        try {
          await transitionTask(this.db, task.id, 'failed', {
            error: taskErr?.message ?? 'Error inesperado durante la ejecución de la tarea',
          });
        } catch (transErr) {
          logger.error(
            { taskId: task.id, transErr },
            'Failed to transition task to failed status',
          );
        }
      }
    }

    // Recompute progress counters and settle the case if all tasks are done
    await updateCaseProgress(this.db, researchCaseId);

    // Fetch updated case snapshot
    const [updated] = await this.db
      .select()
      .from(researchCases)
      .where(eq(researchCases.id, researchCaseId))
      .limit(1);

    logger.info(
      {
        researchCaseId,
        status: updated?.status,
        completedTaskCount: updated?.completedTaskCount,
        errorCount: updated?.errorCount,
        warningCount: updated?.warningCount,
      },
      'Research orchestration pass finished',
    );

    return {
      researchCaseId,
      propertyId,
      status: (updated?.status ?? 'running') as CaseStatus,
      completedTasks: updated?.completedTaskCount ?? 0,
      totalTasks: updated?.totalTaskCount ?? tasks.length,
      errorCount: updated?.errorCount ?? 0,
      warningCount: updated?.warningCount ?? 0,
      summary: updated?.summary ?? null,
    };
  }

  /**
   * Execute a single research task.
   */
  async executeTask(
    task: typeof researchTasks.$inferSelect,
    propertyId: string,
  ): Promise<string | null> {
    switch (task.taskType) {
      case 'identity':
        return await this.executeIdentityTask(task.id, propertyId);

      case 'geolocation':
        return await this.executeGeolocationTask(task.id, propertyId);

      case 'registry':
      case 'bgr':
      case 'urbanism':
        return await this.executeConnectorTask(task.id, task.taskType, propertyId);

      case 'judicial':
        return await this.executeRemajuTask(task.id, propertyId);

      case 'market':
      case 'risk':
      default:
        // Internal/stubs tasks without external connectors yet
        await transitionTask(this.db, task.id, 'unavailable', {
          error: 'Módulo de análisis o conector no implementado (stub)',
        });
        return null;
    }
  }

  /**
   * T1: Identity & Normalization task.
   * Reads property, normalizes core fields, writes to researchResults, marks completed.
   */
  private async executeIdentityTask(
    researchTaskId: string,
    propertyId: string,
  ): Promise<string> {
    const propRows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    const prop = propRows[0];
    if (!prop) {
      throw new Error(`Property ${propertyId} not found for identity task`);
    }

    const resultId = await recordResearchResult(this.db, {
      researchTaskId,
      propertyId,
      source: 'system',
      dataType: 'identity',
      data: {
        publicId: prop.publicId,
        title: prop.title,
        propertyType: prop.propertyType ?? 'otro',
        district: prop.district,
        verifiedCoordinates: !!(prop.latitude && prop.longitude),
      },
      rawData: {
        id: prop.id,
        status: prop.status,
        prices: { price: prop.price, currency: prop.currency },
        reportedSource: prop.priceSource,
      },
      confidence: 'high',
      verification: 'inferred',
      parserVersion: 'identity-v1',
    });

    await transitionTask(this.db, researchTaskId, 'completed', {
      resultReference: resultId,
    });

    return resultId;
  }

  /**
   * T2: Geolocation task (direct execution fallback when not handled by queue).
   */
  private async executeGeolocationTask(
    researchTaskId: string,
    propertyId: string,
  ): Promise<string | null> {
    const propRows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    const prop = propRows[0];
    if (!prop) {
      throw new Error(`Property ${propertyId} not found for geolocation task`);
    }

    // Already verified coordinates?
    if (prop.latitude && prop.longitude && prop.locationVerification === 'verified') {
      const resultId = await recordResearchResult(this.db, {
        researchTaskId,
        propertyId,
        source: prop.locationSource ?? 'system',
        dataType: 'geolocation',
        data: {
          latitude: Number(prop.latitude),
          longitude: Number(prop.longitude),
          district: prop.district,
          verified: true,
        },
        rawData: {
          locationSource: prop.locationSource,
          locationVerification: prop.locationVerification,
        },
        confidence: 'high',
        verification: 'verified',
        parserVersion: 'geo-v1',
      });

      await transitionTask(this.db, researchTaskId, 'skipped', {
        resultReference: resultId,
        error: 'Ya geolocalizada (coordenadas verificadas)',
      });
      return resultId;
    }

    const query = prop.district
      ? `${prop.district}, Arequipa, Perú`
      : prop.address
        ? `${prop.address}, Arequipa, Perú`
        : '';

    if (!query) {
      await transitionTask(this.db, researchTaskId, 'requires_manual_action', {
        manualActionDescription: 'Sin dirección ni distrito para geolocalizar',
      });
      try {
        await this.manualActions.requestManualAction(researchTaskId, propertyId, {
          instructions: 'Sin dirección ni distrito para geolocalizar',
          source: 'system',
        });
      } catch (err: any) {
        logger.warn(
          { researchTaskId, err: err?.message },
          'No se pudo crear la manual action de geolocalización',
        );
      }
      return null;
    }

    const searchResult = await osmConnector.search({ query });
    const item = searchResult.items[0];

    if (!item || item.latitude == null || item.longitude == null) {
      await transitionTask(this.db, researchTaskId, 'failed', {
        error: `Sin resultados en OpenStreetMap para "${query}"`,
      });
      return null;
    }

    const lat = Number(item.latitude);
    const lng = Number(item.longitude);

    const resultId = await recordResearchResult(this.db, {
      researchTaskId,
      propertyId,
      source: 'openstreetmap',
      sourceUrl: item.sourceUrl ?? null,
      dataType: 'geolocation',
      data: {
        latitude: lat,
        longitude: lng,
        district: item.district ?? prop.district,
        displayName: item.title,
        query,
      },
      rawData: {
        displayName: item.title ?? null,
        sourceUrl: item.sourceUrl ?? null,
      },
      retrievedAt: new Date(),
      confidence: 'medium',
      verification: 'verified',
      parserVersion: 'osm-v1',
    });

    await transitionTask(this.db, researchTaskId, 'completed', {
      resultReference: resultId,
    });

    return resultId;
  }

  /**
   * T4: Judicial auction task backed by REM@JU (Fase 4 / T4.6).
   *
   * Searches the public carousel (no CAPTCHA) and matches it against the
   * property's partida/dirección. A strong link only happens when the partida
   * is already known; otherwise the CAPTCHA-gated detail must be captured by a
   * human, so the task lands on `requires_manual_action` with a pending action
   * (completed later via the REM@JU manual intake API).
   */
  private async executeRemajuTask(
    researchTaskId: string,
    propertyId: string,
  ): Promise<string | null> {
    const propRows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    const prop = propRows[0];
    if (!prop) {
      throw new Error(`Property ${propertyId} not found for judicial task`);
    }

    if (!prop.district && !prop.address) {
      await this.requireRemajuManualAction(
        researchTaskId,
        propertyId,
        'Sin distrito ni dirección: no se puede ubicar el remate en REM@JU',
      );
      return null;
    }

    const registryRows = await this.db
      .select({ registryNumber: registryProperties.registryNumber })
      .from(registryProperties)
      .where(eq(registryProperties.propertyId, propertyId));

    const registryNumbers = registryRows
      .map((r) => r.registryNumber)
      .filter((n): n is string => Boolean(n));

    const searchResult = await this.remajuSearch({
      district: prop.district ?? undefined,
      query: prop.district ?? undefined,
      limit: 50,
    });

    const entries = searchResult.items.map(toRemateEntry);
    const plan = planRemajuMatches(
      {
        propertyId,
        district: prop.district,
        address: prop.address,
        registryNumbers,
      },
      entries,
    );

    if (entries.length === 0) {
      await transitionTask(this.db, researchTaskId, 'completed', {
        error: 'Sin remates públicos en REM@JU para el distrito consultado',
      });
      return null;
    }

    const resId = await recordResearchResult(this.db, {
      researchTaskId,
      propertyId,
      source: 'remaju',
      sourceUrl: REMAJU_HOME_URL,
      dataType: 'judicial',
      data: {
        district: prop.district,
        totalRemates: entries.length,
        matchCount: plan.matches.length,
        hardMatch: plan.hardMatch,
        bestMatchType: plan.bestMatchType,
        matches: plan.matches.map((m) => ({
          externalId: m.externalId,
          sourceUrl: m.sourceUrl,
          title: m.title,
          matchType: m.matchType,
          confidence: m.confidence,
          score: m.score,
          ubicacion: m.remate.ubicacion,
          fechaISO: m.remate.fechaISO,
          tipo: m.remate.tipo,
        })),
      },
      rawData: { remates: entries },
      retrievedAt: searchResult.searchedAt,
      confidence: plan.confidence === 'unknown' ? 'low' : plan.confidence,
      verification: 'reported',
      parserVersion: 'remaju-research-v1',
      metadata: { warnings: plan.warnings },
    });

    if (plan.hardMatch) {
      await transitionTask(this.db, researchTaskId, 'completed', {
        resultReference: resId,
      });
      return resId;
    }

    await this.requireRemajuManualAction(
      researchTaskId,
      propertyId,
      plan.matches.length > 0
        ? `REM@JU: ${plan.matches.length} remate(s) candidato(s) en "${prop.district}". Falta la partida registral (detalle con CAPTCHA): captura el aviso y regístralo.`
        : `REM@JU: sin coincidencias públicas para "${prop.district}". Si hay un remate, captura el aviso y regístralo.`,
      resId,
    );
    return resId;
  }

  /** Mark the task as requiring a human REM@JU capture and request the action. */
  private async requireRemajuManualAction(
    researchTaskId: string,
    propertyId: string,
    description: string,
    resultReference?: string,
  ): Promise<void> {
    await transitionTask(this.db, researchTaskId, 'requires_manual_action', {
      manualActionDescription: description,
      ...(resultReference ? { resultReference } : {}),
    });
    try {
      await this.manualActions.requestManualAction(researchTaskId, propertyId, {
        actionKind: 'captcha',
        instructions: description,
        url: REMAJU_HOME_URL,
        source: 'remaju',
        metadata: resultReference ? { resultReference } : null,
      });
    } catch (err: any) {
      logger.warn(
        { researchTaskId, err: err?.message },
        'No se pudo crear la manual action de REM@JU',
      );
    }
  }

  /**
   * Connector-backed tasks (registry, bgr, urbanism, judicial).
   * Queries the ConnectorRegistry, checks status, records stubs or results.
   */
  private async executeConnectorTask(
    researchTaskId: string,
    taskType: string,
    propertyId: string,
  ): Promise<string | null> {
    const sourceId = TASK_SOURCE_MAP[taskType];
    if (!sourceId || !connectorRegistry.has(sourceId)) {
      await transitionTask(this.db, researchTaskId, 'unavailable', {
        error: `Conector para ${taskType} no configurado en ConnectorRegistry`,
      });
      return null;
    }

    const connector = connectorRegistry.get(sourceId)!;

    // Check connector accessibility
    const status = await connector.getStatus();

    if (status.status === 'unavailable') {
      await transitionTask(this.db, researchTaskId, 'unavailable', {
        error: status.message ?? `Conector ${sourceId} no implementado (stub)`,
      });
      return null;
    }

    if (status.requiresManualAction || status.status === 'requires_auth') {
      const description =
        status.manualActionDescription ??
        status.message ??
        `El conector ${sourceId} requiere acción manual o autenticación`;
      await transitionTask(this.db, researchTaskId, 'requires_manual_action', {
        manualActionDescription: description,
      });
      try {
        await this.manualActions.requestManualAction(researchTaskId, propertyId, {
          actionKind: status.status === 'requires_auth' ? 'login' : 'user_action',
          instructions: description,
          source: sourceId,
        });
      } catch (err: any) {
        logger.warn(
          { researchTaskId, sourceId, err: err?.message },
          'No se pudo crear la manual action del conector',
        );
      }
      return null;
    }

    if (status.status === 'maintenance' || status.status === 'rate_limited') {
      await transitionTask(this.db, researchTaskId, 'unavailable', {
        error: status.message ?? `Conector ${sourceId} no disponible temporalmente (${status.status})`,
      });
      return null;
    }

    if (status.status === 'error') {
      await transitionTask(this.db, researchTaskId, 'failed', {
        error: status.message ?? `Error en conector ${sourceId}`,
      });
      return null;
    }

    // When a connector is available, execute search/details (extensible for Phase 4+)
    const details = await connector.getDetails(propertyId);
    if (!details.found) {
      await transitionTask(this.db, researchTaskId, 'completed', {
        error: 'Sin información en fuente externa',
      });
      return null;
    }

    const resId = await recordResearchResult(this.db, {
      researchTaskId,
      propertyId,
      source: sourceId,
      dataType: taskType,
      data: details.data ?? {},
      rawData: details.rawData ?? {},
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'v1',
    });

    await transitionTask(this.db, researchTaskId, 'completed', {
      resultReference: resId,
    });

    return resId;
  }
}

/** Convenience function to run research orchestration */
export async function orchestrateResearchCase(
  researchCaseId: string,
  options: OrchestratorOptions = {},
  db?: Database,
): Promise<OrchestrationResult> {
  const orchestrator = new ResearchOrchestrator(db);
  return orchestrator.executeCase(researchCaseId, options);
}
