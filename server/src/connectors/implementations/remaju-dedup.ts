/**
 * REM@JU — Deduplicación (Fase 4 / T4.4).
 *
 * El carrusel público puede repetir un mismo remate (p. ej. varias
 * convocatorias del mismo remate, o el mismo panel renderizado más de una vez).
 * Aquí se calcula una clave estable y un hash de contenido canónico —
 * reutilizando el patrón `contentHash` de la ingesta
 * (`server/src/domain/ingestion/sync.ts`) — para quedarnos con una sola
 * ocurrencia por remate, fusionando los campos que falten.
 *
 * Sin red, sin efectos: módulo puro y testeable.
 */

import { createHash } from 'node:crypto';
import type { NormalizedRemate } from './remaju-normalize.js';

export const REMAJU_DEDUP_VERSION = 'v1';

function blank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Firma canónica de contenido (estable e insensible a mayúsculas/espacios). */
function contentSignature(remate: NormalizedRemate): string {
  const str = (value: unknown): string => (blank(value) ? '' : String(value));
  return [
    'remaju',
    str(remate.remateId),
    str(remate.convocatoriaId),
    remate.tipo,
    str(remate.tipoRaw).trim().toLowerCase(),
    str(remate.ubicacionKey),
    str(remate.fechaISO),
    str(remate.info).trim().toLowerCase().replace(/\s+/g, ' '),
    str(remate.moneda),
    str(remate.monto),
  ].join('|');
}

/** Hash SHA-256 (hex) del contenido normalizado, estilo `contentHash` de ingesta. */
export function remajuContentHash(remate: NormalizedRemate): string {
  return createHash('sha256').update(contentSignature(remate)).digest('hex');
}

/**
 * Clave de identidad principal. Fuerte por ids del portal (`remate` >
 * `convocatoria`); si faltan ambos, cae al hash de contenido normalizado.
 */
export function remajuDedupKey(remate: NormalizedRemate): string {
  if (remate.remateId !== null) return `remate:${remate.remateId}`;
  if (remate.convocatoriaId !== null) return `convocatoria:${remate.convocatoriaId}`;
  return `hash:${remajuContentHash(remate)}`;
}

/**
 * Todas las claves de identidad de una fila. Una fila con `remate` y
 * `convocatoria` se indexa por ambas, de modo que otra fila parcial (solo uno de
 * los ids) pueda emparejarse con ella.
 */
export function remajuDedupKeys(remate: NormalizedRemate): string[] {
  const keys: string[] = [];
  if (remate.remateId !== null) keys.push(`remate:${remate.remateId}`);
  if (remate.convocatoriaId !== null) keys.push(`convocatoria:${remate.convocatoriaId}`);
  if (keys.length === 0) keys.push(`hash:${remajuContentHash(remate)}`);
  return keys;
}

/** Fusiona `extra` sobre `base`, completando solo los campos vacíos. */
export function mergeRemate(base: NormalizedRemate, extra: NormalizedRemate): NormalizedRemate {
  return {
    ...base,
    remateId: base.remateId ?? extra.remateId,
    convocatoriaId: base.convocatoriaId ?? extra.convocatoriaId,
    tipo: base.tipo === 'desconocido' ? extra.tipo : base.tipo,
    tipoRaw: blank(base.tipoRaw) ? extra.tipoRaw : base.tipoRaw,
    ubicacion: blank(base.ubicacion) ? extra.ubicacion : base.ubicacion,
    ubicacionKey: blank(base.ubicacionKey) ? extra.ubicacionKey : base.ubicacionKey,
    fechaISO: blank(base.fechaISO) ? extra.fechaISO : base.fechaISO,
    esUltimoDiaInscripcion: base.esUltimoDiaInscripcion || extra.esUltimoDiaInscripcion,
    info: blank(base.info) ? extra.info : base.info,
    moneda: blank(base.moneda) ? extra.moneda : base.moneda,
    monto: base.monto ?? extra.monto,
  };
}

export interface DedupEntry<T> {
  raw: T;
  normalized: NormalizedRemate;
}

export interface DedupResult<T> {
  /** Una entrada por remate, en orden de primera aparición, con campos fusionados. */
  unique: DedupEntry<T>[];
  /** Ocurrencias descartadas (mismo remate/contenido). */
  duplicates: DedupEntry<T>[];
  totalInput: number;
}

/** Deduplica entradas conservando el `raw` representativo (primera aparición). */
export function dedupeEntries<T>(entries: DedupEntry<T>[]): DedupResult<T> {
  const indexByAlias = new Map<string, number>();
  const unique: DedupEntry<T>[] = [];
  const duplicates: DedupEntry<T>[] = [];

  for (const entry of entries) {
    const keys = remajuDedupKeys(entry.normalized);
    let index: number | undefined;
    for (const key of keys) {
      const found = indexByAlias.get(key);
      if (found !== undefined) {
        index = found;
        break;
      }
    }
    if (index === undefined) {
      index = unique.length;
      unique.push(entry);
    } else {
      const current = unique[index];
      unique[index] = {
        raw: current.raw,
        normalized: mergeRemate(current.normalized, entry.normalized),
      };
      duplicates.push(entry);
    }
    for (const key of keys) indexByAlias.set(key, index);
  }

  return { unique, duplicates, totalInput: entries.length };
}

/** Conveniencia para trabajar solo con el shape normalizado. */
export function dedupeRemates(items: NormalizedRemate[]): DedupResult<NormalizedRemate> {
  return dedupeEntries(items.map((normalized) => ({ raw: normalized, normalized })));
}
