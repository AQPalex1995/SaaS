import { PropertyDataSource, type SourceType } from './base.js';
import { logger } from '../logger.js';

/**
 * ConnectorRegistry — Central registry for all data source connectors.
 *
 * Usage:
 *   registry.register(new SunarpConnector());
 *   const connector = registry.get('sunarp');
 *   const status = await connector.getStatus();
 */
export class ConnectorRegistry {
  private connectors = new Map<SourceType, PropertyDataSource>();

  /**
   * Register a new connector.
   */
  register(connector: PropertyDataSource): void {
    if (this.connectors.has(connector.sourceId)) {
      logger.warn(
        { sourceId: connector.sourceId },
        'Connector already registered, replacing'
      );
    }
    this.connectors.set(connector.sourceId, connector);
    logger.info(
      { sourceId: connector.sourceId, name: connector.sourceName },
      'Connector registered'
    );
  }

  /**
   * Get a connector by source ID.
   */
  get(sourceId: SourceType): PropertyDataSource | undefined {
    return this.connectors.get(sourceId);
  }

  /**
   * Check if a connector is registered.
   */
  has(sourceId: SourceType): boolean {
    return this.connectors.has(sourceId);
  }

  /**
   * List all registered connectors.
   */
  list(): PropertyDataSource[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get status of all registered connectors.
   */
  async getAllStatuses() {
    const results = [];
    for (const connector of this.connectors.values()) {
      try {
        const status = await connector.getStatus();
        results.push(status);
      } catch (err) {
        results.push({
          sourceId: connector.sourceId,
          status: 'error' as const,
          message: `Failed to check status: ${err}`,
          lastChecked: new Date(),
        });
      }
    }
    return results;
  }
}

/** Singleton registry instance */
export const connectorRegistry = new ConnectorRegistry();
