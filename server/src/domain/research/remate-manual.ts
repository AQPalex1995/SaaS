/**
 * REM@JU — Intake manual (Fase 4 / T4.5).
 *
 * El detalle del remate (partida, dirección, montos, convocatoria) lo obtiene
 * un humano (filtros + CAPTCHA + PDF). Aquí se **normaliza** ese payload y se
 * planifican los efectos (fila de `registry_properties`, actualización de
 * ubicación, geocodificación pendiente) sin tocar la base de datos.
 *
 * Reglas de privacidad: NUNCA se guardan datos personales del operador/SUNARP;
 * solo partida, dirección, coordenadas y datos públicos del remate.
 */

import { normalizePartida } from '../../connectors/implementations/remaju-link.js';

export type OrigenUbicacion = 'partida' | 'direccion' | 'maps';

export interface RemateManualInput {
  partida?: string | null;
  distrito?: string | null;
  direccion?:
    | {
        urb?: string | null;
        calle?: string | null;
        avenida?: string | null;
        numero?: string | null;
        lote?: string | null;
        referencia?: string | null;
      }
    | null;
  valorDeuda?: number | string | null;
  tasacion?: number | string | null;
  precioRemate?: number | string | null;
  convocatoria?: string | null;
  fechaRemate?: string | null;
  origenUbicacion?: OrigenUbicacion | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  sourceUrlPdf?: string | null;
}

export interface RemateManualNormalized {
  partida: string | null;
  distrito: string | null;
  direccion: string | null;
  valorDeuda: number | null;
  tasacion: number | null;
  precioRemate: number | null;
  convocatoria: string | null;
  fechaRemate: string | null;
  origenUbicacion: OrigenUbicacion;
  latitude: number | null;
  longitude: number | null;
  sourceUrlPdf: string | null;
}

export interface RegistryPlanRow {
  registryNumber: string | null;
  registeredAddress: string | null;
  registeredDistrict: string | null;
  source: 'remaju';
  confidence: 'medium';
  verification: 'reported';
  rawData: RemateManualNormalized;
}

export interface LocationPlan {
  latitude: number;
  longitude: number;
  source: 'manual';
  confidence: 'high' | 'medium' | 'low';
  verification: 'reported';
}

export interface RemateManualPlan {
  input: RemateManualInput;
  normalized: RemateManualNormalized;
  registry: RegistryPlanRow | null;
  location: LocationPlan | null;
  /** Query de dirección a geocodificar si no hay coordenadas (fallback OSM). */
  geocodeQuery: string | null;
  needsGeocoding: boolean;
  warnings: string[];
}

function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toCoordinate(
  value: number | string | null | undefined,
  max: number,
): number | null {
  const num = toNumberOrNull(value);
  if (num === null) return null;
  return Math.abs(num) <= max ? num : null;
}

/** Compone la dirección en texto: urb + calle/avenida + número + lote + referencia. */
export function composeDireccion(
  direccion: RemateManualInput['direccion'],
  distrito?: string | null,
): string | null {
  if (!direccion) return null;
  const parts = [
    cleanText(direccion.urb),
    cleanText(direccion.avenida) ?? cleanText(direccion.calle),
    cleanText(direccion.numero),
    cleanText(direccion.lote) ? `Lote ${cleanText(direccion.lote)}` : null,
    cleanText(direccion.referencia),
    cleanText(distrito),
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeOrigen(origen: OrigenUbicacion | null | undefined): OrigenUbicacion {
  return origen === 'partida' || origen === 'maps' ? origen : 'direccion';
}

/**
 * Normaliza el payload humano y planifica los efectos. Función pura.
 */
export function planRemateIntake(input: RemateManualInput): RemateManualPlan {
  const warnings: string[] = [];
  const partida = normalizePartida(input.partida);
  const distrito = cleanText(input.distrito);
  const direccion = composeDireccion(input.direccion, distrito);
  const origenUbicacion = normalizeOrigen(input.origenUbicacion);

  if (!partida) warnings.push('sin partida registral: el enlace será débil (candidato)');
  if (!distrito) warnings.push('sin distrito: la geocodificación puede ser imprecisa');

  const normalized: RemateManualNormalized = {
    partida,
    distrito,
    direccion,
    valorDeuda: toNumberOrNull(input.valorDeuda),
    tasacion: toNumberOrNull(input.tasacion),
    precioRemate: toNumberOrNull(input.precioRemate),
    convocatoria: cleanText(input.convocatoria),
    fechaRemate: cleanText(input.fechaRemate),
    origenUbicacion,
    latitude: toCoordinate(input.latitude, 90),
    longitude: toCoordinate(input.longitude, 180),
    sourceUrlPdf: cleanText(input.sourceUrlPdf),
  };

  const registry: RegistryPlanRow | null =
    partida || direccion || distrito
      ? {
          registryNumber: partida,
          registeredAddress: direccion,
          registeredDistrict: distrito,
          source: 'remaju',
          confidence: 'medium',
          verification: 'reported',
          rawData: normalized,
        }
      : null;

  let location: LocationPlan | null = null;
  if (normalized.latitude !== null && normalized.longitude !== null) {
    const confidence = origenUbicacion === 'partida' ? 'high' : origenUbicacion === 'maps' ? 'medium' : 'medium';
    location = {
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      source: 'manual',
      confidence,
      verification: 'reported',
    };
  } else if (normalized.latitude !== null || normalized.longitude !== null) {
    warnings.push('coordenadas incompletas: se ignoran (se necesitan latitud y longitud)');
  }

  const geocodeQuery = location === null ? direccion ?? distrito : null;
  const needsGeocoding = location === null && geocodeQuery !== null;

  return {
    input,
    normalized,
    registry,
    location,
    geocodeQuery,
    needsGeocoding,
    warnings,
  };
}
