import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../src/app.js';
import { MonitoringService } from '../src/domain/monitoring/monitoring.service.js';
import { monitoringRoutes } from '../src/domain/monitoring/routes.js';
import type { QueueName } from '../src/workers/queue.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

describe('T4.9 — monitoring routes', () => {
  it('GET /api/v1/monitoring/operations devuelve el resumen operacional', async () => {
    const { db } = createInMemoryDb({
      manualActions: [
        { id: 'ma-1', status: 'completed', requestedAt: new Date(), completedAt: new Date() },
        { id: 'ma-2', status: 'requested', requestedAt: new Date() },
      ],
      tasks: [
        { id: 'task-j', taskType: 'judicial', status: 'completed' },
        { id: 'task-reg', taskType: 'registry', status: 'completed' },
      ],
      results: [{ id: 'r1', dataType: 'judicial', source: 'manual', parserVersion: 'manual-v1' }],
    });

    const app = await buildApp({ enableLogging: false, monitoringService: new MonitoringService(db) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/monitoring/operations' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.manualCycle).toMatchObject({ total: 2, completed: 1, requested: 1 });
    expect(body.data.judicialPipeline.tasks.total).toBe(1);
    expect(body.data.judicialPipeline.resultsBySource).toEqual({ manual: 1 });
    await app.close();
  });

  it('GET /api/v1/monitoring/queues reporta profundidades con reporter inyectado', async () => {
    const { db } = createInMemoryDb();
    const app = Fastify({ logger: false });
    await app.register(monitoringRoutes, {
      service: new MonitoringService(db),
      queueReporter: async (name: QueueName) =>
        name === 'research'
          ? { waiting: 3, active: 1, delayed: 0, completed: 9, failed: 0, paused: 0 }
          : null,
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/monitoring/queues' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.connected).toBe(true);
    expect(body.data.queues.research).toMatchObject({ waiting: 3, completed: 9 });
    await app.close();
  });
});