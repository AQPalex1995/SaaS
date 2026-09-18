/**
 * REM@JU — Research matching (Fase 4 / T4.6).
 *
 * Puente entre los ítems del carrusel público REM@JU y una property concreta
 * del expediente. Es puro: no hace red ni toca la DB.
 *
 * El enlace por **partida registral** es fuerte; como el detalle que contiene la
 * partida está tras CAPTCHA, en el flujo automático normalmente solo habrá
 * coincidencias débiles distrito/dirección, que el orquestador convierte en una
 * `manual_action` para que un humano capture el aviso y haga el enlace fuerte.
 */

import {
  linkRemateToProperties,
  type PropertyLinkCandidate,
} from '../../connectors/implementations/remaju-link.js';
import type { SearchResultItem } from '../../connectors/base.js';

export interface RemajuPropertyInput {
  propertyId: string;
  district?: string | null;
  address?: string | null;
  registryNumbers?: string[];
}

export interface RemajuRemateEntry {
  externalId: string;
  sourceUrl?: string;
  title?: string;
  partida?: string | null;
  ubicacion?: string | null;
  ubicacionKey?: string | null;
  fechaISO?: string | null;
  tipo?: string | null;
  remateId?: number | null;
  convocatoriaId?: number | null;
}

export interface RemajuMatch {
  externalId: string;
  sourceUrl?: string;
  title?: string;
  matchType: 'partida' | 'address' | 'district';
  confidence: 'high' | 'medium' | 'low';
  score: number;
  remate: RemajuRemateEntry;
}

export interface RemajuMatchPlan {
  matches: RemajuMatch[];
  hardMatch: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  bestMatchType: 'partida' | 'address' | 'district' | null;
  warnings: string[];
}

/** Convierte un ítem del carrusel a una entrada de matching (tolerante a faltantes). */
export function toRemateEntry(item: SearchResultItem): RemajuRemateEntry {
  const raw = (item.rawData ?? {}) as Record<string, any>;
  const normalized = (raw.normalized ?? {}) as Record<string, any>;
  return {
    externalId: item.externalId,
    sourceUrl: item.sourceUrl,
    title: item.title,
    partida: normalized.partida ?? raw.partida ?? null,
    ubicacion: normalized.ubicacion ?? item.district ?? null,
    ubicacionKey: normalized.ubicacionKey ?? null,
    fechaISO: normalized.fechaISO ?? null,
    tipo: normalized.tipo ?? null,
    remateId: normalized.remateId ?? null,
    convocatoriaId: normalized.convocatoriaId ?? null,
  };
}

function buildCandidates(property: RemajuPropertyInput): PropertyLinkCandidate[] {
  const candidates: PropertyLinkCandidate[] = [];
  for (const registryNumber of property.registryNumbers ?? []) {
    if (registryNumber) candidates.push({ propertyId: property.propertyId, registryNumber });
  }
  if (property.address || property.district) {
    candidates.push({
      propertyId: property.propertyId,
      address: property.address ?? undefined,
      district: property.district ?? undefined,
    });
  }
  return candidates;
}

/**
 * Empareja una lista de remates públicos contra una única property.
 * Devuelve como máximo un match por remate (el mejor), ordenado por score.
 */
export function planRemajuMatches(
  property: RemajuPropertyInput,
  remates: RemajuRemateEntry[],
): RemajuMatchPlan {
  const warnings: string[] = [];
  if ((property.registryNumbers ?? []).length === 0) {
    warnings.push('La property no tiene partida registral: el enlace fuerte no es posible');
  }
  if (!property.district && !property.address) {
    warnings.push('La property no tiene distrito ni dirección para comparar');
  }

  const candidates = buildCandidates(property);
  if (candidates.length === 0) {
    return {
      matches: [],
      hardMatch: false,
      confidence: 'unknown',
      bestMatchType: null,
      warnings,
    };
  }

  const matches: RemajuMatch[] = [];
  for (const remate of remates) {
    const links = linkRemateToProperties(
      { partida: remate.partida ?? undefined, ubicacionKey: remate.ubicacionKey ?? undefined },
      candidates,
    );
    const best = links[0];
    if (!best) continue;
    matches.push({
      externalId: remate.externalId,
      sourceUrl: remate.sourceUrl,
      title: remate.title,
      matchType: best.matchType,
      confidence: best.confidence,
      score: best.score,
      remate,
    });
  }

  matches.sort((a, b) => b.score - a.score);

  const hardMatch = matches.some((m) => m.matchType === 'partida');
  const bestMatchType = matches[0]?.matchType ?? null;
  const confidence = hardMatch ? 'high' : matches.length > 0 ? 'low' : 'unknown';

  return { matches, hardMatch, confidence, bestMatchType, warnings };
}
