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

import {
  SUNARP_PARSER_VERSION,
  normalizeCargas,
  normalizePropietarios,
  normalizeTitulos,
  registryLookupKey,
  type CargaNormalizada,
  type PropietarioNormalizado,
  type TituloNormalizado,
} from '../../connectors/implementations/sunarp-normalize.js';
import {
  deriveHistoricalState,
  type IntakeProvenance,
  type RegistryHistoricalState,
} from '../../connectors/implementations/sunarp-historical.js';

export type OrigenUbicacion = 'partida' | 'direccion' | 'maps';

/** Fuente real de la que proviene la captura ingresada por el operador. */
export type IntakeSource = 'manual' | 'sunarp' | 'sunarp_sprl' | 'sunarp_bgr';

/** Origen que se persiste en `registry_properties.source`. */
export type RegistrySource = 'remaju' | 'sunarp' | 'sunarp_sprl' | 'sunarp_bgr';

export interface IntakeContext {
  /**
   * Fuente real de la captura (T5.10). Si no se provee, se asume 'manual'
   * (REM@JU u otra fuente transcrita a mano). Para capturas SUNARP el origen
   * de la provenance es 'sunarp'/'sunarp_sprl'/'sunarp_bgr', nunca 'manual'
   * (regla de trazabilidad AGENTS §3.5).
   */
  source?: IntakeSource;
  /** URL consultada (ej. la página de Conoce Aquí) cuando no hay PDF. */
  url?: string | null;
}

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
  /** Titulares de la partida capturados del detalle SUNARP (T5.5). */
  propietarios?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  /** Cargas/gravámenes capturados del detalle SUNARP (T5.6). */
  cargas?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  /** Historial de títulos/asientos capturados del detalle SUNARP (T5.7). */
  titulos?: Array<Record<string, unknown>> | Record<string, unknown> | null;
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
  /** Titulares normalizados de la partida (T5.5). */
  propietarios: PropietarioNormalizado[];
  /** Cargas/gravámenes normalizados de la partida (T5.6). */
  cargas: CargaNormalizada[];
  /** Historial de títulos normalizado de la partida (T5.7). */
  titulos: TituloNormalizado[];
  /** Estado registral derivado del historial de asientos y cargas (T5.8). */
  historical: RegistryHistoricalState;
  /** Provenance de superficie del intake (T5.9). */
  provenance: IntakeProvenance;
}

