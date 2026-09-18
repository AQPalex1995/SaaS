import type { FastifyInstance } from 'fastify';
import { MonitoringService, type QueueReporter } from './monitoring.service.js';
import { getDb, type Database } from '../../db/connection.js';

export interface MonitoringRoutesDeps {
  service?: MonitoringService;
  db?: Database;
  queueReporter?: QueueReporter;
}

export async function monitoringRoutes(app: FastifyInstance, deps: MonitoringRoutesDeps = {}) {
  const service = deps.service ?? new MonitoringService(deps.db ?? getDb());

  // GET /api/v1/monitoring/operations — operational summary (manual cycle, judicial pipeline, stuck work)
  app.get('/api/v1/monitoring/operations', async (_request, reply) => {
    const summary = await service.getOperationsSummary();
    return reply.send({ data: summary });
  });

  // GET /api/v1/monitoring/queues — BullMQ queue depths (degrades if Redis unavailable)
  app.get('/api/v1/monitoring/queues', async (_request, reply) => {
    const status = await service.getQueueStatus(deps.queueReporter);
    return reply.send({ data: status });
  });
}
