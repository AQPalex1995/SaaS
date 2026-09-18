import { PropertyDataSource } from '../base.js';
import type {
  ConnectorStatus,
  SearchParams,
  SearchResult,
  DetailResult,
} from '../base.js';

/**
 * SUNARP — "Conoce Aquí" (Fase 5 / T5.1).
 *
 * Superficie reportada: TODAS las consultas SUNARP gratuitas exigen identidad
 * personal (DNI + fecha de emisión) y CAPTCHA; la de valor legal (SPRL) es de
 * pago. No existe superficie pública consultable sin identidad + CAPTCHA
 * (a diferencia del home público de REM@JU, Fase 4).
 *
 * Postura legal / operativa:
 * - NO se automatiza autenticación ni CAPTCHA.
 * - NO se almacena DNI / fecha de emisión (Ley 29733, minimización de datos).
 * - NO se simulan datos: este conector NO hace peticiones de red; reporta
 *   `requires_auth` + `requiresManualAction` con instrucciones para el
 *   operador, y search()/getDetails() no devuelven items.
 *
 * @see docs/SUNARP.md
 */

export const SUNARP_CONOCE_AQUI_URL = 'https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio';
export const SUNARP_CONSULTA_PROPERTY_URL = 'https://www2.sunarp.gob.pe/consulta-propiedad';

/** Instrucciones para el operador que resolverá la acción manual. */
export function sunarpManualActionDescription(): string {
  return [
    'SUNARP "Conoce Aquí" exige login con DNI + fecha de emisión + CAPTCHA',
    '(hasta 5 consultas/día, vista de 30 min, carácter referencial).',
    'No automatizable: un operador debe consultar manualmente con su propia',
    'identidad y registrar el detalle (partida, titular, cargas) en el sistema.',
    `Servicio: ${SUNARP_CONOCE_AQUI_URL}`,
  ].join(' ');
}

export class SunarpConnector extends PropertyDataSource {
  readonly sourceId = 'sunarp' as const;
  readonly sourceName = 'SUNARP Conoce Aquí';

  async getStatus(): Promise<ConnectorStatus> {
    return {
      sourceId: 'sunarp',
      status: 'requires_auth',
      requiresManualAction: true,
      manualActionDescription: sunarpManualActionDescription(),
      message:
        'SUNARP Conoce Aquí requiere login DNI + fecha de emisión + CAPTCHA (no automatizable)',
      lastChecked: new Date(),
    };
  }

  async search(_params: SearchParams): Promise<SearchResult> {
    return { items: [], totalFound: 0, source: 'sunarp', searchedAt: new Date() };
  }

  async getDetails(_externalId: string): Promise<DetailResult> {
    return {
      found: false,
      source: 'sunarp',
      retrievedAt: new Date(),
      requiresManualAction: true,
      manualActionDescription: sunarpManualActionDescription(),
    };
  }
}

/** Singleton instance. */
export const sunarpConnector = new SunarpConnector();