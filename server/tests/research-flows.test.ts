import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResearchOrchestrator,
} from '../src/domain/research/orchestrator.js';
import { ResearchService } from '../src/domain/research/service.js';
import { transitionTask } from '../src/domain/research/task-lifecycle.js';
import { updateCaseProgress } from '../src/domain/research/lifecycle.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import {
  properties,
  researchCases,
  researchTasks,
  researchResults,
  manualActions,
  auditLogs,
} from '../src/db/schema/index.js';

/**
 * T3.8 — Research flow integration tests.
 *
 * These tests exercise the real orchestrator / lifecycle / service code against
 * an in-memory drizzle-like database that evaluates WHERE predicates, so we can
 * assert the end-to-end outcome of each research scenario described in the plan:
 *   full / partial / failed task / unavailable source / retry /
 *   duplicate research / manual action / timeout.
 */

const CASE_ID = '00000000-0000-0000-0000-000000000001';
const PROP_ID = '00000000-0000-0000-0000-000000000002';

describe('T3.8 — Research flows', () => {
  beforeEach(() => {
    for (const c of allStubConnectors) connectorRegistry.register(c);
  });

  // ── Drizzle WHERE predicate evaluation over in-memory rows ──────────────
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

  // ── In-memory database ──────────────────────────────────────────────────
  function createInMemoryDb(seed: {
    cases?: any[];
    tasks?: any[];
    property?: any;
    results?: any[];
    manualActions?: any[];
  }) {
    const now = new Date();
    const state = {
      cases: (seed.cases ?? []).map((c) => ({
        summary: null,
        errorCount: 0,
        warningCount: 0,
        completedTaskCount: 0,
        totalTaskCount: 0,
        startedAt: null,
        completedAt: null,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now,
        ...c,
      })),
      tasks: (seed.tasks ?? []).map((t) => ({
        priority: 'medium',
        startedAt: null,
        completedAt: null,
        error: null,
        requiresManualAction: false,
        manualActionDescription: null,
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        updatedAt: now,
        ...t,
      })),
      properties: seed.property ? [{ ...seed.property }] : [],
      results: (seed.results ?? []).map((r) => ({ ...r })),
      manualActions: (seed.manualActions ?? []).map((a) => ({
        actionKind: 'user_action',
        status: 'requested',
        url: null,
        source: null,
        requestedAt: now,
        completedAt: null,
        completedBy: null,
        result: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
        ...a,
      })),
      auditLogs: [] as any[],
    };

    let idSeq = 0;
    const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

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
          const prefix =
            table === researchCases
              ? 'case'
              : table === researchTasks
                ? 'task'
                : table === researchResults
                  ? 'res'
                  : table === manualActions
                    ? 'ma'
                    : 'row';
          const row = {
            id: values.id ?? nextId(prefix),
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
      update: (table: any) => ({
        set: (values: any) => ({
          where: (pred: any) => {
            const rows = tableData(table);
            const matched = rows.filter((r) => evalWhere(pred, r));
            for (const r of matched) Object.assign(r, values);
            const ret = matched.map((r) => ({ id: r.id }));
            return {
              returning: () => Promise.resolve(ret),
              then: (onf: any, onr: any) => Promise.resolve(ret).then(onf, onr),
              catch: (onc: any) => Promise.resolve(ret).catch(onc),
              finally: (onf: any) => Promise.resolve(ret).finally(onf),
            };
          },
        }),
      }),
      _state: state,
    };
    return mockDb;
  }

  // ── Fixture builders ────────────────────────────────────────────────────
  function property(overrides: Record<string, any> = {}) {
    return {
      id: PROP_ID,
      publicId: 'PROP-001',
      title: 'Terreno en Cayma',
      propertyType: 'terreno',
      district: 'Cayma',
      address: 'Av. Cayma 123',
      latitude: '-16.38',
      longitude: '-71.55',
      locationVerification: 'verified',
      locationSource: 'openstreetmap',
      price: '150000',
      currency: 'USD',
      priceSource: 'facebook_marketplace',
      status: 'active',
      ...overrides,
    };
  }

  function caseRow(status = 'created', totalTaskCount = 1) {
    return {
      id: CASE_ID,
      propertyId: PROP_ID,
      status,
      totalTaskCount,
    };
  }

  function task(id: string, taskType: string, status = 'pending') {
    return { id, researchCaseId: CASE_ID, taskType, status };
  }

  const ALL_TASKS = [
    'identity',
    'geolocation',
    'registry',
    'bgr',
    'urbanism',
    'judicial',
    'market',
    'risk',
  ];

  // ── 1. Full research ────────────────────────────────────────────────────
  it('completes a full 8-task research when no task fails', async () => {
    const tasks = ALL_TASKS.map((t) => task(`task-${t}`, t));
    const db = createInMemoryDb({
      cases: [caseRow('created', 8)],
      tasks,
      property: property(),
    });

    const orchestrator = new ResearchOrchestrator(db, {
      // REM@JU con carrusel vacío en test: sin remates públicos → se completa
      // con 'Sin información' (sin peticiones de red en la suite).
      remajuSearch: async () => ({
        items: [],
        totalFound: 0,
        source: 'remaju',
        searchedAt: new Date(),
      }),
    });
    const result = await orchestrator.executeCase(CASE_ID);

    expect(result.status).toBe('completed');
    expect(result.completedTasks).toBe(8);
    expect(result.totalTasks).toBe(8);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(5); // 3 conectores stub (registry/bgr/urbanism) + market + risk
    expect(result.summary).toBe('Caso completado correctamente');

    const byType = Object.fromEntries(db._state.tasks.map((t: any) => [t.taskType, t.status]));
    expect(byType.identity).toBe('completed');
    expect(byType.geolocation).toBe('skipped'); // coordinates already verified
    expect(byType.registry).toBe('unavailable');
    expect(byType.judicial).toBe('completed'); // carrusel público REM@JU sin remates
    expect(byType.risk).toBe('unavailable');

    // identity + geolocation (skipped, still recorded) persist provenance rows
    expect(db._state.results.length).toBe(2);
    for (const r of db._state.results) {
      expect(r.retrievedAt).toBeInstanceOf(Date);
      expect(typeof r.source).toBe('string');
    }
  });

  // ── 2. Partial research ─────────────────────────────────────────────────
  it('lands the case on partial when one task fails but others complete', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('created', 2)],
      tasks: [task('task-identity', 'identity'), task('task-registry', 'registry')],
      property: property(),
    });

    const orchestrator = new ResearchOrchestrator(db);
    const original = orchestrator.executeTask.bind(orchestrator);
    orchestrator.executeTask = vi.fn().mockImplementation(async (t: any, pId: string) => {
      if (t.id === 'task-registry') throw new Error('SUNARP no responde');
      return original(t, pId);
    });

    const result = await orchestrator.executeCase(CASE_ID, { skipGeolocation: true });

    expect(result.status).toBe('partial');
    expect(result.errorCount).toBe(1);
    expect(result.completedTasks).toBe(2);
    expect(result.summary).toContain('parcial');
    const identity = db._state.tasks.find((t: any) => t.id === 'task-identity');
    expect(identity.status).toBe('completed');
    expect(db._state.results.length).toBe(1);
  });

  // ── 3. Failed task ──────────────────────────────────────────────────────
  it('records the error on a failed task without aborting the case', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('created', 1)],
      tasks: [task('task-registry', 'registry')],
      property: property(),
    });

    const orchestrator = new ResearchOrchestrator(db);
    orchestrator.executeTask = vi.fn().mockRejectedValue(new Error('SUNARP no responde'));

    const result = await orchestrator.executeCase(CASE_ID);

    const failed = db._state.tasks[0];
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('SUNARP no responde');
    expect(failed.completedAt).toBeInstanceOf(Date);
    expect(result.errorCount).toBe(1);
    expect(result.status).toBe('partial');
  });

  // ── 4. Unavailable source ───────────────────────────────────────────────
  it('marks tasks on unimplemented sources as unavailable, counting as warnings', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('created', 2)],
      tasks: [task('task-identity', 'identity'), task('task-registry', 'registry')],
      property: property(),
    });

    const orchestrator = new ResearchOrchestrator(db);
    const result = await orchestrator.executeCase(CASE_ID, { skipGeolocation: true });

    const registry = db._state.tasks.find((t: any) => t.taskType === 'registry');
    expect(registry.status).toBe('unavailable');
    expect(registry.error).toContain('not yet implemented');
    expect(result.warningCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.status).toBe('completed');
  });

  // ── 5. Retry ────────────────────────────────────────────────────────────
  it('re-opens a failed task for retry, bumping retryCount and clearing completion', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('running', 1)],
      tasks: [
        {
          ...task('task-registry', 'registry', 'failed'),
          error: 'timeout',
          completedAt: new Date(),
          retryCount: 0,
        },
      ],
      property: property(),
    });

    await transitionTask(db, 'task-registry', 'running');

    const task_ = db._state.tasks[0];
    expect(task_.status).toBe('running');
    expect(task_.retryCount).toBe(1);
    expect(task_.completedAt).toBeNull();
    expect(task_.startedAt).toBeInstanceOf(Date);
  });

  // ── 6. Duplicate research ────────────────────────────────────────────────
  it('creates an independent case for every createResearch call (no implicit dedup)', async () => {
    const db = createInMemoryDb({ property: property() });
    const service = new ResearchService(db);

    const first = await service.createResearch(PROP_ID, 'tester');
    const second = await service.createResearch(PROP_ID, 'tester');

    expect(first.id).not.toBe(second.id);
    // Case/Run separation (RP.1): each createResearch is an independent
    // execution — run 1 then run 2 in the property's history (runNumber).
    expect(first.runNumber).toBe(1);
    expect(second.runNumber).toBe(2);
    expect(db._state.cases.length).toBe(2);
    expect(db._state.tasks.length).toBe(16); // 8 tasks per case
    expect(db._state.tasks.filter((t: any) => t.researchCaseId === first.id).length).toBe(8);
    expect(db._state.tasks.filter((t: any) => t.researchCaseId === second.id).length).toBe(8);
  });

  // ── 7. Manual action ─────────────────────────────────────────────────────
  it('requests a manual action for a geolocation task without address/district', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('created', 1)],
      tasks: [task('task-geo', 'geolocation')],
      property: property({
        district: null,
        address: null,
        latitude: null,
        longitude: null,
        locationVerification: 'unverified',
        locationSource: null,
      }),
    });

    const orchestrator = new ResearchOrchestrator(db);
    const result = await orchestrator.executeCase(CASE_ID);

    const geoTasks = db._state.tasks[0];
    expect(geoTasks.status).toBe('requires_manual_action');
    expect(geoTasks.requiresManualAction).toBe(true);
    expect(db._state.manualActions.length).toBe(1);
    expect(db._state.manualActions[0].researchTaskId).toBe('task-geo');
    expect(db._state.manualActions[0].instructions).toContain('Sin dirección');

    // A settled task waiting on a human does not leave the case running.
    expect(result.status).toBe('completed');
    expect(result.warningCount).toBe(1);
  });

  // ── 8. Timeout ───────────────────────────────────────────────────────────
  it('isolates a timed-out source and keeps processing the remaining tasks', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('created', 2)],
      tasks: [task('task-identity', 'identity'), task('task-registry', 'registry')],
      property: property(),
    });

    const orchestrator = new ResearchOrchestrator(db);
    const original = orchestrator.executeTask.bind(orchestrator);
    let calls = 0;
    orchestrator.executeTask = vi.fn().mockImplementation(async (t: any, pId: string) => {
      calls++;
      if (t.id === 'task-registry') {
        throw new Error('ETIMEDOUT: upstream source did not respond within 30000ms');
      }
      return original(t, pId);
    });

    const result = await orchestrator.executeCase(CASE_ID, { skipGeolocation: true });

    expect(calls).toBe(2); // both tasks were attempted
    const registry = db._state.tasks.find((t: any) => t.id === 'task-registry');
    expect(registry.status).toBe('failed');
    expect(registry.error).toContain('ETIMEDOUT');
    expect(result.status).toBe('partial');
  });

  // ── Progress computation edge: all tasks failed ──────────────────────────
  it('marks a case partial (not failed) when every task failed', async () => {
    const db = createInMemoryDb({
      cases: [caseRow('running', 2)],
      tasks: [
        { ...task('task-a', 'registry', 'failed') },
        { ...task('task-b', 'judicial', 'failed') },
      ],
      property: property(),
    });

    await updateCaseProgress(db, CASE_ID);

    expect(db._state.cases[0].status).toBe('partial');
    expect(db._state.cases[0].errorCount).toBe(2);
  });
});
