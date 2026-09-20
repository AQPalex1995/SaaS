/**
 * Fase 5 / T5.8 — SUNARP Historical data.
 *
 * Deriva el "estado registral" de una partida a partir del historial de
 * asientos/títulos (`registry_titles`) y de las cargas/gravámenes
 * (`registry_charges`) ya normalizados (T5.6/T5.7). Función 100% pura: sin
 * DB, sin red, sin efectos; la derivación queda expuesta en el plan de intake
 * manual y en `RemateManualNormalized`.
 */

import type { CargaNormalizada, TituloNormalizado } from './sunarp-normalize.js';

/** Estado registral derivado: con cargas vigentes, sin cargas vigentes o desconocido. */
export type RegistryStateLabel = 'cargado' | 'sano' | 'desconocido';

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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveHistoricalState(
  titles: TituloNormalizado[],
  charges: CargaNormalizada[],
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
  };
}