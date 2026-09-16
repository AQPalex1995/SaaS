import { PropertyDataSource } from '../base.js';
import type {
  ConnectorStatus,
  SearchParams,
  SearchResult,
  SearchResultItem,
  DetailResult,
} from '../base.js';
import { serverConfig } from '../../config.js';
import { logger } from '../../logger.js';

const MIN_GAP_MS = 1_100;

interface NominatimPlace {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  importance?: number;
  display_name: string;
  address?: Record<string, string>;
  boundingbox?: string[];
}

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const gap = Date.now() - lastRequestAt;
  if (gap < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  }
  lastRequestAt = Date.now();
}

async function nominatimGet(
  path: string,
  params: Record<string, string>,
): Promise<NominatimPlace[]> {
  await throttle();
  const base = serverConfig.nominatimUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': serverConfig.osmUserAgent,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
    logger.warn({ retryAfter }, 'Nominatim 429 rate-limited, retrying after delay');
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 3) * 1_000));
    lastRequestAt = 0;
    return nominatimGet(path, params);
  }
  if (!res.ok) {
    throw new Error(`Nominatim ${path} responded ${res.status}`);
  }
  return (await res.json()) as NominatimPlace[];
}

function placeToItem(place: NominatimPlace): SearchResultItem {
  const addr = place.address ?? {};
  const district =
    addr.district || addr.city || addr.town || addr.village || addr.county || undefined;
  return {
    externalId: `osm:${place.osm_type}:${place.osm_id}`,
    sourceUrl: `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`,
    title: place.display_name,
    district,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    rawData: place as unknown as Record<string, unknown>,
  };
}

/**
 * Real OpenStreetMap / Nominatim geocoding connector.
 *
 * Usage policy: max 1 request per second, User-Agent identification required.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
export class OpenStreetMapConnector extends PropertyDataSource {
  readonly sourceId = 'openstreetmap' as const;
  readonly sourceName = 'OpenStreetMap Nominatim';

  async getStatus(): Promise<ConnectorStatus> {
    return {
      sourceId: 'openstreetmap',
      status: 'available',
      message: 'Nominatim geocoding disponible (limitado a 1 req/s)',
      lastChecked: new Date(),
    };
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const query = (params.query || '').trim() || (params.district || '').trim();
    if (!query) {
      return { items: [], totalFound: 0, source: 'openstreetmap', searchedAt: new Date() };
    }
    try {
      const places = await nominatimGet('/search', {
        q: query,
        format: 'jsonv2',
        limit: String(params.limit ?? 5),
        countrycodes: 'pe',
        addressdetails: '1',
        'accept-language': 'es',
      });
      const items = places.map(placeToItem);
      return { items, totalFound: items.length, source: 'openstreetmap', searchedAt: new Date() };
    } catch (err) {
      logger.warn({ err, query }, 'Nominatim search failed');
      return { items: [], totalFound: 0, source: 'openstreetmap', searchedAt: new Date() };
    }
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<SearchResultItem | null> {
    try {
      const place = await nominatimGet('/reverse', {
        lat: String(latitude),
        lon: String(longitude),
        format: 'jsonv2',
        addressdetails: '1',
        'accept-language': 'es',
      });
      const single = Array.isArray(place) ? place[0] : place;
      if (!single || typeof single !== 'object' || 'error' in single) return null;
      return placeToItem(single);
    } catch (err) {
      logger.warn({ err, latitude, longitude }, 'Nominatim reverse geocode failed');
      return null;
    }
  }

  async getDetails(_externalId: string): Promise<DetailResult> {
    return {
      found: false,
      source: 'openstreetmap',
      retrievedAt: new Date(),
      requiresManualAction: false,
    };
  }
}

/** Singleton instance. */
export const osmConnector = new OpenStreetMapConnector();
