/**
 * SUNARP — Normalización registral (Fase 5 / T5.4).
 *
 * Convierte los datos de la partida registral capturados por el operador (vía
 * SPRL / Conoce Aquí / Consulta de Propiedad) en un shape canónico y tipado,
 * alineado con las tablas `registry_properties` / `registry_owners` /
 * `registry_charges` y con el requisito de CACHE de SPRL:
 *
 *   "La primera consulta de una partida se paga y su detalle queda almacenado
 *    en la base de datos local; las búsquedas posteriores de la misma partida
 *    se resuelven contra la clave canónica (registry_number = 'P-XXXXXXXX')
 *    SIN volver a pagar."
 *
 * La clave canónica de la partida (`P-XXXXXXXX`, Zona Registral XII — Arequipa,
 * prefijo de oficina 110 opcional) es lo que permite deduplicar el cache.
 *
 * Sin red, sin efectos: módulo puro y testeable.
 */

export const SUNARP_PARSER_VERSION = 'v1';

/** Prefijos de oficina registral de la Zona XII (Arequipa) detectados. */
export const SUNARP_ZONA_XII_AREA_CODE = '110';
export const SUNARP_ZONA_XII_AREA_NAME = 'Zona Registral N° XII — Sede Arequipa';

/* ------------------------------------------------------------------ *
 * Helpers base
 * ------------------------------------------------------------------ */

/** Quita acentos/diacríticos (para claves de comparación). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Convierte a texto cualquier valor capturado (número, fecha, cadena). */
function toText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

/** Title-case preservando acentos ("jose luis torres" → "Jose Luis Torres"). */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_all, lead: string, ch: string) => lead + ch.toUpperCase())
    // Preserva acrónimos con puntos ("S.A.C." → "S.A.C.", no "S.a.c.").
    .replace(/\.(\p{L})/gu, (m) => m.toUpperCase());
}

