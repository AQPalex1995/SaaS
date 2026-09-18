import { PropertyDataSource } from '../base.js';
import type {
  ConnectorStatus,
  SearchParams,
  SearchResult,
  DetailResult,
} from '../base.js';

/**
 * SUNARP — "Conoce Aquí" + "Consulta de Propiedad" (Fase 5 / T5.1–T5.2).
 *
 * Superficie reportada: TODAS las consultas SUNARP gratuitas exigen identidad
 * personal (DNI + fecha de emisión) y CAPTCHA; la de valor legal (SPRL) es de
 * pago. No existe superficie pública consultable sin identidad + CAPTCHA
 * (a diferencia del home público de REM@JU, Fase 4).
 *
 * - **Conoce Aquí** (`SUNARP_CONOCE_AQUI_URL`): contenido de la partida.
 * - **Consulta de Propiedad** (`SUNARP_CONSULTA_PROPERTY_URL`): localizar
 *   partidas por NOMBRE del propietario (DNI/carnet + fecha de emisión +
 *   CAPTCHA + validación de correo; resultados con homonimia).
 *
 * Este conector NO hace peticiones de red: reporta `requires_auth` +
 * `requiresManualAction` con instrucciones para el operador, y search()/
 * getDetails() señalan la acción manual correspondiente sin devolver datos
 * (nunca datos simulados).
 */

export const SUNARP_CONOCE_AQUI_URL = 'https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio';
export const SUNARP_CONSULTA_PROPERTY_URL = 'https://www2.sunarp.gob.pe/consulta-propiedad';

/** Instrucciones para localizar una partida por nombre del propietario (Consulta de Propiedad). */
export function sunarpOwnerSearchManualActionDescription(): string {
  return [
    'SUNARP "Consulta de Propiedad" localiza partidas por NOMBRE del propietario',
    '(DNI/carnet de extranjería + fecha de emisión + CAPTCHA + validación de correo).',
    'No automatizable: un operador debe consultar manualmente y reportar la(s) partida(s)',
    'encontrada(s) (cuidado con la homonimia).',
    `Servicio: ${SUNARP_CONSULTA_PROPERTY_URL}`,
  ].join(' ');
}

/** Instrucciones para ver el contenido de una partida conocida (Conoce Aquí). */
export function sunarpManualActionDescription(): string {
  return [
    'SUNARP "Conoce Aquí" exige login con DNI + fecha de emisión + CAPTCHA',
    '(hasta 5 consultas/día, vista de 30 min, carácter referencial).',
    'No automatizable: un operador debe consultar manualmente con su propia',
    'identidad y registrar el detalle (partida, titular, cargas) en el sistema.',
    `Servicio: ${SUNARP_CONOCE_AQUI_URL}`,
  ].join(' ');
}

/** Guía combinada para el Research Engine (tarea registry/bgr). */
export function sunarpRegistryManualActionDescription(): string {
  return [
    sunarpOwnerSearchManualActionDescription(),
    'Si la partida ya se conoce, consultar su contenido en "Conoce Aquí":',
    `${SUNARP_CONOCE_AQUI_URL}`,
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
      manualActionDescription: sunarpRegistryManualActionDescription(),
      message:
        'SUNARP requiere identidad + CAPTCHA (Conoce Aquí: DNI + fecha de emisión + CAPTCHA; Consulta de Propiedad: igual + correo) — no automatizable',
      lastChecked: new Date(),
    };
  }

  async search(_params: SearchParams): Promise<SearchResult> {
    return {
      items: [],
      totalFound: 0,
      source: 'sunarp',
      searchedAt: new Date(),
      requiresManualAction: true,
      manualActionDescription: sunarpOwnerSearchManualActionDescription(),
    };
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