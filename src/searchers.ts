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
import { randomDelay, scrollPage } from './browser';
import { log } from './logs';
import { store, type ListingRow } from './store';
import { analyzeImage, type OcrData } from './ocr';

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
      if (
        newUrl &&
        /\/groups\/[^/]+\/(?:posts|permalink|multi_permalink)\//.test(newUrl) &&
        !/\/groups\/[^/]+\/(?:posts|permalink|multi_permalink)\//.test(prevUrl)
      ) {
        store.patch(card.key, { url_publicacion: newUrl, url: newUrl });
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

export async function searchGroup(
  page: Page,
  groupName: string,
  groupUrl: string,
  started: Date,
  query?: string
): Promise<SearchOutcome> {
  const idMatch = groupUrl.match(/groups\/([^\/?#]+)/);
  const groupId = idMatch ? idMatch[1] : 'group';

  // 1. Navegar directamente al feed principal del grupo (donde están todas las publicaciones recientes)
  const feedUrl = groupUrl.replace(/\/+$/, '') + '/';
  try {
    await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await scrollPage(page, Math.min(5, Math.max(3, config.maxScrolls)));
    // Esperar a que Facebook hidrate los enlaces de las publicaciones
    await page
      .waitForSelector(
        `a[href*="/groups/${groupId}/posts/"], a[href*="/groups/${groupId}/permalink/"], a[href*="set=gm."]`,
        { timeout: 12000 }
      )
      .catch(() => {});
    await page.waitForTimeout(1000);
  } catch (e) {
    log('warn', `  [grupo ${groupName}] Error al abrir feed: ${(e as Error).message}`);
  }

  let cards = await readGroupCards(page, groupId);

  const hasPermalink = (c: CardRaw) =>
    /\/groups\/[^/]+\/(?:posts|permalink|multi_permalink)\//.test(c.href || '') ||
    /set=gm\.\d+/.test(c.href || '');
  const withLink = cards.filter(hasPermalink);

  if (withLink.length === 0 && cards.length > 0) {
    // Reintentar scroll adicional si no detectó permalinks
    await page.waitForTimeout(1500);
    await scrollPage(page, 3);
    await page
      .waitForSelector(
        `a[href*="/groups/${groupId}/posts/"], a[href*="/groups/${groupId}/permalink/"], a[href*="set=gm."]`,
        { timeout: 8000 }
      )
      .catch(() => {});
    const retryCards = await readGroupCards(page, groupId);
    const seenKeys = new Set(cards.map((c) => c.key));
    for (const rc of retryCards) {
      if (hasPermalink(rc)) {
        if (!seenKeys.has(rc.key)) {
          cards.push(rc);
          seenKeys.add(rc.key);
        } else {
          const existing = cards.find((c) => c.key === rc.key);
          if (existing && !hasPermalink(existing)) existing.href = rc.href;
        }
      }
    }
  }

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

export { randomDelay };