export interface RegistryPlanRow {
  registryNumber: string | null;
  registeredAddress: string | null;
  registeredDistrict: string | null;
  /** Titulares de la partida a persistir en `registry_owners` (T5.5). */
  owners: PropietarioNormalizado[];
  /** Cargas/gravámenes a persistir en `registry_charges` (T5.6). */
  charges: CargaNormalizada[];
  /** Títulos/asientos a persistir en `registry_titles` (T5.7). */
  titles: TituloNormalizado[];
  /** Estado registral derivado (T5.8). */
  historical: RegistryHistoricalState;
  source: RegistrySource;
  confidence: 'medium';
  verification: 'reported';
  /** Provenance de superficie de la fila registral a persistir (T5.9). */
  provenance: IntakeProvenance;
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

/** Solo titulares aprovechables para `registry_owners` (nombre y/o documento). */
function meaningfulOwners(owners: PropietarioNormalizado[]): PropietarioNormalizado[] {
  return owners.filter(
    (o) => o.ownerName !== null || o.documentNumber !== null || o.documentType !== 'other',
  );
}

/** Solo cargas aprovechables para `registry_charges` (alguna información real). */
function meaningfulCharges(charges: CargaNormalizada[]): CargaNormalizada[] {
  return charges.filter(
    (c) =>
      c.chargeType !== 'other' ||
      c.description !== null ||
      c.amount !== null ||
      c.creditor !== null,
  );
}

/** Solo títulos aprovechables para `registry_titles` (alguna información real). */
function meaningfulTitles(titles: TituloNormalizado[]): TituloNormalizado[] {
  return titles.filter(
    (t) =>
      t.titleNumber !== null ||
      t.titleDate !== null ||
      t.titleType !== null ||
      t.notary !== null ||
      t.description !== null,
  );
}

/**
 * Normaliza el payload humano y planifica los efectos. Función pura.
 *
 * @param input          Payload humano del intake manual.
 * @param retrievedAt    Cuándo se capturó/ingresó el dato (default: ahora).
 *                       Se propaga a todos los bloques de provenance (T5.9).
 * @param context        Contexto de la acción manual (T5.10): la fuente real
 *                       de la captura (p. ej. 'sunarp') y la URL consultada.
 */
export function planRemateIntake(
  input: RemateManualInput,
  retrievedAt: Date = new Date(),
  context: IntakeContext = {},
): RemateManualPlan {
  const warnings: string[] = [];
  // Clave canónica SUNARP 'P-XXXXXXXX' (Zona Registral XII — Arequipa): lo que
  // se persiste en registry_properties.registry_number para deduplicar el cache.
  const partida = registryLookupKey(input.partida);
  const distrito = cleanText(input.distrito);
  const direccion = composeDireccion(input.direccion, distrito);
  const origenUbicacion = normalizeOrigen(input.origenUbicacion);

  if (!partida) warnings.push('sin partida registral: el enlace será débil (candidato)');
  if (!distrito) warnings.push('sin distrito: la geocodificación puede ser imprecisa');

  // Titulares de la partida capturados de SUNARP (T5.5): se normalizan y se
  // preparan para persistir en `registry_owners` vinculados al registry row.
  const owners = meaningfulOwners(normalizePropietarios(input.propietarios));
  if (input.propietarios && owners.length === 0) {
    warnings.push('captura SUNARP sin propietarios normalizables (revisar campos)');
  }

  // Cargas/gravámenes capturados de SUNARP (T5.6): se normalizan y se preparan
  // para persistir en `registry_charges` vinculados al registry row.
  const charges = meaningfulCharges(normalizeCargas(input.cargas));
  if (input.cargas && charges.length === 0) {
    warnings.push('captura SUNARP sin cargas normalizables (revisar campos)');
  }

  // Historial de títulos/asientos capturado de SUNARP (T5.7): se normaliza y se
  // prepara para persistir en `registry_titles` vinculados al registry row.
  const titles = meaningfulTitles(normalizeTitulos(input.titulos));
  if (input.titulos && titles.length === 0) {
    warnings.push('captura SUNARP sin títulos normalizables (revisar campos)');
  }

  const retrievedAtIso = retrievedAt.toISOString();
  const sourceUrlPdf = cleanText(input.sourceUrlPdf);

  // Fuente real de la captura (T5.10): SUNARP cuando el operador transcribió el
  // detalle registral, 'manual'/'remaju' en el intake clásico de REM@JU.
  const captureSource: IntakeSource = context.source ?? 'manual';
  const captureUrl =
    sourceUrlPdf ?? context.url ?? null;
  const captureParser =
    captureSource === 'manual' ? 'manual-v1' : SUNARP_PARSER_VERSION;
  const registrySource: RegistrySource =
    captureSource === 'manual' ? 'remaju' : captureSource;
  const registryUrl =
    registrySource === 'remaju' ? sourceUrlPdf : captureUrl;

  // Provenance de superficie del intake (T5.9): dato ingresado por un humano
  // (source 'manual' o la fuente real consultada), referenciado por el PDF del
  // aviso o la URL del servicio cuando existe.
  const intakeProvenance: IntakeProvenance = {
    source: captureSource,
    sourceUrl: captureUrl,
    retrievedAt: retrievedAtIso,
    confidence: 'medium',
    verification: 'reported',
    parserVersion: captureParser,
  };

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
    sourceUrlPdf,
    propietarios: owners,
    cargas: charges,
    titulos: titles,
    historical: deriveHistoricalState(titles, charges, { retrievedAt: retrievedAtIso }),
    provenance: intakeProvenance,
  };

  const registry: RegistryPlanRow | null =
    partida || direccion || distrito
      ? {
          registryNumber: partida,
          registeredAddress: direccion,
          registeredDistrict: distrito,
          owners,
          charges,
          titles,
          historical: deriveHistoricalState(titles, charges, { retrievedAt: retrievedAtIso }),
          source: registrySource,
          confidence: 'medium',
          verification: 'reported',
          provenance: {
            source: registrySource,
            sourceUrl: registryUrl,
            retrievedAt: retrievedAtIso,
            confidence: 'medium',
            verification: 'reported',
            parserVersion: SUNARP_PARSER_VERSION,
          },
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
