import type { FastifyInstance } from 'fastify';
import { PropertyService } from './service.js';

/**
 * Property API routes — /api/v1/properties
 */
export async function propertyRoutes(app: FastifyInstance) {
  const service = new PropertyService();

  // GET /api/v1/properties
  app.get('/api/v1/properties', async (request, reply) => {
    const { page = '1', per_page = '20' } = request.query as Record<string, string>;
    const result = await service.list(
      parseInt(page, 10),
      Math.min(100, parseInt(per_page, 10))
    );
    return reply.send(result);
  });

  // GET /api/v1/properties/:id
  app.get('/api/v1/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = await service.getById(id);
    if (!property) {
      return reply.status(404).send({ error: 'Property not found' });
    }
    return reply.send({ data: property });
  });

  // POST /api/v1/properties
  app.post('/api/v1/properties', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const property = await service.create(body);
    return reply.status(201).send({ data: property });
  });

  // GET /api/v1/properties/:id/listings
  app.get('/api/v1/properties/:id/listings', async (request, reply) => {
    const { id } = request.params as { id: string };
    const listings = await service.getListings(id);
    return reply.send({ data: listings });
  });

  // GET /api/v1/properties/:id/scores — NOT YET IMPLEMENTED
  app.get('/api/v1/properties/:id/scores', async (_request, reply) => {
    return reply.send({
      status: 'not_implemented',
      message: 'Property scoring is prepared but not yet implemented',
      plannedFor: 'Phase 3 - Market Intelligence',
    });
  });

  // GET /api/v1/properties/:id/alerts — NOT YET IMPLEMENTED
  app.get('/api/v1/properties/:id/alerts', async (_request, reply) => {
    return reply.send({
      status: 'not_implemented',
      message: 'Property alerts are prepared but not yet implemented',
      plannedFor: 'Phase 3 - Risk Analysis',
    });
  });
}
