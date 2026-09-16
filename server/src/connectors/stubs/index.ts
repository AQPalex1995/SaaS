import {
  PropertyDataSource,
  type ConnectorStatus,
  type SearchParams,
  type SearchResult,
  type DetailResult,
  type SourceType,
} from '../base.js';

/**
 * Creates a stub connector that returns 'unavailable' for all operations.
 * These are placeholders for future connector implementations.
 */
function createStubConnector(sourceId: SourceType, name: string): PropertyDataSource {
  return {
    sourceId,
    sourceName: name,

    async getStatus(): Promise<ConnectorStatus> {
      return {
        sourceId,
        status: 'unavailable',
        message: `${name} connector is not yet implemented`,
        lastChecked: new Date(),
      };
    },

    async search(_params: SearchParams): Promise<SearchResult> {
      return {
        items: [],
        totalFound: 0,
        source: sourceId,
        searchedAt: new Date(),
      };
    },

    async getDetails(_externalId: string): Promise<DetailResult> {
      return {
        found: false,
        source: sourceId,
        retrievedAt: new Date(),
      };
    },
  } as PropertyDataSource;
}

// ── Stub connectors for future implementation ───────────────
export const sunarpConnector = createStubConnector('sunarp', 'SUNARP Conoce Aquí');
export const sunarpBgrConnector = createStubConnector('sunarp_bgr', 'SUNARP Base Gráfica Registral');
export const sunarpSprlConnector = createStubConnector('sunarp_sprl', 'SUNARP SPRL');
export const remajuConnector = createStubConnector('remaju', 'REM@JU');
export const googleMapsConnector = createStubConnector('google_maps', 'Google Maps');
export const osmConnector = createStubConnector('openstreetmap', 'OpenStreetMap');
export const implaConnector = createStubConnector('impla', 'IMPLA Arequipa');
export const pdmConnector = createStubConnector('pdm', 'Plan de Desarrollo Metropolitano');
export const municipalityConnector = createStubConnector('municipality', 'Municipalidades');
export const cadastreConnector = createStubConnector('cadastre', 'Catastro');
export const cejConnector = createStubConnector('cej', 'Poder Judicial CEJ');
export const sbnConnector = createStubConnector('sbn', 'SBN');
export const cofopriConnector = createStubConnector('cofopri', 'COFOPRI');
export const seaceConnector = createStubConnector('seace', 'SEACE');

/** All stub connectors for bulk registration */
export const allStubConnectors = [
  sunarpConnector,
  sunarpBgrConnector,
  sunarpSprlConnector,
  remajuConnector,
  googleMapsConnector,
  osmConnector,
  implaConnector,
  pdmConnector,
  municipalityConnector,
  cadastreConnector,
  cejConnector,
  sbnConnector,
  cofopriConnector,
  seaceConnector,
];
