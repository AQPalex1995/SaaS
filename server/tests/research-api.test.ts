import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { researchRoutes } from '../src/domain/research/routes.js';
import type { ResearchService } from '../src/domain/research/service.js';

// Avoid touching Redis from the POST route.
vi.mock('../src/workers/jobs.js', () => ({
  enqueueGeocoding: vi.fn().mockResolvedValue('geo-job-1'),
  enqueueResearch: vi.fn().mockResolvedValue('research-job-1'),
}));

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const PROP_ID = '22222222-2222-2222-2222-222222222222';

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
    createdBy: 'system',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  };
}

const taskDTO = {
  id: 't-1',
  researchCaseId: CASE_ID,
  taskType: 'identity',
  status: 'pending',
  priority: 'medium',
  startedAt: null,
  completedAt: null,
  error: null,
  requiresManualAction: false,
  manualActionDescription: null,
  retryCount: 0,
  maxRetries: 3,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

const resultDTO = {
  id: 'r-1',
  researchTaskId: 't-1',
  propertyId: PROP_ID,
  source: 'system',
  sourceUrl: null,
  retrievedAt: '2026-09-17T00:00:00.000Z',
  dataType: 'identity',
  data: { publicId: 'PRP-1' },
  rawData: null,
  confidence: 'high',
  verification: 'inferred',
  parserVersion: 'identity-v1',
  metadata: null,
  createdAt: '2026-09-17T00:00:00.000Z',
};

function makeService(overrides: Partial<Record<string, any>> = {}) {
  const service = {
    getCasesByProperty: vi.fn().mockResolvedValue([caseDTO()]),
    getCaseById: vi.fn().mockResolvedValue(caseDTO()),
    createResearch: vi.fn().mockResolvedValue(caseDTO('created')),
    getTasks: vi.fn().mockResolvedValue([taskDTO]),
    getResults: vi.fn().mockResolvedValue([resultDTO]),
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

describe('T3.6 — Research API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/v1/properties/:id/research lists cases for the property', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/properties/${PROP_ID}/research`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(service.getCasesByProperty).toHaveBeenCalledWith(PROP_ID);
    await app.close();
  });

  it('POST /api/v1/properties/:id/research creates a case and marks it queued', async () => {
    const service = makeService({
      getCaseById: vi.fn().mockResolvedValue(caseDTO('queued')),
    });
    const db = makeMockDb('created');
    const app = await buildTestApp(service, db);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/properties/${PROP_ID}/research`,
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('queued');
    expect(service.createResearch).toHaveBeenCalledWith(PROP_ID);
    expect(db._state.status).toBe('queued');
    await app.close();
  });

  it('GET /api/v1/research/:id returns the case', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    const res = await app.inject({ method: 'GET', url: `/api/v1/research/${CASE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe(CASE_ID);
    await app.close();
  });

  it('GET /api/v1/research/:id/tasks returns the tasks', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/research/${CASE_ID}/tasks`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0].taskType).toBe('identity');
    await app.close();
  });

  it('GET /api/v1/research/:id/results returns the results with provenance', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/research/${CASE_ID}/results`,
    });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body).data[0];
    expect(result.source).toBe('system');
    expect(result.parserVersion).toBe('identity-v1');
    expect(result.retrievedAt).toBeTruthy();
    await app.close();
  });

  it('rejects malformed ids with 400 on the research resource routes', async () => {
    const service = makeService();
    const app = await buildTestApp(service);

    for (const url of [
      '/api/v1/research/not-a-uuid',
      '/api/v1/research/not-a-uuid/tasks',
      '/api/v1/research/not-a-uuid/results',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
    }
    await app.close();
  });

  it('returns 404 for unknown but well-formed case ids', async () => {
    const service = makeService({ getCaseById: vi.fn().mockResolvedValue(null) });
    const app = await buildTestApp(service);

    for (const url of [
      `/api/v1/research/${CASE_ID}`,
      `/api/v1/research/${CASE_ID}/tasks`,
      `/api/v1/research/${CASE_ID}/results`,
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });
});