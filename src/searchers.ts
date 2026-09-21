import type { Page } from 'playwright';
import { config } from './config';
import { readGroupCards, readMarketplaceCards, type CardRaw } from './extract';
import {
  classifyTipo,
  detectRealDistrict,
  extractM2,
  extractPhones,
  firstMeaningfulLine,
  isRealEstateItem,
  parsePrice,
  relativeDate,
} from './detect';
import { randomDelay, scrollPage, sleep } from './browser';
import { log } from './logs';
import { store, type ListingRow } from './store';
import { analyzeImage, type OcrData } from './ocr';
import { classifyPublicationUrl, isCanonicalPermalink } from './links';

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
}

function buildMarketplaceUrl(query: string): string {
  const q = encodeURIComponent(query);
  const base = config.marketplaceBaseUrl;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}query=${q}&daysSinceListed=1&sortBy=creation_time_descend`;
}

function cleanTitleString(card: CardRaw): string {
  if (card.rawTitle && card.rawTitle.trim()) {
    return card.rawTitle.trim();
  }
  if (card.label && card.label.trim()) {
    return card.label
      .replace(/,\s*publicaci[oó]n\s*\d+/i, '')
      .replace(/,\s*(?:S\/|\$|Gratis)[^,]+/i, '')
      .replace(/,\s*[^,]+,\s*AR$/i, '')
      .trim();
  }
  return firstMeaningfulLine(card.text);
}

export function cardToRow(card: CardRaw, started: Date, ocr?: OcrData | null): ListingRow {
  const title = cleanTitleString(card);
  const fullText = (card.label ? card.label + ' ' : '') + card.text;

  // Extraer teléfonos sin falsos positivos de IDs de publicación
  const phones = extractPhones(fullText, card.key);
  let finalPhone = phones[0]?.phone ?? '';

  // Precio inicial de Facebook
  const price = parsePrice(card.rawPrice || fullText);
  let finalPrice = price.price;
  let finalCurrency = price.currency;
  let precioRealAfiche = '';

  // Metraje m2
  let finalM2 = extractM2(fullText);

  // Enriquecer con OCR si está disponible
  if (ocr) {
    // 1. Teléfono del afiche (si no había o si el afiche lo tiene)
    if (ocr.phones.length > 0) {
      if (!finalPhone) {
        finalPhone = ocr.phones[0];
      }
    }
    // 2. Precio real del afiche (los vendedores suelen poner S/35 o S/1 en FB como gancho)
    if (ocr.prices.length > 0) {
      const topOcrPrice = ocr.prices[0];
      precioRealAfiche = topOcrPrice.price;
      const numFb = parseInt(finalPrice || '0', 10);
      if (numFb < 500 && parseInt(topOcrPrice.price, 10) >= 500) {
        finalPrice = topOcrPrice.price;
        finalCurrency = topOcrPrice.currency;
      }
    }
    // 3. Metraje m2 del afiche
    if (!finalM2 && ocr.m2) {
      finalM2 = ocr.m2;
    }
  }

  // Detección estricta y priorizada del distrito REAL
  const distRes = detectRealDistrict({
    title,
    ocrText: ocr?.text || '',
    description: card.text,
    marketplaceLocation: card.rawLocation || '',
  });

  return {
    id_publicacion: card.key,
    fecha_busqueda: isoDate(started),
    hora_busqueda: isoTime(started),
    fecha_publicacion: relativeDate(fullText) || 'hoy',
    tipo: classifyTipo(title + ' ' + (ocr?.text || '') + ' ' + card.text),
    titulo: title,
    descripcion: card.text.slice(0, 2000),
    m2: finalM2,
    distrito: distRes.district,
    distrito_origen: distRes.source,
    precio: finalPrice,
    moneda: finalCurrency,
    precio_real_afiche: precioRealAfiche,
    telefono: finalPhone,
    imagen_url: card.imageUrl || '',
    url_publicacion: card.href,
    url: card.href,
    fuente: card.href.includes('/groups/') || card.key.includes('_') ? 'grupo' : 'marketplace',
    link_status: classifyPublicationUrl(card.href),
  };
}

export interface SearchOutcome {
  count: number;
  inserted: number;
}

async function storeRows(cards: CardRaw[], started: Date): Promise<number> {
  const slice = cards.slice(0, config.capPerSearch);
  let inserted = 0;

  for (const card of slice) {
    const title = cleanTitleString(card);
    const isNew = !store.has(card.key);

    // Consolidación cross-key: si esta publicación real (href canónico) ya
    // existe bajo otra clave sintética (p. ej. `p_…` de una pasada anterior),
    // eliminar el duplicado para que la fila con permalink real la reemplace
    // (evita duplicar la misma publicación cuando Facebook recién hidrata el
    // permalink — hoy `insert` crea una fila nueva con clave distinta).
    if (isNew && card.key.includes('_') && isCanonicalPermalink(card.href) && card.href) {
      const prefix = card.key.split('_')[0];
      const dup = store.findByHref(card.href, prefix);
      if (dup && dup.id_publicacion && dup.id_publicacion !== card.key) {
        store.delete(dup.id_publicacion);
      }
    }

    let ocrData: OcrData | null = null;
    if (isNew && card.imageUrl) {
      try {
        ocrData = await analyzeImage(card.imageUrl, card.key);
      } catch {}
    }

    const fullTextForCheck = `${title} ${card.text} ${ocrData?.text || ''}`;
    if (!isRealEstateItem(title, fullTextForCheck)) {
      continue; // Ignorar productos no inmobiliarios
    }

    const row = cardToRow(card, started, ocrData);
    if (store.insert(row)) {
      inserted++;
    } else {
      // Corregir enlaces de grupo guardados antes con la URL del feed (no la de la publicación)
      const prev = store.get(card.key);
      const prevUrl = (prev && (prev.url_publicacion || prev.url)) || '';
      const newUrl = row.url_publicacion || '';
      if (newUrl && isCanonicalPermalink(newUrl) && !isCanonicalPermalink(prevUrl)) {
        store.patch(card.key, { url_publicacion: newUrl, url: newUrl, link_status: 'permalink' });
      }
    }
  }
  return inserted;
}

export async function searchMarketplace(page: Page, query: string, started: Date): Promise<SearchOutcome> {
  const url = buildMarketplaceUrl(query);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 30000 }).catch(() => {});
  await scrollPage(page, config.maxScrolls);
  const cards = await readMarketplaceCards(page);
  const inserted = await storeRows(cards, started);
  log('info', `  [marketplace] "${query}" -> ${cards.length} publicaciones (${inserted} nuevas)`);
  return { count: cards.length, inserted };
}

async function scrollFeedOnce(page: Page): Promise<void> {
  await page.mouse.move(650, 450).catch(() => {});
  await page.mouse.wheel(0, 1500).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, 900)).catch(() => {});
  await sleep(1100 + Math.random() * 900);
}

/**
 * Recorre el feed del grupo con scroll "hasta agotar": sigue bajando mientras
 * aparezcan tarjetas nuevas y corta después de `staleLimit` pasadas vacías (o
 * del tope `maxScrolls`). Facebook virtualiza el feed (solo ~5 tiles en el DOM
 * a la vez + posts fijados), por lo que un scroll fijo corto deja de ver la
 * mayoría de las publicaciones nuevas de cada ciclo.
 */
async function collectGroupCardsExhaust(
  page: Page,
  groupId: string,
  opts?: { maxScrolls?: number; minScrolls?: number }
): Promise<CardRaw[]> {
  const minScrolls = opts?.minScrolls ?? Math.max(8, config.maxScrolls * 2);
  const maxScrolls = opts?.maxScrolls ?? Math.max(24, config.maxScrolls * 4);
  const staleLimit = 3;

  const cards: CardRaw[] = [];
  const seen = new Set<string>();
  let stale = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const found = await readGroupCards(page, groupId);
    let added = 0;
    for (const c of found) {
      if (seen.has(c.key)) {
        // Si una pasada posterior hidrata el permalink real, actualizar el href
        const existing = cards.find((x) => x.key === c.key);
        if (existing && isCanonicalPermalink(c.href) && !isCanonicalPermalink(existing.href)) {
          existing.href = c.href;
        }
        continue;
      }
      seen.add(c.key);
      cards.push(c);
      added++;
    }
    stale = added > 0 ? 0 : stale + 1;
    if (i + 1 >= minScrolls && stale >= staleLimit) break;
    if (i + 1 >= maxScrolls) break;
    await scrollFeedOnce(page);
  }

  return cards;
}

export async function searchGroup(
  page: Page,
  groupName: string,
  groupUrl: string,
  started: Date,
  query?: string
): Promise<SearchOutcome> {
  const idMatch = groupUrl.match(/groups\/([^\/?#]+)/);
  const groupId = idMatch ? idMatch[1] : 'group';
  const base = groupUrl.replace(/\/+$/, '');

  // 1. Abrir el feed ordenado por "Más recientes": así evitamos quedarnos en
  //    el tope de posts fijados/destacados (los "4 repetidos" de cada ciclo)
  //    y sí vemos todo lo publicado en la última hora. Fallback a la URL plana.
  const openFeed = async (feedUrl: string): Promise<void> => {
    await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
  };

  try {
    await openFeed(`${base}/?sort=RECENT_POSTS`);
  } catch (e) {
    log('warn', `  [grupo ${groupName}] Error al abrir feed: ${(e as Error).message}`);
  }

  const feedReady = (await page.locator('[role="feed"]').count().catch(() => 0)) > 0;
  if (!feedReady) {
    await openFeed(`${base}/`).catch(() => {});
  }
  await page.waitForTimeout(1200);

  // 2. Scroll hasta agotar para no perder las 10-15 publicaciones de la hora
  let cards = await collectGroupCardsExhaust(page, groupId);

  // Fallback inteligente: si una publicación no tiene permalink directo,
  // crear un enlace de búsqueda interno del grupo con las palabras clave de su título
  for (const c of cards) {
    if (!c.href || c.href === `https://www.facebook.com/groups/${groupId}`) {
      const words = (c.rawTitle || c.label || c.text || '')
        .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
        .replace(/\b(publicaci[oó]n|facebook|precio|venta|vendo|remato|ocasi[oó]n|gratis|d[oó]lares|soles|informes|whatsapp|inmobiliaria)\b/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 4)
        .join(' ');
      c.href = words
        ? `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(words)}`
        : `https://www.facebook.com/groups/${groupId}`;
    }
  }

  const inserted = await storeRows(cards, started);

  log('info', `  [grupo ${groupName}] -> ${cards.length} publicaciones encontradas (${inserted} nuevas)`);
  return { count: cards.length, inserted };
}