function readField(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

/** "10/05/2020" o "2020-05-10" → "2020-05-10" (ISO). Null si no cuadra. */
export function parseFechaISO(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------------------------------------------------------ *
 * Partida registral (clave canónica del cache)
 * ------------------------------------------------------------------ */

export interface PartidaNormalizada {
  ok: boolean;
  /** Canónico 'P-XXXXXXXX' — valor a guardar en registry_properties.registry_number. */
  partida: string | null;
  /** 8 dígitos, sin prefijo. */
  digits: string | null;
  /** Prefijo de oficina de la Zona XII si se detectó (p. ej. '110'). */
  areaCode: string | null;
  warnings: string[];
  raw: string | null;
  error?: string;
}

/**
 * Normaliza una referencia de partida a la clave canónica `P-XXXXXXXX`.
 * Acepta: "P-12345678", "p12345678", "P 1234 5678", "12345678",
 * "11012345678" (11 dígitos = oficina 110 + 8 de partida), "110 12345678".
 */
export function normalizeRegistryPartida(input: unknown): PartidaNormalizada {
  const raw = input == null ? '' : String(input);
  const trimmed = raw.trim();
  const warnings: string[] = [];

  if (!trimmed) {
    return {
      ok: false,
      partida: null,
      digits: null,
      areaCode: null,
      warnings,
      raw: trimmed,
      error: 'Partida vacía',
    };
  }

  let text = trimmed.toUpperCase().replace(/\s+/g, '');
  text = text.replace(/^P[.\-_]?/, '');
  const digits = text.replace(/[^\d]/g, '');

  if (!digits) {
    return {
      ok: false,
      partida: null,
      digits: null,
      areaCode: null,
      warnings,
      raw: trimmed,
      error: 'Partida sin dígitos',
    };
  }

  let areaCode: string | null = null;
  let core = digits;
  if (digits.length >= 10 && digits.startsWith(SUNARP_ZONA_XII_AREA_CODE)) {
    areaCode = SUNARP_ZONA_XII_AREA_CODE;
    core = digits.slice(3);
    if (digits.length !== 10 && digits.length !== 11) {
      warnings.push(`Dígitos con prefijo ${areaCode} inusuales (${digits.length})`);
    }
  }

  if (core.length < 8) {
    core = core.padStart(8, '0');
    warnings.push(`Partida con ${digits.length} dígitos: se rellenó a 8`);
  }
  if (core.length > 8) {
    return {
      ok: false,
      partida: null,
      digits: null,
      areaCode,
      warnings,
      raw: trimmed,
      error: `Partida con ${core.length} dígitos (máx. 8)`,
    };
  }

  const partida = `P-${core}`;
  const finalWarnings = [...warnings];
  if (areaCode) {
    finalWarnings.push(`Prefijo de oficina ${areaCode} (${SUNARP_ZONA_XII_AREA_NAME}) detectado`);
  }
  return { ok: true, partida, digits: core, areaCode, warnings: finalWarnings, raw: trimmed };
}

/**
 * Clave canónica para buscar en DB (registry_properties.registry_number).
 * Devuelve null si la referencia no es una partida válida.
 */
export function registryLookupKey(input: unknown): string | null {
  const n = normalizeRegistryPartida(input);
  return n.ok ? n.partida : null;
}

/* ------------------------------------------------------------------ *
 * Campos del captura (owners / charges)
 * ------------------------------------------------------------------ */

/** "JOSE LUIS TORRES" → "Jose Luis Torres" (con acentos). */
export function normalizeOwnerName(raw: unknown): string | null {
  const text = raw == null ? '' : String(raw);
  const collapsed = collapseSpaces(text);
  return collapsed ? titleCase(collapsed) : null;
}

/** DNI | RUC | CE | PASAPORTE | other. */
export function normalizeDocumentType(raw: unknown): string {
  const text = stripAccents(raw == null ? '' : String(raw))
    .trim()
    .toUpperCase();
  if (!text) return 'other';
  if (text === 'DNI') return 'DNI';
  if (text === 'RUC') return 'RUC';
  if (text === 'CE' || /CARN.E|CARNET/.test(text)) return 'CE';
  if (/PASAPORTE|PASS/.test(text)) return 'PASAPORTE';
  return 'other';
}

/** persona_natural | persona_juridica | desconocido. */
export function normalizeOwnerType(raw: unknown): string {
  const text = stripAccents(raw == null ? '' : String(raw))
    .trim()
    .toUpperCase();
  if (!text) return 'desconocido';
  if (/NATURAL|FISICA/.test(text)) return 'persona_natural';
  if (/JURIDICA|SOC\.|S.A\.?C|S\.?R\.?L|S\.?A\.?$|EMPRESA|SOCIEDAD|ESTADO|MUNICIPALIDAD|BANCO/.test(text)) {
    return 'persona_juridica';
  }
  return 'desconocido';
}

/** "50%" / "50" / "0.5" → 50. */
export function parseOwnershipPercentage(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const m = /^([\d.,]+)\s*(%|por ciento)?$/i.exec(text);
  if (!m) return null;
  const cleaned = m[1].replace(/,/g, '.');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  const value = m[2] ? num : num > 0 && num <= 1 ? num * 100 : num;
  if (value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

/** hipoteca | embargo | medida_cautelar | anotacion_demanda | prohibicion | servidumbre | usufructo | other. */
export function normalizeChargeType(raw: unknown): string {
  const text = stripAccents(raw == null ? '' : String(raw))
    .trim()
    .toUpperCase();
  if (!text) return 'other';
  if (text.includes('HIPOTEC')) return 'hipoteca';
  if (text.includes('EMBARG')) return 'embargo';
  if (text.includes('MEDIDA CAUTELAR') || text.includes('CAUTELAR')) return 'medida_cautelar';
  if (text.includes('ANOTACION DE DEMANDA') || text.includes('ANOTACION')) return 'anotacion_demanda';
  if (text.includes('PROHIBICION')) return 'prohibicion';
  if (text.includes('SERVIDUMBRE')) return 'servidumbre';
  if (text.includes('USUFRUCTO')) return 'usufructo';
  return 'other';
}

/** si | no | unknown. */
export function normalizeIsActive(raw: unknown): 'si' | 'no' | 'unknown' {
  const text = stripAccents(raw == null ? '' : String(raw))
    .trim()
    .toUpperCase();
  if (!text) return 'unknown';
  if (text === 'SI' || /VIGENTE/.test(text) || /ACTIVO/.test(text)) return 'si';
  if (text === 'NO' || /CANCELAD|CADUCAD|EXTINGUID|LEVANTAD/.test(text)) return 'no';
  return 'unknown';
}

/** "380 m2", "1,234.56", 380 → número de m². Null si no cuadra. */
export function normalizeAreaM2(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  const text = String(raw).trim().toUpperCase();
  if (!text) return null;
  // Quita la unidad antes de extraer dígitos ("380 m2" → 380, no 3802).
  const withoutUnit = text.replace(/\s*(M2|MT2|MTS2|M²|METROS?2|METROS?\s+CUADRADOS?|CUADRADOS?)\s*$/i, '');
  const cleaned = withoutUnit.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/,/g, '.');
  const parts = normalized.split('.');
  const value = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : parts[0];
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** "S/ 1,234.56", "1234", 500 → número. Null si no es un número reconocible. */
export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim();
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,\s]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\s/g, '').replace(/,/g, '.');
  const parts = normalized.split('.');
  const value = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}` : parts[0];
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** S/ | PEN → 'PEN'; US$ | USD → 'USD'; default 'PEN'. */
export function normalizeCurrency(raw: unknown): string {
  const text = (raw == null ? '' : String(raw)).toUpperCase().trim();
  if (!text) return 'PEN';
  if (text === 'USD' || text === 'US$' || text === 'DOLARES' || text === 'DÓLARES') return 'USD';
  return 'PEN';
}

/* ------------------------------------------------------------------ *
 * Captura completa
 * ------------------------------------------------------------------ */

export interface PropietarioNormalizado {
  ownerName: string | null;
  ownerType: string;
  documentType: string;
  documentNumber: string | null;
  ownershipPercentage: number | null;
  registeredDate: string | null;
}

export interface CargaNormalizada {
  chargeType: string;
  description: string | null;
  amount: number | null;
  currency: string;
  creditor: string | null;
  registeredDate: string | null;
  isActive: string;
}

export interface CapturaRegistralInput {
  partida?: unknown;
  propietarios?: Array<Record<string, unknown>>;
  cargas?: Array<Record<string, unknown>>;
  area?: unknown;
  direccion?: unknown;
  distrito?: unknown;
  oficina?: unknown;
  zona?: unknown;
}

export interface CapturaRegistralNormalizada {
  parserVersion: string;
  partida: string | null;
  areaCode: string | null;
  registeredAreaM2: number | null;
  registeredAddress: string | null;
  registeredDistrict: string | null;
  registryOffice: string | null;
  registryZone: string | null;
  propietarios: PropietarioNormalizado[];
  cargas: CargaNormalizada[];
  warnings: string[];
}

function normalizePropietario(input: Record<string, unknown>): PropietarioNormalizado {
  const percentageRaw = readField(input, ['ownershipPercentage', 'porcentaje', 'percentage']);
  const dateRaw = readField(input, ['registeredDate', 'fechaInscripcion', 'fecha']);
  return {
    ownerName: normalizeOwnerName(readField(input, ['ownerName', 'nombre', 'name', 'titular'])),
    ownerType: normalizeOwnerType(readField(input, ['ownerType', 'tipo', 'type'])),
    documentType: normalizeDocumentType(readField(input, ['documentType', 'tipoDocumento'])),
    documentNumber: collapseSpaces(toText(readField(input, ['documentNumber', 'numeroDocumento', 'documento']))) || null,
    ownershipPercentage: parseOwnershipPercentage(percentageRaw),
    registeredDate: parseFechaISO(toText(dateRaw)),
  };
}

function normalizeCarga(input: Record<string, unknown>): CargaNormalizada {
  const montoRaw = readField(input, ['amount', 'monto']);
  const monedaRaw = readField(input, ['currency', 'moneda']);
  return {
    chargeType: normalizeChargeType(readField(input, ['chargeType', 'tipo', 'type'])),
    description: collapseSpaces(toText(readField(input, ['description', 'descripcion']))) || null,
    amount: parseAmount(montoRaw),
    currency: normalizeCurrency(monedaRaw),
    creditor: normalizeOwnerName(readField(input, ['creditor', 'acreedor', 'beneficiario'])),
    registeredDate: parseFechaISO(toText(readField(input, ['registeredDate', 'fechaInscripcion', 'fecha']))),
    isActive: normalizeIsActive(readField(input, ['isActive', 'vigente', 'estado'])),
  };
}

/**
 * Normaliza una captura registral completa para persistir en
 * `registry_properties` / `registry_owners` / `registry_charges`.
 * Nunca inventa valores: los campos ausentes quedan en null/desconocido y se
 * recogen warnings.
 */
export function normalizeRegistryCapture(input: CapturaRegistralInput): CapturaRegistralNormalizada {
  const partida = normalizeRegistryPartida(input.partida);
  const district = normalizeOwnerName(input.distrito); // reutiliza title-case
  const address = normalizeOwnerName(input.direccion);
  const office = normalizeOwnerName(input.oficina);
  const zone = normalizeOwnerName(input.zona);

  const warnings = [...partida.warnings];
  if (!partida.ok) {
    warnings.push(`Partida no válida: ${partida.error ?? 'desconocido'}`);
  }

  const propietarios = Array.isArray(input.propietarios)
    ? input.propietarios.map(normalizePropietario)
    : [];
  const cargas = Array.isArray(input.cargas) ? input.cargas.map(normalizeCarga) : [];
  if (propietarios.length === 0) warnings.push('Captura sin propietarios');
  if (cargas.length === 0) warnings.push('Captura sin cargas declaradas');

  return {
    parserVersion: SUNARP_PARSER_VERSION,
    partida: partida.ok ? partida.partida : null,
    areaCode: partida.areaCode,
    registeredAreaM2: normalizeAreaM2(input.area),
    registeredAddress: address,
    registeredDistrict: district,
    registryOffice: office,
    registryZone: zone,
    propietarios,
    cargas,
    warnings,
  };
}