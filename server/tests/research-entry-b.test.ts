import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { researchRoutes } from '../src/domain/research/routes.js';
import { ResearchService } from '../src/domain/research/service.js';
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
 * RP.2 - Search Property flow (entry B).
 *
 * Acceptance: a ResearchCase can be created for a property with NO Listing
 * (a predio the user registers directly through "Buscar Predio", with no
 * Facebook publication / source). The domain must not require a Listing:
 *  - schema: research_cases FKs to properties only (no listing_id column);
 *  - service: createResearch(propertyId) validates ONLY the property;
 *  - API: POST /api/v1/properties/:id/research accepts a bare property UUID
 *    with no listing payload.
 */

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const PROP_ID = '22222222-2222-2222-2222-222222222222';

const DEFAULT_TASK_TYPES = [
  'identity',
  'geolocation',
  'registry',
  'bgr',
  'urbanism',
  'judicial',
  'market',
  'risk',
];

describe('RP.2 - Search Property flow (entry B: ResearchCase without Listing)', () => {
  // ── Schema contract ─────────────────────────────────────────────────────
  it('schema: research_cases references properties only (no listing_id)', () => {
    const cols = researchCases as unknown as Record<string, unknown>;
    expect(cols.propertyId).toBeDefined();
    expect(cols).not.toHaveProperty('listingId');
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
  function createInMemoryDb(propertyRow?: Record<string, any>) {
    const now = new Date();
    const state = {
      cases: [] as any[],
      tasks: [] as any[],
      properties: propertyRow ? [{ ...propertyRow }] : [],
      results: [] as any[],
      manualActions: [] as any[],
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
      _state: state,
    };
    return mockDb;
  }

  function propertyWithoutListing() {
    return {
      id: PROP_ID,
      publicId: 'PRP-ENTRYB-001',
      title: 'Predio registrado por el usuario (sin publicacion)',
      propertyType: 'terreno',
      district: 'Sachaca',
      address: 'Av. Los Palacios 456',
      latitude: '-16.45',
      longitude: '-71.58',
      locationVerification: 'verified',
      locationSource: 'manual',
      price: null,
      currency: null,
      priceSource: null,
      status: 'active',
    };
  }

  // ── Entry B: service flow ───────────────────────────────────────────────
  it('service: creates a full ResearchCase for a property with NO Listing', async () => {
    const db = createInMemoryDb(propertyWithoutListing());
    const service = new ResearchService(db);

    const researchCase = await service.createResearch(PROP_ID, 'user-altamira');

    expect(researchCase.id).toBeTruthy();
    expect(researchCase.propertyId).toBe(PROP_ID);
    expect(researchCase.status).toBe('created');
    expect(researchCase.runNumber).toBe(1);
    expect((researchCase as any).listingId).toBeUndefined();

    const tasks = await service.getTasks(researchCase.id);
    expect(tasks).toHaveLength(DEFAULT_TASK_TYPES.length);
    const byType = tasks.map((t) => t.taskType).sort();
    expect(byType).toEqual([...DEFAULT_TASK_TYPES].sort());
    for (const t of tasks) {
      expect(t.researchCaseId).toBe(researchCase.id);
      expect(t.status).toBe('pending');
    }

    const viaGet = await service.getCaseById(researchCase.id);
    expect(viaGet?.id).toBe(researchCase.id);
    expect(db._state.cases).toHaveLength(1);
    expect(db._state.tasks).toHaveLength(DEFAULT_TASK_TYPES.length);
  });

  it('service: entry B and entry A converge on the same case shape', async () => {
    const db = createInMemoryDb(propertyWithoutListing());
    const service = new ResearchService(db);

    // A "Buscar Predio" investigation is an independent execution: running it
    // twice on the same predio produces run 1 and run 2 of its history,
    // regardless of the entry (Publication vs direct registration).
    const first = await service.createResearch(PROP_ID);
    const second = await service.createResearch(PROP_ID);

    expect(first.runNumber).toBe(1);
    expect(second.runNumber).toBe(2);
    expect(first.id).not.toBe(second.id);
    expect((first as any).listingId).toBeUndefined();
  });

  it('service: validates ONLY the property existence (no listing involved)', async () => {
    const db = createInMemoryDb(); // no property at all
    const service = new ResearchService(db);

    await expect(
      service.createResearch('99999999-9999-9999-9999-999999999999'),
    ).rejects.toThrow(/not found/);
  });

  // ── Entry B: API contract ───────────────────────────────────────────────
  function caseDTO(status = 'created') {
    return {
      id: CASE_ID,
      propertyId: PROP_ID,
      status,
      summary: null,
      errorCount: 0,
      warningCount: 0,
      completedTaskCount: 0,
      totalTaskCount: 8,
      startedAt: null,
      completedAt: null,
      createdBy: 'user-altamira',
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
    };
  }

  function makeService(overrides: Partial<Record<string, any>> = {}) {
    const service = {
      getCaseById: vi.fn().mockResolvedValue(caseDTO()),
      createResearch: vi.fn().mockResolvedValue(caseDTO('created')),
      ...overrides,
    };
    return service as unknown as ResearchService;
  }

  /** Minimal drizzle-like mock for transitionCase (select + conditional update). */
  function makeMockDb(status = 'created') {
    const state = { status };
    return {
      _state: state,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: CASE_ID, status: state.status }]),
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: () => ({
            returning: () => {
              state.status = values.status;
              return Promise.resolve([{ id: CASE_ID }]);
            },
          }),
        }),
      }),
    } as any;
  }

  async function buildTestApp(service: ResearchService, db: any = makeMockDb()) {
    const app = Fastify();
    await app.register((instance) => researchRoutes(instance, { service, db }));
    await app.ready();
    return app;
  }

  it('api: POST /api/v1/properties/:id/research creates a case for a bare property UUID', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/properties/${PROP_ID}/research`,
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.propertyId).toBe(PROP_ID);
    // Entry B: the request carried no listing/publication identifier — the only
    // input is the property the user asked to investigate.
    expect(service.createResearch).toHaveBeenCalledWith(PROP_ID);
    expect((body.data as Record<string, unknown>).listingId).toBeUndefined();
    await app.close();
  });
});