/**
 * Backfill dirigido: re-visita el feed de un grupo y actualiza en la base las
 * filas existentes que aún no tienen permalink real, usando los enlaces que
 * Facebook ya hidrata en esta nueva pasada. No inserta publicaciones nuevas.
 */
function normalizeTitleForMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeTitleForMatch(a).split(/\s+/).filter((w) => w.length > 3));
  const tb = new Set(normalizeTitleForMatch(b).split(/\s+/).filter((w) => w.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

export async function recoverGroupLinks(
  page: Page,
  groupName: string,
  groupUrl: string
): Promise<{ scanned: number; fixed: number }> {
  const idMatch = groupUrl.match(/groups\/([^\/?#]+)/);
  const groupId = idMatch ? idMatch[1] : 'group';
  const base = groupUrl.replace(/\/+$/, '');

  try {
    await page.goto(`${base}/?sort=RECENT_POSTS`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    log('warn', `  [recover ${groupName}] Error al abrir feed: ${(e as Error).message}`);
  }
  const feedReady = (await page.locator('[role="feed"]').count().catch(() => 0)) > 0;
  if (!feedReady) {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  const cards = await collectGroupCardsExhaust(page, groupId, { minScrolls: 6, maxScrolls: 20 });
  let fixed = 0;

  // Candidatas ya guardadas de este grupo que aún no tienen permalink real
  const pending = store
    .listByPrefix(groupId)
    .filter((r) => !isCanonicalPermalink(r.url_publicacion || r.url || ''));
  const pendingPool = pending.map((row) => ({
    row,
    title: normalizeTitleForMatch(row.titulo || ''),
    desc: normalizeTitleForMatch(row.descripcion || ''),
  }));

  for (const card of cards) {
    if (!isCanonicalPermalink(card.href)) continue;
    const cardText = normalizeTitleForMatch(card.text);

    // 1) Fila con la misma clave → actualizar URL a permalink real
    const prev = store.get(card.key);
    if (prev) {
      const prevUrl = prev.url_publicacion || prev.url || '';
      if (!isCanonicalPermalink(prevUrl)) {
        store.patch(card.key, { url_publicacion: card.href, url: card.href, link_status: 'permalink' });
        fixed++;
      }
      continue;
    }

    // 2) Fila sintética que coincide por contenido → escribirle el permalink real
    let best: { row: ListingRow; score: number } | null = null;
    for (const cand of pendingPool) {
      if (cand.row.id_publicacion === card.key) continue;
      const score = Math.max(tokenOverlap(cardText, cand.title), tokenOverlap(cardText, cand.desc));
      if (score >= 0.5 && (!best || score > best.score)) best = { row: cand.row, score };
    }
    if (best) {
      const cur = best.row.url_publicacion || best.row.url || '';
      if (!isCanonicalPermalink(cur)) {
        store.patch(best.row.id_publicacion, { url_publicacion: card.href, url: card.href, link_status: 'permalink' });
        fixed++;
        const idx = pendingPool.findIndex((c) => c.row.id_publicacion === best!.row.id_publicacion);
        if (idx >= 0) pendingPool.splice(idx, 1);
      }
      continue;
    }

    // 3) Duplicado real con el mismo permalink bajo otra clave → consolidar
    const dup = store.findByHref(card.href, groupId);
    if (dup && dup.id_publicacion && dup.id_publicacion !== card.key) {
      store.delete(dup.id_publicacion);
      fixed++;
    }
  }

  return { scanned: cards.length, fixed };
}

export { randomDelay };