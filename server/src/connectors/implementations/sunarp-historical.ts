/**
 * Fase 5 / T5.8 — SUNARP Historical data.
 *
 * Deriva el "estado registral" de una partida a partir del historial de
 * asientos/títulos (`registry_titles`) y de las cargas/gravámenes
 * (`registry_charges`) ya normalizados (T5.6/T5.7). Función 100% pura: sin
 * DB, sin red, sin efectos; la derivación queda expuesta en el plan de intake
 * manual y en `RemateManualNormalized`.
 */

import {
  SUNARP_PARSER_VERSION,
  type CargaNormalizada,
  type TituloNormalizado,
} from './sunarp-normalize.js';

/** Estado registral derivado: con cargas vigentes, sin cargas vigentes o desconocido. */
export type RegistryStateLabel = 'cargado' | 'sano' | 'desconocido';

/**
 * Provenance de superficie (Fase 5 / T5.9): atribución completa de un dato o
 * bloque para que el consumidor del intake manual sepa de dónde viene, cuándo
 * se obtuvo, con qué confianza y qué versión de parser lo normalizó. Sin
 * necesidad de excavar en `rawData`.
 */
export interface IntakeProvenance {
  /** Origen del dato ('remaju' | 'sunarp' | 'manual' | …). */
  source: string;
  /** URL/origen consultable (p. ej. el PDF del aviso); null si no hay. */
  sourceUrl: string | null;
  /** Cuándo se consultó/capturó/ingresó el dato (ISO-8601). */
  retrievedAt: string;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  verification:
    | 'reported'
    | 'inferred'
    | 'verified'
    | 'conflicting'
    | 'unknown';
  parserVersion: string;
}

export interface RegistryHistoricalState {
  titleCount: number;
  chargeCount: number;
  /** Cargas vigentes (isActive = 'si'). */
  activeCharges: CargaNormalizada[];
  /** Cargas vencidas/canceladas (isActive = 'no'). */
  inactiveCharges: CargaNormalizada[];
  /** Suma de montos vigentes en soles (PEN); 0 si no hay. */
  totalActiveDebtPen: number;
  /** Suma de montos vigentes en dólares (USD); 0 si no hay. */
  totalActiveDebtUsd: number;
  /** Fecha (YYYY-MM-DD) del título/asiento más reciente; null si no hay fechas. */
  lastTitleDate: string | null;
  registryState: RegistryStateLabel;
  /**
   * Provenance del estado derivado (T5.9): derivación del sistema sobre la
   * captura ingresada → `source: 'sunarp'`, `verification: 'inferred'`
   * (ver `docs/RESEARCH_GOVERNANCE.md` §2).
   */
  provenance: IntakeProvenance;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveHistoricalState(
  titles: TituloNormalizado[],
  charges: CargaNormalizada[],
  provenance?: Partial<IntakeProvenance> | null,
): RegistryHistoricalState {
  const active = charges.filter((c) => c.isActive === 'si');
  const inactive = charges.filter((c) => c.isActive === 'no');

  const sumBy = (currency: string): number =>
    round2(
      active
        .filter((c) => c.currency === currency && c.amount !== null)
        .reduce((acc, c) => acc + (c.amount as number), 0),
    );

  const dates = titles.map((t) => t.titleDate).filter((d): d is string => d !== null);
  dates.sort();
  const lastTitleDate = dates.length > 0 ? dates[dates.length - 1] : null;

  const registryState: RegistryStateLabel =
    active.length > 0 ? 'cargado' : charges.length > 0 ? 'sano' : 'desconocido';

  return {
    titleCount: titles.length,
    chargeCount: charges.length,
    activeCharges: active,
    inactiveCharges: inactive,
    totalActiveDebtPen: sumBy('PEN'),
    totalActiveDebtUsd: sumBy('USD'),
    lastTitleDate,
    registryState,
    provenance: {
      source: 'sunarp',
      sourceUrl: null,
      retrievedAt: new Date().toISOString(),
      confidence: 'medium',
      verification: 'inferred',
      parserVersion: SUNARP_PARSER_VERSION,
      ...provenance,
    },
  };
}
