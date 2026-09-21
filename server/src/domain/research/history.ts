import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../../db/connection.js';
import {
  properties,
  researchCases,
  researchTasks,
  researchResults,
} from '../../db/schema/index.js';
import type {
  PropertySummary,
  ResearchRunDTO,
  ResearchChangeDTO,
  ResearchHistoryTaskDTO,
  ResearchHistoryResultDTO,
  ResearchCaseHistoryDTO,
  ResearchHistoryDTO,
} from '../../dto/index.js';

/**
 * RP.3 — Research History Service.
 *
 * Assembles the research history of a PROPERTY: every RESEARCH_CASE and every
 * RESEARCH_RUN (derived from `research_cases.run_number`, per ADR-007 — no
 * `research_runs` table yet). For each execution it exposes tasks, results
 * (with provenance) and the material changes vs. the previous execution, so
 * the UI can compare runs and tell WHEN information changed.
 *
 * See docs/RESEARCH_GOVERNANCE.md §4 (historial PROPERTY/RESEARCH_CASE/
 * RESEARCH_RUN — not a simple search history).
 */

type HistoryCaseRow = typeof researchCases.$inferSelect;
type HistoryTaskRow = typeof researchTasks.$inferSelect;
type HistoryResultRow = typeof researchResults.$inferSelect;

interface DiffSource {
  taskType: string;
  source: string;
  data: unknown;
  retrievedAt: string | null;
}

/** Serialización estable de `data` (ignora el orden de las claves). */
export function serializeResultData(data: unknown): string {
  if (data === null || data === undefined) return 'null';
  if (typeof data !== 'object') return String(data);
  try {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>).sort()) {
      sorted[key] = (data as Record<string, unknown>)[key];
    }
    return JSON.stringify(sorted);
  } catch {
    return String(data);
  }
}

/** Claves de primer nivel de `data` cuyo valor cambió entre dos versiones. */
export function diffDataFields(prevData: unknown, curData: unknown): string[] {
  const p =
    prevData && typeof prevData === 'object'
      ? (prevData as Record<string, unknown>)
      : {};
  const c =
    curData && typeof curData === 'object'
      ? (curData as Record<string, unknown>)
      : {};
  const keys = new Set([...Object.keys(p), ...Object.keys(c)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (serializeResultData(p[key]) !== serializeResultData(c[key])) changed.push(key);
  }
  return changed;
}

/**
 * Diff por (taskType, source) entre dos ejecuciones consecutivas del mismo
 * predio: `added` (aparece en run actual), `removed` (desapareció), `edited`
 * (cambió el dato), `unchanged`. `changedAt` = retrievedAt de la versión nueva.
 */
export function diffResults(
  prev: DiffSource[],
  cur: DiffSource[]
): ResearchChangeDTO[] {
  const prevByKey = new Map(prev.map((r) => [`${r.taskType}|${r.source}`, r]));
  const curByKey = new Map(cur.map((r) => [`${r.taskType}|${r.source}`, r]));
  const changes: ResearchChangeDTO[] = [];

  for (const [key, r] of curByKey) {
    const past = prevByKey.get(key);
    if (!past) {
      changes.push({
        taskType: r.taskType,
        source: r.source,
        change: 'added',
        fieldsChanged: [],
        changedAt: r.retrievedAt,
      });
      continue;
    }
    const changed = serializeResultData(past.data) !== serializeResultData(r.data);
    changes.push({
      taskType: r.taskType,
      source: r.source,
      change: changed ? 'edited' : 'unchanged',
      fieldsChanged: changed ? diffDataFields(past.data, r.data) : [],
      changedAt: r.retrievedAt,
    });
  }

  for (const [key, past] of prevByKey) {
    if (!curByKey.has(key)) {
      changes.push({
        taskType: past.taskType,
        source: past.source,
        change: 'removed',
        fieldsChanged: [],
        changedAt: null,
      });
    }
  }

  return changes;
}

export class ResearchHistoryService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  /**
   * Historial completo de un predio. Devuelve `null` si el predio no existe.
   */
  async getPropertyHistory(propertyId: string): Promise<ResearchHistoryDTO | null> {
    const propRows = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (propRows.length === 0) return null;

    const caseRows = await this.db
      .select()
      .from(researchCases)
      .where(eq(researchCases.propertyId, propertyId));
    // Orden cronológico de ejecuciones (independiente del orden del driver).
    caseRows.sort((a, b) => (a.runNumber ?? 0) - (b.runNumber ?? 0));

    const allResults = await this.db
      .select()
      .from(researchResults)
      .where(eq(researchResults.propertyId, propertyId));

    const runs: ResearchRunDTO[] = [];
    const cases: ResearchCaseHistoryDTO[] = [];
    let prevDiff: DiffSource[] = [];

    for (const row of caseRows) {
      const tasks = await this.db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.researchCaseId, row.id))
        .orderBy(researchTasks.taskType);

      const taskTypeById = new Map(tasks.map((t) => [t.id, t.taskType ?? '']));
      const caseResults = allResults.filter((r) => taskTypeById.has(r.researchTaskId));

      const taskDTOs: ResearchHistoryTaskDTO[] = tasks.map(
        (t: HistoryTaskRow): ResearchHistoryTaskDTO => ({
          taskType: t.taskType ?? '',
          status: t.status ?? 'pending',
          requiresManualAction: t.requiresManualAction ?? false,
        })
      );

      const resultDTOs: ResearchHistoryResultDTO[] = caseResults.map(
        (r: HistoryResultRow): ResearchHistoryResultDTO => ({
          researchTaskId: r.researchTaskId,
          taskType: taskTypeById.get(r.researchTaskId) ?? '',
          source: r.source,
          dataType: r.dataType,
          retrievedAt: r.retrievedAt?.toISOString() ?? null,
          confidence: r.confidence ?? 'unknown',
          verification: r.verification ?? 'reported',
          parserVersion: r.parserVersion,
        })
      );

      const curDiff: DiffSource[] = caseResults.map(
        (r: HistoryResultRow): DiffSource => ({
          taskType: taskTypeById.get(r.researchTaskId) ?? '',
          source: r.source,
          data: r.data,
          retrievedAt: r.retrievedAt?.toISOString() ?? null,
        })
      );

      const changes = diffResults(prevDiff, curDiff);
      const run = this.toRun(row);
      const updated = changes.some((c) => c.change !== 'unchanged');

      cases.push({ ...run, tasks: taskDTOs, results: resultDTOs, changes, updated });
      runs.push(run);
      prevDiff = curDiff;
    }

    return {
      property: this.toSummary(propRows[0]),
      runs,
      cases,
    };
  }

  private toSummary(row: (typeof properties.$inferSelect)): PropertySummary {
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      propertyType: row.propertyType ?? 'otro',
      status: row.status ?? 'active',
      price: row.price,
      currency: row.currency ?? 'unknown',
      areaM2: row.areaM2,
      district: row.district,
      province: row.province,
      department: row.department,
      latitude: row.latitude,
      longitude: row.longitude,
      listingCount: row.listingCount ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRun(row: HistoryCaseRow): ResearchRunDTO {
    return {
      runNumber: row.runNumber ?? 0,
      caseId: row.id,
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
}