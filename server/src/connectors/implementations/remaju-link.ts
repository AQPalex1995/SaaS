/**
 * REM@JU — Property linking (Fase 4 / T4.5).
 *
 * Enlaza un remate judicial con los predios existentes usando una jerarquía de
 * claves:
 *   1. **partida registral** (SUNARP) → match FUERTE (`high`).
 *   2. **distrito + dirección** → match DÉBIL (`medium`/`low`), siempre como
 *      candidato (nunca hard-match).
 *   3. **solo distrito** → señal (`low`).
 *
 * La partida del detalle REM@JU la ingresa un humano (captcha/PDF); este módulo
 * solo compara texto ya capturado. Sin red, sin efectos: puro y testeable.
 */

import { stripAccents } from './remaju-normalize.js';

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'en',
  'av',
  'avenida',
  'calle',
  'jr',
  'jiron',
  'jirón',
  'urb',
  'urbanizacion',
  'urbanización',
  'mz',
  'manzana',
  'lote',
  'lt',
  'n',
  'nro',
  'numero',
  'número',
  's/n',
  'sn',
  'piso',
  'dpto',
  'departamento',
  'asentamiento',
  'humano',
  'pueblo',
  'joven',
  'asoc',
  'asociacion',
  'asociación',
  'coop',
  'cooperativa',
]);

/** Normaliza una partida registral para comparar: mayúsculas, sin espacios/guiones. */
export function normalizePartida(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = stripAccents(String(raw)).toUpperCase().replace(/[\s\-_.]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/** Tokeniza una dirección/ubicación para comparación difusa (sin acentos/stopwords). */
export function addressTokens(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  const normalized = stripAccents(String(raw))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalized) return new Set();
  const tokens = normalized
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export interface RemateMatchQuery {
  /** Partida registral (ya capturada del detalle/PDF). */
  partida?: string | null;
  /** Dirección del predio (urb/calle/av/lote…). */
  direccion?: string | null;
  /** Distrito normalizado (clave sin acentos). */
  ubicacionKey?: string | null;
}

export interface PropertyLinkCandidate {
  propertyId: string;
  registryNumber?: string | null;
  address?: string | null;
  district?: string | null;
}

export type RemateMatchType = 'partida' | 'address' | 'district';

export interface RemateLinkCandidate {
  propertyId: string;
  matchType: RemateMatchType;
  confidence: 'high' | 'medium' | 'low';
  /** 0..1 (1 = partida exacta). */
  score: number;
  reasons: string[];
}

function districtMatches(ubicacionKey: string | null | undefined, district: string | null | undefined): boolean {
  const a = stripAccents(String(ubicacionKey ?? '')).toUpperCase().trim();
  const b = stripAccents(String(district ?? '')).toUpperCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Devuelve los candidatos ordenados por score descendente.
 * Una partida exacta es el único hard-match; todo lo demás es candidato.
 */
export function linkRemateToProperties(
  remate: RemateMatchQuery,
  candidates: PropertyLinkCandidate[],
): RemateLinkCandidate[] {
  const partida = normalizePartida(remate.partida);
  const remateTokens = addressTokens(remate.direccion);
  const results: RemateLinkCandidate[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];

    if (partida && normalizePartida(candidate.registryNumber) === partida) {
      results.push({
        propertyId: candidate.propertyId,
        matchType: 'partida',
        confidence: 'high',
        score: 1,
        reasons: ['partida registral exacta'],
      });
      continue;
    }

    const districtOk = districtMatches(remate.ubicacionKey, candidate.district);
    const candidateTokens = addressTokens(candidate.address);
    const ratio = overlapRatio(remateTokens, candidateTokens);

    if (ratio > 0) {
      if (districtOk) reasons.push('mismo distrito');
      reasons.push(`coincidencia de dirección ${(ratio * 100).toFixed(0)}%`);
      const confidence = districtOk && ratio >= 0.6 ? 'medium' : 'low';
      results.push({
        propertyId: candidate.propertyId,
        matchType: 'address',
        confidence,
        score: Number((ratio * (districtOk ? 0.8 : 0.5)).toFixed(2)),
        reasons,
      });
      continue;
    }

    if (districtOk) {
      results.push({
        propertyId: candidate.propertyId,
        matchType: 'district',
        confidence: 'low',
        score: 0.3,
        reasons: ['coincide solo el distrito'],
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Mejor candidato solo si existe un **hard-match** (partida). Por diseño, un
 * match débil (distrito/dirección) NUNCA se enlaza automáticamente.
 */
export function pickHardLink(
  candidates: RemateLinkCandidate[],
): RemateLinkCandidate | null {
  return candidates.find((c) => c.matchType === 'partida' && c.confidence === 'high') ?? null;
}
