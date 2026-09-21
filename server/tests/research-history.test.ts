import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { researchRoutes } from '../src/domain/research/routes.js';
import { ResearchHistoryService, diffResults, serializeResultData, diffDataFields } from '../src/domain/research/history.js';
import {
  properties,
  researchCases,
  researchTasks,
  researchResults,
  manualActions,
  auditLogs,
} from '../src/db/schema/index.js';

// Avoid touching Redis from the POST route.
vi.mock('../src/workers/jobs.js', () => ({
  enqueueGeocoding: vi.fn().mockResolvedValue('geo-job-1'),
  enqueueResearch: vi.fn().mockResolvedValue('research-job-1'),
}));

/**
 * RP.3 - Research History (historial PROPERTY / RESEARCH_CASE / RESEARCH_RUN).
 *
 * Covers docs/RESEARCH_GOVERNANCE.md §4: the history of a predio distinguishes
 * the property, every research case and every execution (run, derived from
 * run_number per ADR-007 - no research_runs table yet). For each execution the
 * history exposes tasks, results (with provenance) and material changes vs.
 * the previous execution (added/removed/edited/unchanged) so the UI can:
 *   - compare investigations,
 *   - detect changes between runs,
 *   - preserve previous investigations,
 *   - tell WHEN information changed (changedAt/retrievedAt).
 */

const CASE_1 = '11111111-1111-1111-1111-111111111111';
const CASE_2 = '33333333-3333-3333-3333-333333333333';
const PROP_ID = '22222222-2222-2222-2222-222222222222';
const TASK_IDENTITY_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_IDENTITY_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_REGISTRY_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TASK_REGISTRY_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ── Drizzle WHERE predicate evaluation over in-memory rows ────────────────
function isColumn(node: any): boolean {
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.name === 'string' &&
    node.table !== undefined
  );
}

function isParam(node: any): boolean {
  return (
    !!node &&
    (node.constructor?.name === 'Param' ||
      (typeof node === 'object' && 'value' in node && 'column' in node))
  );
}

function columnKey(col: any): string | null {
  const table = col?.table;
  if (table && typeof table === 'object') {
    for (const key of Object.keys(table)) {
      if ((table as any)[key] === col) return key;
    }
  }
  return typeof col?.name === 'string' ? col.name : null;
}

function evalWhere(pred: any, row: Record<string, any>): boolean {
  if (!pred || typeof pred !== 'object') return true;
  const chunks = Array.isArray(pred.queryChunks) ? pred.queryChunks : null;
  if (!chunks) return true;

  const innerSq = chunks.filter((c: any) => c?.constructor?.name === 'SQL');
  if (innerSq.length > 0) return innerSq.every((c: any) => evalWhere(c, row));

  const colChunk = chunks.find((c: any) => isColumn(c));
  const paramChunk = chunks.find((c: any) => isParam(c));
  if (colChunk && paramChunk) {
    const key = columnKey(colChunk);
    if (key) return row[key] === paramChunk.value;
  }
  return true;
}

