import { describe, it, expect, vi, afterEach } from 'vitest';
import { osmConnector } from '../src/connectors/implementations/osm';

/** Build a fake fetch that simulates a Nominatim response. */
function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    const res = new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenStreetMap connector (fetch-stubbed)', () => {
  it('has sourceId openstreetmap and is available', async () => {
    expect(osmConnector.sourceId).toBe('openstreetmap');
    const status = await osmConnector.getStatus();
    expect(status.status).toBe('available');
  });

  it('search returns items mapped from Nominatim places', async () => {
    const fetchFn = stubFetch([
      {
        place_id: 1,
        osm_type: 'node',
        osm_id: 42,
        lat: '-16.4090',
        lon: '-71.5371',
        display_name: 'Zonai, Miraflores, Arequipa, Perú',
        address: { district: 'Miraflores' },
      },
    ]);

    const result = await osmConnector.search({ query: 'Miraflores, Arequipa, Perú', limit: 3 });

    expect(result.totalFound).toBe(1);
    expect(result.source).toBe('openstreetmap');
    expect(result.items[0].externalId).toBe('osm:node:42');
    expect(result.items[0].latitude).toBe(-16.409);
    expect(result.items[0].longitude).toBe(-71.5371);
    expect(result.items[0].district).toBe('Miraflores');
    expect(result.items[0].sourceUrl).toContain('openstreetmap.org/node/42');

    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain('/search');
    expect(url).toContain('countrycodes=pe');
    expect(url).toContain('q=Miraflores');
  });

  it('search returns empty for a blank query without calling the network', async () => {
    const fetchFn = stubFetch([]);
    const result = await osmConnector.search({});
    expect(result.items).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('search degrades to empty on upstream errors', async () => {
    stubFetch({ error: 'Internal error' }, 500);
    const result = await osmConnector.search({ query: 'Yanahuara, Arequipa' });
    expect(result.items).toEqual([]);
    expect(result.totalFound).toBe(0);
  });

  it('reverseGeocode handles the single-object /reverse response shape', async () => {
    // /reverse returns ONE object, not an array (regression guard).
    stubFetch({
      place_id: 7,
      osm_type: 'way',
      osm_id: 91,
      lat: '-16.39',
      lon: '-71.50',
      display_name: 'Cayma, Arequipa, Perú',
      address: { district: 'Cayma' },
    });

    const item = await osmConnector.reverseGeocode(-16.39, -71.5);
    expect(item).not.toBeNull();
    expect(item!.externalId).toBe('osm:way:91');
    expect(item!.district).toBe('Cayma');
  });

  it('reverseGeocode returns null when Nominatim answers with an error object', async () => {
    stubFetch({ error: 'Unable to geocode' }, 200);
    const item = await osmConnector.reverseGeocode(0, 0);
    expect(item).toBeNull();
  });

  it('getDetails reports not found without fabricating data', async () => {
    const details = await osmConnector.getDetails('osm:node:42');
    expect(details.found).toBe(false);
    expect(details.source).toBe('openstreetmap');
    expect(details.requiresManualAction).toBe(false);
  });
});