import { PropertyDataSource } from '../base.js';
import type {
  ConnectorStatus,
  SearchParams,
  SearchResult,
  SearchResultItem,
  DetailResult,
} from '../base.js';
import { serverConfig } from '../../config.js';
import { logger } from '../../logger.js';
import {
  normalizeRemateSlide,
  parseFechaRemaju,
  stripAccents,
  type NormalizedRemate,
  type RemateSlide,
} from './remaju-normalize.js';
import { dedupeEntries } from './remaju-dedup.js';

export { parseFechaRemaju } from './remaju-normalize.js';
export type { NormalizedRemate, RemateSlide } from './remaju-normalize.js';

/**
 * REM@JU — Remate Electrónico Judicial (Poder Judicial del Perú).
 *
 * Scope (Fase 4 / T4.2): SOLO la superficie pública (home `/remaju/index.xhtml`),
 * sin login y sin CAPTCHA. La participación/inscripción exige autenticación +
 * CAPTCHA y NUNCA se automatiza (ver `docs/REMATE_JUDICIAL.md`).
 *
 * Anti-bots / legal:
 * - Una única sesión HTTP reutilizada + frecuencia baja (throttle 6s).
 * - User-Agent de identificación (REMAJU_USER_AGENT).
 * - 403/429 se reportan como degradación (unavailable/rate_limited),
 *   nunca como éxito simulado, y nunca se intenta evadir.
 */

export const REMAJU_HOME_URL = 'https://remaju.pj.gob.pe/remaju/index.xhtml';

const MIN_GAP_MS = 6_000;
const REQUEST_TIMEOUT_MS = 20_000;

interface PaRecord {
  [key: string]: string;
}

const PANEL_RE = /\s*<li class="ui-galleria-panel[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
const LABEL_RE = /<span class="text-bold">\s*([^<]+?)\s*<\/span>/;
const UBICACION_RE = /<i class="fa fa-map-marker"[^>]*><\/i>\s*([^<\n]+)/;
const FECHA_RE = /<div class="fecha">[\s\S]*?<i[^>]*><\/i>\s*(\d{2}\/\d{2}\/\d{4})/;
const INFO_RE = /<div class="info">([\s\S]*?)<\/div>/;
const PA_PAIR_RE = /\{name:(?:&quot;|")(\w+)(?:&quot;|"),value:(?:&quot;|")([^&"}\s]+)(?:&quot;|")\}/g;

/** Extrae el array `pa:[...]` (admitiendo `"` ó `&quot;`) a registros {name:value}. */
function parsePaArray(block: string): PaRecord[] {
  const records: PaRecord[] = [];
  let match: RegExpExecArray | null;
  const pairRe = new RegExp(PA_PAIR_RE.source, 'g');
  let current: PaRecord | null = null;
  for (const part of block.split('pa:[')) {
    if (part === block) continue;
    current = {};
    pairRe.lastIndex = 0;
    while ((match = pairRe.exec(part)) !== null) {
      const [, name, value] = match;
      if (!name) continue;
      current[name] = value;
    }
    if (Object.keys(current).length > 0) records.push(current);
    if (part.includes(']')) break;
  }
  return records;
}

/**
 * Parse the public home page of REM@JU and return the remates shown in the
 * carousel (render server-side, without any authentication).
 *
 * Robust by design: missing fields become `undefined`; a panel with neither
 * `convocatoria` nor `remate` is kept but has no stable id (callers may skip it).
 */
export function parseRemajuHome(html: string): RemateSlide[] {
  const slides: RemateSlide[] = [];
  let match: RegExpExecArray | null;
  const panelRe = new RegExp(PANEL_RE.source, 'g');
  while ((match = panelRe.exec(html)) !== null) {
    const block = match[1];
    if (!block) continue;

    const labelMatch = LABEL_RE.exec(block);
    const ubicacionMatch = UBICACION_RE.exec(block);
    const fechaMatch = FECHA_RE.exec(block);
    const infoMatch = INFO_RE.exec(block);

    let convocatoria: string | undefined;
    let tipoConvocatoria: string | undefined;
    let remate: string | undefined;
    for (const record of parsePaArray(block)) {
      if (convocatoria === undefined && typeof record.convocatoria === 'string') {
        convocatoria = record.convocatoria;
      }
      if (tipoConvocatoria === undefined && typeof record.tipoConvocatoria === 'string') {
        tipoConvocatoria = record.tipoConvocatoria;
      }
      if (remate === undefined && typeof record.remate === 'string') {
        remate = record.remate;
      }
      if (convocatoria !== undefined && remate !== undefined) break;
    }

    const fecha = fechaMatch ? fechaMatch[1].trim() : undefined;
    const info = infoMatch ? infoMatch[1].trim().replace(/\s+/g, ' ') : undefined;

    slides.push({
      convocatoria,
      tipoConvocatoria,
      remate,
      tipoLabel: labelMatch ? labelMatch[1].trim() : undefined,
      ubicacion: ubicacionMatch ? ubicacionMatch[1].trim() : undefined,
      fecha,
      fechaISO: parseFechaRemaju(fecha),
      info,
      esUltimoDiaInscripcion: stripAccents(info ?? '').toUpperCase().includes(
        stripAccents('ÚLTIMO DÍA DE INSCRIPCIÓN').toUpperCase(),
      ),
    });
  }
  return slides;
}

class RemajuSourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'rate_limited' | 'blocked',
  ) {
    super(message);
    this.name = 'RemajuSourceError';
  }
}

