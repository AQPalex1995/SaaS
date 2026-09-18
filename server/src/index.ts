import { buildApp } from './app.js';
import { serverConfig } from './config.js';
import { logger } from './logger.js';
import { connectorRegistry } from './connectors/registry.js';
import { allStubConnectors } from './connectors/stubs/index.js';
import { osmConnector as realOsmConnector } from './connectors/implementations/osm.js';
import { remajuConnector as realRemajuConnector } from './connectors/implementations/remaju.js';
import { closePool, testConnection } from './db/connection.js';
import { closeQueues } from './workers/queue.js';
import { closeStorage } from './storage/index.js';

async function main() {
  logger.info({ config: { port: serverConfig.port, host: serverConfig.host, env: serverConfig.nodeEnv } }, 'Starting Land Intelligence Server...');

  // 1. Register all connectors in the registry
  for (const connector of allStubConnectors) {
    connectorRegistry.register(connector);
  }
  logger.info({ count: allStubConnectors.length }, 'Stub connectors registered');

  // 1b. Override the OpenStreetMap stub with the real Nominatim connector.
  connectorRegistry.register(realOsmConnector);
  logger.info(
    { baseUrl: serverConfig.nominatimUrl },
    'Real OpenStreetMap/Nominatim connector registered'
  );

  // 1c. Override the REM@JU stub with the real public-surface connector (Fase 4).
  connectorRegistry.register(realRemajuConnector);
  logger.info(
    { homeUrl: serverConfig.remajuHomeUrl },
    'Real REM@JU public connector registered'
  );

  // 2. Build Fastify app
  const app = await buildApp();

  // 3. Test DB connection (non-blocking warning if down)
  try {
    const dbTest = await testConnection();
    if (dbTest.connected) {
      logger.info({ postgis: dbTest.postgis }, 'PostgreSQL connection established');
    } else {
      logger.warn('PostgreSQL is not reachable yet. Server will start in degraded mode.');
    }
  } catch (err) {
    logger.warn({ err }, 'Could not connect to PostgreSQL on startup');
  }

  // 4. Start HTTP listening
  try {
    await app.listen({
      port: serverConfig.port,
      host: serverConfig.host,
    });
    logger.info(`Land Intelligence API running on http://${serverConfig.host}:${serverConfig.port}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // 5. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated...');
    try {
      await app.close();
      await closePool();
      await closeQueues();
      await closeStorage();
      logger.info('Server and background resources closed gracefully');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
