import type { FastifyInstance } from 'fastify';
import { connectorRegistry } from './registry.js';
import type { SourceType } from './base.js';

/**
 * Sources / Connectors API routes — /api/v1/sources
 */
export async function sourceRoutes(app: FastifyInstance) {
  // GET /api/v1/sources
  app.get('/api/v1/sources', async (_request, reply) => {
    const statuses = await connectorRegistry.getAllStatuses();
    return reply.send({ data: statuses });
  });

  // GET /api/v1/sources/:id
  app.get('/api/v1/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const connector = connectorRegistry.get(id as SourceType);
    if (!connector) {
      return reply.status(404).send({ error: `Source '${id}' not found` });
    }
    const status = await connector.getStatus();
    return reply.send({ data: status });
  });
}
