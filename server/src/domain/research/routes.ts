import type { FastifyInstance } from 'fastify';
import { ResearchService } from './service.js';
import {
  resolveSqliteListing,
  isUuid,
  type ScoutListingRow,
  openScoutDb,
} from '../../domain/ingestion/sync.js';
import { serverConfig } from '../../config.js';
import { enqueueGeocoding, enqueueResearch } from '../../workers/jobs.js';

export async function researchRoutes(app: FastifyInstance) {
  const service = new ResearchService();

  /**
   * Resolve the `:id` param to a PostgreSQL property UUID.
   * UUID ids pass through (must exist as a Property).
   * Legacy SQLite/external ids are resolved on-the-fly (created if needed).
   */
  async function resolvePropertyId(id: string): Promise<string | null> {
    if (isUuid(id)) return id;
    return resolveSqliteListing(id);
  }

  async function lookupSqliteListing(id: string): Promise<ScoutListingRow | null> {
    try {
      const reader = await openScoutDb(serverConfig.scoutDbPath);
      const row = reader.find(id);
      reader.close();
      return row;
    } catch {
      return null;
    }
  }

  // GET /api/v1/properties/:id/research
  app.get('/api/v1/properties/:id/research', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (isUuid(id)) {
      const cases = await service.getCasesByProperty(id);
      return reply.send({ data: cases });
    }
    const propertyId = await resolveSqliteListing(id);
    if (!propertyId) {
      return reply.status(404).send({
        error: `Publicación '${id}' no encontrada en data/scout.db ni en PostgreSQL`,
      });
    }
    const cases = await service.getCasesByProperty(propertyId);
    return reply.send({ data: cases, resolvedPropertyId: propertyId });
  });

  // POST /api/v1/properties/:id/research
  app.post('/api/v1/properties/:id/research', async (request, reply) => {
    const { id } = request.params as { id: string };

    let propertyId: string | null = id;

    if (!isUuid(id)) {
      propertyId = id && (await resolveSqliteListing(id));
      if (!propertyId) {
        const listing = await lookupSqliteListing(id);
        return reply.status(404).send({
          error: listing
            ? 'No se pudo sincronizar la publicación con PostgreSQL'
            : `Publicación '${id}' no encontrada en data/scout.db. Sincronízala con: npm run sync:sqlite`,
        });
      }
    }

    try {
      const researchCase = await service.createResearch(propertyId!);

      // Kick off async work (best-effort; Redis may be down).
      await Promise.allSettled([
        enqueueGeocoding(propertyId!),
        enqueueResearch(propertyId!, researchCase.id),
      ]);

      return reply.status(201).send({
        data: researchCase,
        resolvedPropertyId: propertyId !== id ? propertyId : undefined,
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // GET /api/v1/research/:id
  app.get('/api/v1/research/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const researchCase = await service.getCaseById(id);
    if (!researchCase) {
      return reply.status(404).send({ error: 'Research case not found' });
    }
    return reply.send({ data: researchCase });
  });

  // GET /api/v1/research/:id/tasks
  app.get('/api/v1/research/:id/tasks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tasks = await service.getTasks(id);
    return reply.send({ data: tasks });
  });

  // GET /api/v1/research/:id/results
  app.get('/api/v1/research/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string };
    const results = await service.getResults(id);
    return reply.send({ data: results });
  });
}