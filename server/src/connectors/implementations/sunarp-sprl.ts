import { PropertyDataSource } from '../base.js';
import type {
  ConnectorStatus,
  SearchParams,
  SearchResult,
  DetailResult,
} from '../base.js';

/**
 * SUNARP — "SPRL" (Servicio de Publicidad Registral en Línea) (Fase 5 / T5.3).
 *
 * SPRL es el servicio de publicidad registral con VALOR LEGAL de SUNARP
 * (`https://sprl.sunarp.gob.pe`). La suscripción es gratuita (usuario y clave),
 * pero CADA consulta es de pago: visualización de partida, copias literales y
 * certificados (~S/ 6.90/página de visualización; copia literal ~S/ 14 las dos
 * primeras hojas + S/ 7 por hoja adicional).
 *
 * Postura legal / operativa:
 * - No automatizable: requiere cuenta suscrita + pago por servicio + CAPTCHA.
 * - No se almacenan credenciales (Ley 29733) ni se automatiza la compra.
 * - Este conector NO hace peticiones de red: reporta `requires_auth` +
 *   `requiresManualAction` (la guía indica que la operación es de pago) y
 *   search()/getDetails() no devuelven datos (nunca datos simulados).
 *
 * @see docs/SUNARP.md
 */

export const SUNARP_SPRL_URL = 'https://sprl.sunarp.gob.pe';

/** Instrucciones para el operador que gestionará la copia legal vía SPRL. */
export function sunarpSprlManualActionDescription(): string {
  return [
    'SUNARP "SPRL" (publicidad registral en línea) es un servicio DE PAGO con',
    'valor legal: suscripción gratuita (usuario/clave) pero cada consulta se',
    'cobra (visualización ~S/ 6.90/página; copia literal ~S/ 14 las 2 primeras',
    'hojas + S/ 7 por hoja adicional).',
    'No automatizable: un operador con cuenta suscrita debe gestionar la compra',
    'manualmente y aportar el documento (copia literal/certificado) al expediente.',
    `Servicio: ${SUNARP_SPRL_URL}`,
  ].join(' ');
}

export class SunarpSprlConnector extends PropertyDataSource {
  readonly sourceId = 'sunarp_sprl' as const;
  readonly sourceName = 'SUNARP SPRL';

  async getStatus(): Promise<ConnectorStatus> {
    return {
      sourceId: 'sunarp_sprl',
      status: 'requires_auth',
      requiresManualAction: true,
      manualActionDescription: sunarpSprlManualActionDescription(),
      url: SUNARP_SPRL_URL,
      message:
        'SUNARP SPRL requiere suscripción + pago por servicio (valor legal) — no automatizable',
      lastChecked: new Date(),
    };
  }

  async search(_params: SearchParams): Promise<SearchResult> {
    return {
      items: [],
      totalFound: 0,
      source: 'sunarp_sprl',
      searchedAt: new Date(),
      requiresManualAction: true,
      manualActionDescription: sunarpSprlManualActionDescription(),
    };
  }

  async getDetails(_externalId: string): Promise<DetailResult> {
    return {
      found: false,
      source: 'sunarp_sprl',
      retrievedAt: new Date(),
      requiresManualAction: true,
      manualActionDescription: sunarpSprlManualActionDescription(),
    };
  }
}

/** Singleton instance. */
export const sunarpSprlConnector = new SunarpSprlConnector();