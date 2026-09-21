import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { DossierService } from './service.js';
import { getDb, type Database } from '../../db/connection.js';
import {
  resolveSqliteListing,
  isUuid,
} from '../../domain/ingestion/sync.js';

export interface DossierRoutesDeps {
  /** Injectable for tests; defaults to a real DossierService. */
  service?: DossierService;
  db?: Database;
}

const EXPEDIENTE_HTML = readFileSync(new URL('./expediente.html', import.meta.url), 'utf-8');

/**
 * RP.4 — Property Dossier routes.
 *
 * - `GET /api/v1/properties/:id/dossier`: expediente agregado del predio
 *   (las 11 secciones de docs/UX_ARCHITECTURE.md §3).
 * - `GET /investigaciones/:id`: página del expediente (sirve el HTML estático
 *   que consume el endpoint anterior). Es la vista RESULTADO del producto,
 *   independiente del Drawer del Scout Legacy (src/).
 */
export async function dossierRoutes(
  app: FastifyInstance,
  deps: DossierRoutesDeps = {},
) {
  const db = deps.db ?? getDb();
  const service = deps.service ?? new DossierService(db);

  /**
   * Resolve `:id` to a PostgreSQL property UUID.
   * UUID ids pass through; legacy SQLite/external ids resolve on-the-fly.
   */
  async function resolvePropertyId(id: string): Promise<string | null> {
    if (isUuid(id)) return id;
    return resolveSqliteListing(id);
  }

  // GET /api/v1/properties/:id/dossier
  app.get('/api/v1/properties/:id/dossier', async (request, reply) => {
    const { id } = request.params as { id: string };
    const propertyId = await resolvePropertyId(id);
    if (!propertyId) {
      return reply.status(404).send({
        error: `Publicación '${id}' no encontrada en data/scout.db ni en PostgreSQL`,
      });
    }
    const dossier = await service.getPropertyDossier(propertyId);
    if (!dossier) {
      return reply.status(404).send({ error: 'Property not found' });
    }
    return reply.send({ data: dossier });
  });

  // GET /investigaciones/:id — expediente propio (vista RESULTADO).
  app.get('/investigaciones/:id', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(EXPEDIENTE_HTML);
  });
}