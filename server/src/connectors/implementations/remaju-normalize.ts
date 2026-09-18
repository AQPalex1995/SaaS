/**
 * REM@JU — Normalización (Fase 4 / T4.3).
 *
 * Convierte los campos crudos que produce `parseRemajuHome()` en un shape
 * canónico y tipado, apto para `research_results.data` (provenance T3.5) y para
 * el dedup (T4.4) y el linking (T4.5).
 *
 * Sin red, sin efectos: módulo puro y testeable.
 */

export const REMAJU_PARSER_VERSION = 'v1';

/** Fila cruda del carrusel público (salida de `parseRemajuHome`). */
export interface RemateSlide {
  convocatoria?: string;
  tipoConvocatoria?: string;
  remate?: string;
  tipoLabel?: string;
  ubicacion?: string;
  fecha?: string;
  fechaISO?: string | null;
  info?: string;
  esUltimoDiaInscripcion: boolean;
}

export type RemateTipoCanonical =
  | 'remate_simple'
  | 'segunda_convocatoria'
  | 'tercera_convocatoria'
  | 'subasta'
  | 'desconocido';

export interface NormalizedRemate {
  source: 'remaju';
  parserVersion: string;
  remateId: number | null;
  convocatoriaId: number | null;
  tipo: RemateTipoCanonical;
  tipoRaw: string | null;
  ubicacion: string | null;
  ubicacionKey: string | null;
  fechaISO: string | null;
  esUltimoDiaInscripcion: boolean;
  info: string | null;
  moneda: 'PEN' | null;
  monto: number | null;
}

/** Quita acentos/diacríticos (para claves de comparación). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Title-case preservando acentos ("jose luis" → "Jose Luis"). */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_all, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** "27/09/2026" → "2026-09-27" (ISO). Devuelve null si el formato no cuadra. */
export function parseFechaRemaju(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

const TIPO_POR_CODIGO: Record<string, RemateTipoCanonical> = {
  '1': 'remate_simple',
  '2': 'segunda_convocatoria',
  '3': 'tercera_convocatoria',
  '4': 'subasta',
};

/**
 * Canoniza el tipo de convocatoria. Prioriza la etiqueta visible del portal
 * (más estable que el código) y cae al código numérico.
 */
export function normalizeTipoConvocatoria(
  codigo: string | undefined | null,
  label?: string | null,
): RemateTipoCanonical {
  const text = stripAccents(collapseSpaces(label ?? '').toUpperCase());
  if (text) {
    if (text.includes('SEGUNDA')) return 'segunda_convocatoria';
    if (text.includes('TERCERA')) return 'tercera_convocatoria';
    if (text.includes('SUBASTA')) return 'subasta';
    if (text.includes('REMATE SIMPLE')) return 'remate_simple';
  }
  const code = (codigo ?? '').trim();
  return TIPO_POR_CODIGO[code] ?? 'desconocido';
}

export interface UbicacionNormalizada {
  display: string;
  key: string;
}

/**
 * Normaliza una ubicación para mostrar (`display`, Title Case) y para comparar
 * (`key`, sin acentos y en mayúsculas).
 */
export function normalizeUbicacion(raw: string | undefined | null): UbicacionNormalizada | null {
  if (!raw) return null;
  const collapsed = collapseSpaces(raw);
  if (!collapsed) return null;
  return {
    display: titleCase(collapsed),
    key: stripAccents(collapsed.toUpperCase()),
  };
}

/**
 * Parsea un monto en soles peruanos. Formatos: "S/ 1,234.56", "S/. 900",
 * "1234.56", "S/ 1 234,56" (miles con espacio o coma, decimal con punto).
 * Devuelve null si no es un monto PEN reconocible (p. ej. "US$ 100").
 */
export function parseMontoPEN(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const text = collapseSpaces(raw);
  if (!text) return null;
  // Moneda extranjera explícita (US$/USD/EUR/€/$) → no es un monto PEN, salvo
  // que el texto además empiece con el prefijo de soles "S/" o "S/.".
  if (/(US\$|USD|EUR|€|\$)/.test(text.toUpperCase()) && !/^S\/?\.?/.test(text)) {
    return null;
  }
  const cleaned = text.replace(/S\/?\.?/gi, '').replace(/[^\d.,\s]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\s/g, '').replace(/,/g, '.');
  // Si hay múltiples puntos, el último es el decimal y el resto separadores.
  const parts = normalized.split('.');
  const value = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : parts[0];
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toIntOrNull(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^\d+$/.exec(value.trim());
  return m ? Number(m[0]) : null;
}

/**
 * Normaliza una fila cruda del carrusel a `NormalizedRemate`.
 * Acepta montos opcionales (presentes en el detalle, T4.5) vía `montoRaw`.
 */
export function normalizeRemateSlide(
  slide: RemateSlide,
  montoRaw?: string | null,
): NormalizedRemate {
  const ubicacion = normalizeUbicacion(slide.ubicacion);
  return {
    source: 'remaju',
    parserVersion: REMAJU_PARSER_VERSION,
    remateId: toIntOrNull(slide.remate),
    convocatoriaId: toIntOrNull(slide.convocatoria),
    tipo: normalizeTipoConvocatoria(slide.tipoConvocatoria, slide.tipoLabel),
    tipoRaw: slide.tipoLabel?.trim() || slide.tipoConvocatoria?.trim() || null,
    ubicacion: ubicacion?.display ?? null,
    ubicacionKey: ubicacion?.key ?? null,
    fechaISO: slide.fechaISO ?? parseFechaRemaju(slide.fecha),
    esUltimoDiaInscripcion: slide.esUltimoDiaInscripcion,
    info: slide.info?.trim() || null,
    moneda: montoRaw ? 'PEN' : null,
    monto: parseMontoPEN(montoRaw),
  };
}