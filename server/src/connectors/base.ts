/**
 * Land Intelligence — Connector Base Interface
 *
 * All data source connectors must implement this interface.
 * This is the extension point for adding new sources.
 *
 * IMPORTANT: Connectors MUST NOT:
 * - Bypass CAPTCHA, authentication, or rate limits
 * - Store credentials in code
 * - Make unauthorized requests
 *
 * When a source requires human interaction, the connector should
 * return status: 'requires_manual_action' and describe what's needed.
 */

export type ConnectorStatusValue =
  | 'available'
  | 'unavailable'
  | 'maintenance'
  | 'rate_limited'
  | 'requires_auth'
  | 'error';

export type SourceType =
  | 'facebook_marketplace'
  | 'facebook_group'
  | 'adondevivir'
  | 'urbania'
  | 'remaju'
  | 'sunarp'
  | 'sunarp_bgr'
  | 'sunarp_sprl'
  | 'google_maps'
  | 'openstreetmap'
  | 'impla'
  | 'pdm'
  | 'pat'
  | 'municipality'
  | 'cadastre'
  | 'cej'
  | 'sbn'
  | 'cofopri'
  | 'seace'
  | 'manual'
  | 'other';

export interface ConnectorStatus {
  sourceId: string;
  status: ConnectorStatusValue;
  message?: string;
  lastChecked: Date;
  requiresManualAction?: boolean;
  manualActionDescription?: string;
}

export interface SearchParams {
  query?: string;
  district?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  limit?: number;
}

export interface SearchResultItem {
  externalId: string;
  sourceUrl: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  areaM2?: number;
  district?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  rawData?: Record<string, unknown>;
}

export interface SearchResult {
  items: SearchResultItem[];
  totalFound: number;
  source: SourceType;
  searchedAt: Date;
}

export interface DetailResult {
  found: boolean;
  data?: Record<string, unknown>;
  rawData?: Record<string, unknown>;
  source: SourceType;
  retrievedAt: Date;
  requiresManualAction?: boolean;
  manualActionDescription?: string;
}

/**
 * Abstract base class for all property data source connectors.
 *
 * To create a new connector:
 * 1. Extend this class
 * 2. Implement getStatus(), search(), getDetails()
 * 3. Register in ConnectorRegistry
 */
export abstract class PropertyDataSource {
  abstract readonly sourceId: SourceType;
  abstract readonly sourceName: string;

  /**
   * Check if the source is currently accessible.
   */
  abstract getStatus(): Promise<ConnectorStatus>;

  /**
   * Search for properties in this source.
   */
  abstract search(params: SearchParams): Promise<SearchResult>;

  /**
   * Get detailed information about a specific item.
   */
  abstract getDetails(externalId: string): Promise<DetailResult>;
}
