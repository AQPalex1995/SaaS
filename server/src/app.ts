import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { serverConfig } from './config.js';
import { logger } from './logger.js';
import { testConnection } from './db/connection.js';
import { testRedis } from './workers/queue.js';
import { propertyRoutes } from './domain/properties/routes.js';
import { researchRoutes } from './domain/research/routes.js';
import { dossierRoutes } from './domain/dossier/routes.js';
import { remateIntakeRoutes } from './domain/research/remate-intake.routes.js';
import type { RemateIntakeService } from './domain/research/remate-intake.service.js';
import { sourceRoutes } from './connectors/routes.js';
import { monitoringRoutes } from './domain/monitoring/routes.js';
import type { MonitoringService } from './domain/monitoring/monitoring.service.js';

export interface AppOptions {
  enableLogging?: boolean;
  /** Injectable REM@JU intake service (tests). */
  remateIntakeService?: RemateIntakeService;
  /** Injectable operations monitoring service (tests). */
  monitoringService?: MonitoringService;
}

/**
 * Fastify application factory
 */
export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    loggerInstance: options.enableLogging !== false ? (logger as any) : undefined,
    // Correlate every request across API/worker/database logs.
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) || randomUUID(),
    requestIdHeader: 'x-request-id',
  });

  const corsOrigins = serverConfig.corsOrigins.length > 0 ? serverConfig.corsOrigins : true;

  // Enable CORS
  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Tolerate POSTs that set Content-Type: application/json without a body
  // (e.g. the Scout panel triggering research). Default Fastify rejects
  // empty JSON bodies with FST_ERR_CTP_EMPTY_JSON_BODY -> 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const trimmed = typeof body === 'string' ? body.trim() : '';
      done(null, trimmed ? JSON.parse(trimmed) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  // Echo the request id back so callers can correlate logs end-to-end.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Health checks
  app.get('/health', async (_request, reply) => {
    const dbStatus = await testConnection();
    const redisStatus = await testRedis();

    const isHealthy = dbStatus.connected;
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'land-intelligence-server',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus.connected,
        postgis: dbStatus.postgis,
        version: dbStatus.version,
      },
      redis: {
        connected: redisStatus,
      },
    });
  });

  app.get('/api/health', async (request, reply) => {
    return app.inject({ method: 'GET', url: '/health' }).then((res) => {
      reply.status(res.statusCode).headers(res.headers).send(res.body);
    });
  });

  // Register domain routes
  await app.register(propertyRoutes);
  await app.register(researchRoutes);
  await app.register(dossierRoutes);
  await app.register(remateIntakeRoutes, { service: options.remateIntakeService });
  await app.register(sourceRoutes);
  await app.register(monitoringRoutes, { service: options.monitoringService });

  // Global error handler
  app.setErrorHandler((error: any, _request, reply) => {
    logger.error({ err: error }, 'Unhandled server error');
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
      statusCode,
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: 'NotFound',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return app;
}
