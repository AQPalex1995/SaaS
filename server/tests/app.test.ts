import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import { connectorRegistry } from '../src/connectors/registry';
import { allStubConnectors } from '../src/connectors/stubs/index';

describe('Fastify App API & Routes', () => {
  let app: any;

  beforeAll(async () => {
    for (const c of allStubConnectors) {
      connectorRegistry.register(c);
    }
    app = await buildApp({ enableLogging: false });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health should return service health info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect([200, 503]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.service).toBe('land-intelligence-server');
    expect(body.version).toBe('0.1.0');
    expect(body.database).toBeDefined();
    expect(body.redis).toBeDefined();
  });

  it('GET /api/v1/sources should return all 14 connectors', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sources',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(14);
    const sunarp = body.data.find((s: any) => s.sourceId === 'sunarp');
    expect(sunarp).toBeDefined();
    expect(sunarp.status).toBe('unavailable');
  });

  it('GET /api/v1/sources/:id should return single connector status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sources/sunarp',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sourceId).toBe('sunarp');
    expect(body.data.status).toBe('unavailable');
  });

  it('GET /api/v1/sources/unknown_source should return 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sources/non_existent_source',
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/properties/:id/scores should return not_implemented notice', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/properties/00000000-0000-0000-0000-000000000000/scores',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('not_implemented');
    expect(body.plannedFor).toContain('Phase 3');
  });

  it('GET /api/v1/properties/:id/alerts should return not_implemented notice', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/properties/00000000-0000-0000-0000-000000000000/alerts',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('not_implemented');
    expect(body.plannedFor).toContain('Phase 3');
  });

  it('404 for non-existent route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/non-existent-route-xyz',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('NotFound');
  });
});
