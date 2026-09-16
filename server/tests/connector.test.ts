import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry } from '../src/connectors/registry';
import { allStubConnectors, sunarpConnector } from '../src/connectors/stubs/index';
import type { PropertyDataSource } from '../src/connectors/base';

describe('Connector Registry & Stubs', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('should register and retrieve connectors', () => {
    registry.register(sunarpConnector);
    expect(registry.has('sunarp')).toBe(true);
    expect(registry.get('sunarp')).toBe(sunarpConnector);
    expect(registry.list().length).toBe(1);
  });

  it('should register all 14 stub connectors', () => {
    for (const c of allStubConnectors) {
      registry.register(c);
    }
    expect(registry.list().length).toBe(14);
    expect(registry.has('sunarp')).toBe(true);
    expect(registry.has('sunarp_bgr')).toBe(true);
    expect(registry.has('impla')).toBe(true);
    expect(registry.has('pdm')).toBe(true);
    expect(registry.has('cej')).toBe(true);
    expect(registry.has('google_maps')).toBe(true);
  });

  it('should return unavailable status from stub connector', async () => {
    const status = await sunarpConnector.getStatus();
    expect(status.sourceId).toBe('sunarp');
    expect(status.status).toBe('unavailable');
    expect(status.message).toContain('not yet implemented');
  });

  it('should return empty search results from stub connector', async () => {
    const results = await sunarpConnector.search({ query: 'test' });
    expect(results.items).toEqual([]);
    expect(results.totalFound).toBe(0);
    expect(results.source).toBe('sunarp');
  });

  it('should return found=false from stub connector getDetails', async () => {
    const details = await sunarpConnector.getDetails('123');
    expect(details.found).toBe(false);
    expect(details.source).toBe('sunarp');
  });

  it('should collect all statuses from the registry', async () => {
    for (const c of allStubConnectors) {
      registry.register(c);
    }
    const statuses = await registry.getAllStatuses();
    expect(statuses.length).toBe(14);
    for (const s of statuses) {
      expect(s.status).toBe('unavailable');
    }
  });
});