// ── In-memory database (research + properties) ─────────────────────────
function createInMemoryDb(options: { withProperty?: boolean } = {}) {
  const now = new Date('2026-09-21T12:00:00.000Z');
  const state = {
    cases: [] as any[],
    tasks: [] as any[],
    properties: options.withProperty
      ? [
          {
            id: PROP_ID,
            publicId: 'PRP-HIST-001',
            title: 'Predio de prueba (historial)',
            propertyType: 'terreno',
            status: 'active',
            price: null,
            currency: 'unknown',
            areaM2: null,
            district: 'Yanahuara',
            province: 'Arequipa',
            department: 'Arequipa',
            latitude: '-16.40',
            longitude: '-71.53',
            listingCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
    results: [] as any[],
    manualActions: [] as any[],
    auditLogs: [] as any[],
  };

  const tableData = (table: any): any[] => {
    if (table === properties) return state.properties;
    if (table === researchCases) return state.cases;
    if (table === researchTasks) return state.tasks;
    if (table === researchResults) return state.results;
    if (table === manualActions) return state.manualActions;
    if (table === auditLogs) return state.auditLogs;
    return [];
  };

  function queryable(data: any[]) {
    const promise = Promise.resolve(data);
    const q: any = {
      where: (pred: any) => queryable(data.filter((r) => evalWhere(pred, r))),
      limit: (n: number) => Promise.resolve(data.slice(0, n)),
      orderBy: () => Promise.resolve(data),
      then: (onf: any, onr: any) => promise.then(onf, onr),
      catch: (onc: any) => promise.catch(onc),
      finally: (onf: any) => promise.finally(onf),
    };
    return q;
  }

  const mockDb: any = {
    select: () => ({
      from: (table: any) => queryable(tableData(table)),
    }),
    insert: (table: any) => ({
      values: (values: any) => {
        const row = {
          id: values.id ?? `row-${tableData(table).length + 1}`,
          createdAt: now,
          updatedAt: now,
          ...values,
        };
        tableData(table).push(row);
        const ret = [row];
        return {
          returning: () => Promise.resolve(ret),
          then: (onf: any, onr: any) => Promise.resolve(ret).then(onf, onr),
        };
      },
    }),
    _state: state,
  };
  return mockDb;
}

function seedRun1(db: any) {
  db._state.tasks.push(
    {
      id: TASK_IDENTITY_1,
      researchCaseId: CASE_1,
      taskType: 'identity',
      status: 'completed',
      requiresManualAction: false,
    },
    {
      id: TASK_REGISTRY_1,
      researchCaseId: CASE_1,
      taskType: 'registry',
      status: 'completed',
      requiresManualAction: false,
    }
  );
  db._state.results.push(
    {
      id: 'r-1',
      researchTaskId: TASK_IDENTITY_1,
      propertyId: PROP_ID,
      source: 'admin_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-20T10:00:00.000Z'),
      dataType: 'identity',
      data: { text: 'ACH-1111' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'identity-v1',
    },
    {
      id: 'r-5',
      researchTaskId: TASK_REGISTRY_1,
      propertyId: PROP_ID,
      source: 'sunarp_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-20T10:05:00.000Z'),
      dataType: 'registry',
      data: { partida: 'P01012345' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'sunarp-v1',
    }
  );
}

function seedRun2(db: any) {
  db._state.tasks.push(
    {
      id: TASK_IDENTITY_2,
      researchCaseId: CASE_2,
      taskType: 'identity',
      status: 'completed',
      requiresManualAction: false,
    },
    {
      id: TASK_REGISTRY_2,
      researchCaseId: CASE_2,
      taskType: 'registry',
      status: 'completed',
      requiresManualAction: false,
    },
    {
      id: 'cccccccc-dddd-dddd-dddd-dddddddddddd',
      researchCaseId: CASE_2,
      taskType: 'market',
      status: 'completed',
      requiresManualAction: false,
    },
  );
  db._state.results.push(
    {
      id: 'r-2',
      researchTaskId: TASK_IDENTITY_2,
      propertyId: PROP_ID,
      source: 'admin_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-21T09:00:00.000Z'),
      dataType: 'identity',
      data: { text: 'ACH-1111' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'identity-v1',
    },
    {
      id: 'r-3',
      researchTaskId: TASK_REGISTRY_2,
      propertyId: PROP_ID,
      source: 'sunarp_intake',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-21T09:05:00.000Z'),
      dataType: 'registry',
      data: { partida: 'P01012345', titular: 'JUAN PEREZ' },
      confidence: 'high',
      verification: 'reported',
      parserVersion: 'sunarp-v1',
    },
    {
      id: 'r-4',
      researchTaskId: 'cccccccc-dddd-dddd-dddd-dddddddddddd',
      propertyId: PROP_ID,
      source: 'remaju',
      sourceUrl: null,
      retrievedAt: new Date('2026-09-21T09:10:00.000Z'),
      dataType: 'market',
      data: { value: 120000 },
      confidence: 'medium',
      verification: 'reported',
      parserVersion: 'remaju-v1',
    },
  );
}

function seedCase(db: any, id: string, runNumber: number) {
  db._state.cases.unshift({
    id,
    propertyId: PROP_ID,
    runNumber,
    status: 'completed',
    summary: `Ejecucion ${runNumber}`,
    errorCount: 0,
    warningCount: 0,
    completedTaskCount: runNumber === 1 ? 2 : 3,
    totalTaskCount: 8,
    startedAt: new Date('2026-09-20T09:00:00.000Z'),
    completedAt: new Date('2026-09-21T09:15:00.000Z'),
    createdBy: 'user-altamira',
    createdAt: new Date('2026-09-20T09:00:00.000Z'),
    updatedAt: new Date('2026-09-21T09:15:00.000Z'),
  });
}

describe('RP.3 - Research History', () => {
  // ── Pure helpers ────────────────────────────────────────────────────────
  it('serializeResultData is stable regardless of key order', () => {
    const a = { text: 'X', area: 120 };
    const b = { area: 120, text: 'X' };
    expect(serializeResultData(a)).toBe(serializeResultData(b));
    expect(serializeResultData({ a: 1 })).not.toBe(serializeResultData({ a: 2 }));
    expect(serializeResultData(null)).toBe('null');
  });

  it('diffDataFields lists only the first-level keys whose value changed', () => {
    expect(diffDataFields({ partida: 'P1' }, { partida: 'P1' })).toEqual([]);
    expect(diffDataFields({ partida: 'P1' }, { partida: 'P2' })).toEqual(['partida']);
    expect(
      diffDataFields(
        { partida: 'P1' },
        { partida: 'P2', titular: 'JUAN' }
      )
    ).toEqual(['partida', 'titular']);
  });

  it('diffResults classifies added / removed / edited / unchanged', () => {
    const prev = [
      { taskType: 'identity', source: 'admin_intake', data: { text: 'ACH' }, retrievedAt: '2026-09-20' },
      { taskType: 'registry', source: 'sunarp_intake', data: { partida: 'P1' }, retrievedAt: '2026-09-20' },
    ];
    const cur = [
      { taskType: 'identity', source: 'admin_intake', data: { text: 'ACH' }, retrievedAt: '2026-09-21' },
      { taskType: 'registry', source: 'sunarp_intake', data: { partida: 'P1', titular: 'X' }, retrievedAt: '2026-09-21' },
      { taskType: 'market', source: 'remaju', data: { value: 1 }, retrievedAt: '2026-09-21' },
    ];
    const changes = diffResults(prev, cur);
    const byKey = Object.fromEntries(changes.map((c) => [`${c.taskType}:${c.source}`, c]));

    expect(byKey['identity:admin_intake'].change).toBe('unchanged');
    expect(byKey['identity:admin_intake'].fieldsChanged).toEqual([]);

    expect(byKey['registry:sunarp_intake'].change).toBe('edited');
    expect(byKey['registry:sunarp_intake'].fieldsChanged).toEqual(['titular']);
    expect(byKey['registry:sunarp_intake'].changedAt).toBe('2026-09-21');

    expect(byKey['market:remaju'].change).toBe('added');
    expect(byKey['market:remaju'].changedAt).toBe('2026-09-21');

    expect(changes.some((c) => c.change === 'removed')).toBe(false);
  });

  it('diffResults reports removed sources (info that disappeared)', () => {
    const prev = [
      { taskType: 'registry', source: 'sunarp_intake', data: { partida: 'P1' }, retrievedAt: '2026-09-20' },
    ];
    const cur: { taskType: string; source: string; data: unknown; retrievedAt: string | null }[] = [];
    const changes = diffResults(prev, cur);
    expect(changes).toHaveLength(1);
    expect(changes[0].change).toBe('removed');
    expect(changes[0].source).toBe('sunarp_intake');
    expect(changes[0].changedAt).toBeNull();
  });

  // ── Domain: getPropertyHistory ──────────────────────────────────────────
  it('history: returns null for a property that does not exist', async () => {
    const db = createInMemoryDb();
    const service = new ResearchHistoryService(db);
    const h = await service.getPropertyHistory('99999999-9999-9999-9999-999999999999');
    expect(h).toBeNull();
  });

  it('history: a fresh property has an empty history (no runs/cases)', async () => {
    const db = createInMemoryDb({ withProperty: true });
    const service = new ResearchHistoryService(db);
    const h = await service.getPropertyHistory(PROP_ID);

    if (!h) throw new Error('expected history for existing property');
    expect(h.property.publicId).toBe('PRP-HIST-001');
    expect(h.property.province).toBe('Arequipa');
    expect(h.runs).toEqual([]);
    expect(h.cases).toEqual([]);
  });

  it('history: exposes PROPERTY + ordered RESEARCH_RUNs (no research_runs table used)', async () => {
    const db = createInMemoryDb({ withProperty: true });
    // Seed run 2 BEFORE run 1 to prove the service orders by run_number.
    seedCase(db, CASE_2, 2);
    seedCase(db, CASE_1, 1);
    seedRun1(db);
    seedRun2(db);

    const service = new ResearchHistoryService(db);
    const h = await service.getPropertyHistory(PROP_ID);

    expect(h).not.toBeNull();
    expect(h!.cases.length).toBe(2);
    expect(h!.runs.map((r) => r.runNumber)).toEqual([1, 2]);
    expect(h!.runs[0].caseId).toBe(CASE_1);
    expect(h!.runs[1].caseId).toBe(CASE_2);
    expect(h!.runs[1].createdBy).toBe('user-altamira');
    expect(h!.runs[1].completedTaskCount).toBe(3);
  });

  it('history: detects material changes between consecutive runs', async () => {
    const db = createInMemoryDb({ withProperty: true });
    seedCase(db, CASE_2, 2);
    seedCase(db, CASE_1, 1);
    seedRun1(db);
    seedRun2(db);

    const service = new ResearchHistoryService(db);
    const h = await service.getPropertyHistory(PROP_ID);

    const [run1, run2] = h!.cases;

    // Run 1 introduces information (everything vs. an empty previous run).
    expect(run1.updated).toBe(true);
    expect(run1.changes.every((c) => c.change === 'added')).toBe(true);
    expect(run1.results).toHaveLength(2);
    expect(run1.tasks).toHaveLength(2);
    expect(run1.tasks[0].taskType).toBe('identity');

    // Run 2: identity unchanged, registry edited (titular added), market added.
    expect(run2.results).toHaveLength(3);
    const byKey = Object.fromEntries(run2.changes.map((c) => [`${c.taskType}:${c.source}`, c]));
    expect(byKey['identity:admin_intake'].change).toBe('unchanged');
    expect(byKey['registry:sunarp_intake'].change).toBe('edited');
    expect(byKey['registry:sunarp_intake'].fieldsChanged).toEqual(['titular']);
    expect(byKey['registry:sunarp_intake'].changedAt).toBe('2026-09-21T09:05:00.000Z');
    expect(byKey['market:remaju'].change).toBe('added');
    expect(run2.updated).toBe(true);
    expect(run2.tasks.some((t) => t.taskType === 'market')).toBe(true);
  });

  // ── API contract ────────────────────────────────────────────────────────
  function makeCaseServiceMock() {
    return {
      getCasesByProperty: vi.fn().mockResolvedValue([]),
      getCaseById: vi.fn().mockImplementation(() => Promise.resolve(null)),
      createResearch: vi.fn().mockImplementation(() => Promise.resolve(null)),
      getTasks: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
    };
  }

  async function buildTestApp(db: any, historyService?: ResearchHistoryService) {
    const app = Fastify();
    await app.register((instance) =>
      researchRoutes(instance, {
        service: makeCaseServiceMock() as any,
        db,
        historyService,
      }),
    );
    await app.ready();
    return app;
  }

  it('api: GET /api/v1/properties/:id/history returns the property history', async () => {
    const db = createInMemoryDb({ withProperty: true });
    seedCase(db, CASE_2, 2);
    seedCase(db, CASE_1, 1);
    seedRun1(db);
    seedRun2(db);

    const app = await buildTestApp(db, new ResearchHistoryService(db));
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/properties/${PROP_ID}/history`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.property.publicId).toBe('PRP-HIST-001');
    expect(body.data.runs.map((r: any) => r.runNumber)).toEqual([1, 2]);
    expect(body.data.cases[1].changes.some((c: any) => c.change === 'edited')).toBe(true);
    await app.close();
  });

  it('api: GET /api/v1/properties/:id/history returns 404 for a nonexistent property', async () => {
    const db = createInMemoryDb();
    const app = await buildTestApp(db, new ResearchHistoryService(db));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/properties/99999999-9999-9999-9999-999999999999/history',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});