/** Cookie jar mínimo (jsessionid) para mantener una única sesión HTTP. */
let sessionCookie: string | null = null;
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  if (serverConfig.nodeEnv === 'test') return;
  const gap = Date.now() - lastRequestAt;
  if (gap < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  }
  lastRequestAt = Date.now();
}

function captureCookies(headers: Headers): void {
  const raw = headers.get('set-cookie');
  if (!raw) return;
  const [first] = raw.split(';');
  if (first) sessionCookie = first.trim();
}

async function fetchRemajuHome(htmlOnly = true): Promise<string> {
  await throttle();
  const url = serverConfig.remajuHomeUrl || REMAJU_HOME_URL;
  const res = await fetch(url, {
    headers: {
      'User-Agent': serverConfig.remajuUserAgent,
      Accept: htmlOnly ? 'text/html,application/xhtml+xml' : 'application/json',
      'Accept-Language': 'es',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  captureCookies(res.headers);

  if (res.status === 403 || res.status === 412) {
    throw new RemajuSourceError(`REM@JU bloqueó la petición (HTTP ${res.status})`, 'blocked');
  }
  if (res.status === 429) {
    throw new RemajuSourceError('REM@JU rate-limited (HTTP 429)', 'rate_limited');
  }
  if (!res.ok) {
    throw new RemajuSourceError(`REM@JU responded ${res.status}`, 'unavailable');
  }
  return res.text();
}

function slideToItem(slide: RemateSlide, normalized: NormalizedRemate): SearchResultItem | null {
  const id = normalized.remateId ?? normalized.convocatoriaId;
  if (id === null) return null;
  const title = [slide.tipoLabel, normalized.ubicacion].filter(Boolean).join(' · ');
  return {
    externalId: `remaju:remate:${id}`,
    sourceUrl: `${REMAJU_HOME_URL}?remate=${id}`,
    title: title || `Remate ${id}`,
    district: normalized.ubicacion ?? slide.ubicacion,
    description: slide.info,
    rawData: { ...slide, normalized } as unknown as Record<string, unknown>,
  };
}

/**
 * Real REM@JU connector (public surface only).
 *
 * @see https://remaju.pj.gob.pe/  /  `docs/REMATE_JUDICIAL.md`
 */
export class RemajuConnector extends PropertyDataSource {
  readonly sourceId = 'remaju' as const;
  readonly sourceName = 'Remates Electrónicos Judiciales (REM@JU)';

  async getStatus(): Promise<ConnectorStatus> {
    try {
      const html = await fetchRemajuHome();
      const slides = parseRemajuHome(html);
      if (slides.length === 0) {
        return {
          sourceId: 'remaju',
          status: 'unavailable',
          message: 'REM@JU respondió pero no se detectaron remates en la página pública',
          lastChecked: new Date(),
        };
      }
      return {
        sourceId: 'remaju',
        status: 'available',
        message: `REM@JU público accesible (${slides.length} remates en el home)`,
        lastChecked: new Date(),
      };
    } catch (err) {
      const kind = err instanceof RemajuSourceError ? err.kind : 'unavailable';
      return {
        sourceId: 'remaju',
        status: kind === 'rate_limited' ? 'rate_limited' : 'unavailable',
        message: err instanceof Error ? err.message : 'REM@JU no disponible',
        lastChecked: new Date(),
      };
    }
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const wanted = (params.query ?? params.district ?? '').trim();
    try {
      const html = await fetchRemajuHome();
      let entries = parseRemajuHome(html).map((slide) => ({
        raw: slide,
        normalized: normalizeRemateSlide(slide),
      }));

      if (wanted) {
        const needle = stripAccents(wanted.toUpperCase());
        entries = entries.filter((entry) => (entry.normalized.ubicacionKey ?? '').includes(needle));
      }

      const { unique, duplicates } = dedupeEntries(entries);
      if (duplicates.length > 0) {
        logger.debug(
          { dropped: duplicates.length, kept: unique.length },
          'REM@JU dedup descartó ocurrencias repetidas',
        );
      }

      const allItems: SearchResultItem[] = [];
      for (const entry of unique) {
        const item = slideToItem(entry.raw, entry.normalized);
        if (item) allItems.push(item);
      }
      const totalFound = allItems.length;
      const items = params.limit !== undefined ? allItems.slice(0, params.limit) : allItems;
      return { items, totalFound, source: 'remaju', searchedAt: new Date() };
    } catch (err) {
      logger.warn({ err, query: wanted }, 'REM@JU public home fetch failed');
      return { items: [], totalFound: 0, source: 'remaju', searchedAt: new Date() };
    }
  }

  async getDetails(_externalId: string): Promise<DetailResult> {
    return {
      found: false,
      source: 'remaju',
      retrievedAt: new Date(),
      requiresManualAction: false,
    };
  }
}

/** Singleton instance. */
export const remajuConnector = new RemajuConnector();