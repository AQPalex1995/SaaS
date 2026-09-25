import type { Locator, Page, Response as PwResponse } from 'playwright';
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
  let title = (card.rawTitle || '').trim();
  title = title.replace(/\b(?:Facebook\s*)+/gi, ' ').replace(/\s+/g, ' ').trim();
  if (title && title.length > 5) {
    return title;
  }
  if (card.label && card.label.trim()) {
    let lbl = card.label
      .replace(/\b(?:Facebook\s*)+/gi, ' ')
      .replace(/,\s*publicaci[oó]n\s*\d+/i, '')
      .replace(/,\s*(?:S\/|\$|Gratis)[^,]+/i, '')
      .replace(/,\s*[^,]+,\s*AR$/i, '')
      .trim();
    if (lbl && lbl.length > 5) return lbl;
  }
  return firstMeaningfulLine(card.text.replace(/\b(?:Facebook\s*)+/gi, ' ')) || 'Publicación en grupo';
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
  await scrollPage(page, config.marketplaceScrolls ?? 4);
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

/* ─────────────────────────────────────────────────────────────
   Recuperación de permalink vía botón "Compartir"
   ─────────────────────────────────────────────────────────────
   Facebook no siempre expone el enlace canónico de un post de grupo
   (feed virtualizado). Pero el menú Compartir (botón junto a Me gusta /
   Comentar) ofrece "Copiar enlace", y ESO sí revela el permalink real
   del post (bien sea /groups/{id}/posts/{pid} o facebook.com/share/p/…).
   Simulamos lo que haría un usuario: clic en Compartir → Copiar enlace →
   leemos el portapapeles y construimos el enlace usable.
*/

/** Extrae el id real del post desde una URL/texto capturado. */
function postIdFromUrl(raw: string, groupId: string): string | null {
  if (!raw) return null;
  let m = raw.match(new RegExp(`/groups/${groupId}/(?:posts|permalink|multi_permalink)/(\\d+)`));
  if (m) return m[1];
  m = raw.match(/[?&](?:story_fbid|multi_permalinks)=(\d+)/);
  if (m) return m[1];
  m = raw.match(/[?&]set=gm\.(\d+)/);
  if (m) return m[1];
  m = raw.match(/(?:posts|permalink|multi_permalink)\/(\d+)/);
  if (m) return m[1];
  return null;
}

/** Detecta un enlace de compartir global facebook.com/share/… */
function shareUrlFromText(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/https?:\/\/www\.facebook\.com\/share\/[a-z]\/[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

/** Convierte lo capturado en la mejor URL usable del post. */
function postUrlFromRaw(raw: string, groupId: string): string | null {
  const pid = postIdFromUrl(raw, groupId);
  if (pid) return `https://www.facebook.com/groups/${groupId}/posts/${pid}`;
  return shareUrlFromText(raw);
}

/** Clic en el botón Compartir dentro del artículo visible. */
async function clickShareButtonOf(article: Locator): Promise<boolean> {
  const selectors = [
    // Español
    'div[role="button"][aria-label*="Compartir"]',
    'div[role="button"][aria-label*="Enviar"]',
    'a[aria-label*="Compartir"]',
    '[aria-label*="Compartir"]',
    // Inglés
    'div[role="button"][aria-label*="Share"]',
    'div[role="button"][aria-label*="Send"]',
    'a[aria-label*="Share"]',
    '[aria-label*="Share"]',
    // Texto (Playwright :has-text)
    'div[role="button"]:has-text("Compartir")',
    'div[role="button"]:has-text("Share")',
    'a:has-text("Compartir")',
    'a:has-text("Share")',
  ];
  for (const sel of selectors) {
    const btn = article.locator(sel).first();
    try {
      if (await btn.isVisible({ timeout: 900 }).catch(() => false)) {
        await btn.click({ timeout: 1500 });
        return true;
      }
    } catch {}
  }
  return false;
}

/** Escanea el panel/menú de compartir por enlaces al post (fallback sin portapapeles). */
async function collectShareSurfaceUrls(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const out: string[] = [];
      const pick = (el: Element): void => {
        const a = el as HTMLAnchorElement;
        const val = (a.href || (el as HTMLInputElement).value || '') as string;
        if (val && /facebook\.com/.test(val)) {
          const t = val.toLowerCase();
          if (
            t.includes('story_fbid') ||
            t.includes('/posts/') ||
            t.includes('permalink') ||
            t.includes('multi_permalinks') ||
            t.includes('set=gm') ||
            t.includes('/share/')
          ) {
            out.push(val);
          }
        }
      };
      // Search in dialogs, menus, popover surfaces, and any visible overlay
      document
        .querySelectorAll(
          'div[role="dialog"] a[href], div[role="menu"] a[href], ' +
          'div[role="listbox"] a[href], [data-pagelet] a[href], ' +
          'div[role="dialog"] input, div[role="menu"] input, ' +
          'div[role="dialog"] textarea, div[role="menu"] textarea, ' +
          '[role="dialog"] [aria-label*="enlace"] a[href], ' +
          '[role="menu"] [aria-label*="enlace"] a[href], ' +
          '[role="dialog"] [aria-label*="link"] a[href], ' +
          '[role="menu"] [aria-label*="link"] a[href]'
        )
        .forEach((el) => pick(el));
      return out;
    })
    .catch(() => []);
}

/** Cierra el menú Compartir abierto (Escape + botón de cierre si queda dialog). */
async function dismissShareSurface(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  const closeBtn = page.locator('div[aria-label="Cerrar"], div[aria-label="Close"]').first();
  try {
    if (await closeBtn.isVisible({ timeout: 600 }).catch(() => false)) {
      await closeBtn.click({ timeout: 600 });
    }
  } catch {}
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(300);
}

/* ─────────────────────────────────────────────────────────────
   Interceptor pasivo de GraphQL — captura post IDs sin clics
   ─────────────────────────────────────────────────────────────
   Facebook carga el feed de grupos vía GraphQL. Las respuestas
   contienen los post IDs reales incluso cuando el DOM no los
   expone. Escuchamos pasivamente las respuestas mientras se
   hace scroll normal — cero tiempo extra, cero interacción.
*/

interface InterceptedPostInfo {
  postId: string;
  text: string;
}

interface PostIdInterceptor {
  discovered: Map<string, InterceptedPostInfo>;
  cleanup: () => void;
}

/** Extrae texto de mensaje cercano a una posición en el body JSON. */
function extractNearbyMessageText(body: string, pos: number): string {
  const start = Math.max(0, pos - 4000);
  const end = Math.min(body.length, pos + 4000);
  const searchWindow = body.slice(start, end);
  const textMatch =
    searchWindow.match(/"text"\s*:\s*"([^"]{15,500})"/) ||
    searchWindow.match(/"message"\s*:\s*\{"text"\s*:\s*"([^"]{15,500})"/) ||
    searchWindow.match(/"accessibility_caption"\s*:\s*"([^"]{15,500})"/);
  if (textMatch) {
    return textMatch[1]
      .replace(/\\u[\da-fA-F]{4}/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '')
      .replace(/\\"/g, '"')
      .replace(/\b(?:Facebook\s*)+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

/**
 * Escucha pasivamente las respuestas GraphQL de Facebook para extraer
 * post IDs que el DOM virtualizado no expone. Llamar ANTES de navegar
 * al feed del grupo. Devuelve un Map que se puebla automáticamente.
 */
function setupPostIdInterceptor(page: Page, groupId: string): PostIdInterceptor {
  const discovered = new Map<string, InterceptedPostInfo>();

  const handler = async (resp: PwResponse): Promise<void> => {
    try {
      const url = resp.url();
      if (!url.includes('graphql') && !url.includes('/api/graphql')) return;
      if (resp.status() !== 200) return;

      const body = await resp.text().catch(() => '');
      if (!body || body.length < 100 || body.length > 5_000_000) return;

      // Unescape JSON-escaped slashes for URL matching
      const unescaped = body.replace(/\\\//g, '/');

      // Pattern 1: Full post URLs  /groups/{gid}/posts/{pid}
      const urlRe = new RegExp(
        `(?:facebook\\.com)?/groups/${groupId}/(?:posts|permalink|multi_permalink)/(\\d+)`,
        'g'
      );
      let m: RegExpExecArray | null;
      while ((m = urlRe.exec(unescaped)) !== null) {
        const pid = m[1];
        if (pid.length >= 10 && !discovered.has(pid)) {
          const nearText = extractNearbyMessageText(unescaped, m.index);
          discovered.set(pid, { postId: pid, text: nearText });
        }
      }

      // Pattern 2: "post_id":"xxx", "story_fbid":"xxx", etc.
      const idRe = /"(?:post_id|story_fbid|top_level_post_id|feedback_id)"\s*:\s*"(\d{10,})"/g;
      while ((m = idRe.exec(body)) !== null) {
        const pid = m[1];
        if (!discovered.has(pid)) {
          const nearText = extractNearbyMessageText(body, m.index);
          discovered.set(pid, { postId: pid, text: nearText });
        }
      }
    } catch {}
  };

  page.on('response', handler);

  return {
    discovered,
    cleanup: () => { page.removeListener('response', handler); },
  };
}

/**
 * Enriquece tarjetas sin permalink usando los post IDs capturados
 * pasivamente de las respuestas GraphQL de Facebook.
 */
function enrichCardsFromIntercepted(
  cards: CardRaw[],
  discovered: Map<string, InterceptedPostInfo>,
  groupId: string
): number {
  if (discovered.size === 0) return 0;
  let enriched = 0;

  // Build a set of already-used post IDs to avoid duplicates
  const usedPids = new Set<string>();
  for (const c of cards) {
    if (isCanonicalPermalink(c.href)) {
      const m = c.href.match(/\/posts\/(\d+)/);
      if (m) usedPids.add(m[1]);
    }
  }

  for (const card of cards) {
    if (isCanonicalPermalink(card.href)) continue;

    const cardText = normalizeTitleForMatch(card.text || card.label || '').replace(/\bfacebook\b/g, ' ').trim();
    if (!cardText || cardText.length < 10) continue;

    let bestPid: string | null = null;
    let bestScore = 0;

    for (const [pid, info] of discovered) {
      if (usedPids.has(pid)) continue;
      if (!info.text) continue;
      const cleanInfoText = normalizeTitleForMatch(info.text).replace(/\bfacebook\b/g, ' ').trim();
      const score = tokenOverlap(cardText, cleanInfoText);
      if (score > bestScore && score >= 0.2) {
        bestScore = score;
        bestPid = pid;
      }
    }

    if (bestPid) {
      card.href = `https://www.facebook.com/groups/${groupId}/posts/${bestPid}`;
      card.key = `${groupId}_${bestPid}`;
      usedPids.add(bestPid);
      enriched++;
      log('info', `  [graphql] Permalink recuperado: "${(card.text || '').slice(0, 45)}..." → posts/${bestPid}`);
    }
  }
  return enriched;
}

/**
 * Intenta descubrir el permalink de una tarjeta sin enlace real abriendo el
 * menú Compartir del artículo visible correspondiente y copiando su enlace.
 * Devuelve { url, postId? } o null si no se pudo.
 */
async function tryRecoverPermalinkViaShare(
  page: Page,
  groupId: string,
  textHint: string
): Promise<{ url: string; postId?: string } | null> {
  if (!config.sharePeekEnabled) return null;
  const hint = normalizeTitleForMatch(textHint).replace(/\bfacebook\b/g, ' ').trim();
  if (!hint) return null;

  const articles = page.locator('div[role="article"]');
  const count = (await articles.count().catch(() => 0)) || 0;
  let best: Locator | null = null;
  let bestScore = 0;
  for (let i = 0; i < count; i++) {
    const art = articles.nth(i);
    if (!(await art.isVisible().catch(() => false))) continue;
    const txt = normalizeTitleForMatch(
      (await art.innerText().catch(() => ''))
        .replace(/\b(?:Facebook\s*)+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    ).replace(/\bfacebook\b/g, ' ').trim();
    if (!txt) continue;
    const s = tokenOverlap(hint, txt);
    if (s > bestScore) {
      bestScore = s;
      best = art;
    }
  }
  if (!best || bestScore < config.sharePeekMinOverlap) return null;

  let out: { url: string; postId?: string } | null = null;
  try {
    if (!(await clickShareButtonOf(best))) return null;

    // 1) Vía portapapeles: el item "Copiar enlace" deposita el permalink real.
    //    Facebook puede mostrar un [role="dialog"] o [role="menu"] — esperamos ambos.
    await Promise.race([
      page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 2000 }),
      page.locator('[role="menu"]').first().waitFor({ state: 'visible', timeout: 2000 }),
    ]).catch(() => {});
    const copySels = [
      // En diálogo (español)
      '[role="dialog"] [role="menuitem"]:has-text("Copiar enlace")',
      '[role="dialog"] div[role="button"]:has-text("Copiar enlace")',
      // En menú (español)
      '[role="menu"] [role="menuitem"]:has-text("Copiar enlace")',
      '[role="menu"] div[role="button"]:has-text("Copiar enlace")',
      // En diálogo (inglés)
      '[role="dialog"] [role="menuitem"]:has-text("Copy link")',
      '[role="dialog"] div[role="button"]:has-text("Copy link")',
      // En menú (inglés)
      '[role="menu"] [role="menuitem"]:has-text("Copy link")',
      '[role="menu"] div[role="button"]:has-text("Copy link")',
      // Genérico — cualquier overlay visible
      '[role="menuitem"]:has-text("Copiar enlace")',
      '[role="menuitem"]:has-text("Copy link")',
      'div[role="button"]:has-text("Copiar enlace")',
      'div[role="button"]:has-text("Copy link")',
    ];
    let copyBtn: Locator | null = null;
    for (const sel of copySels) {
      const el = page.locator(sel).first();
      const visible = await el.isVisible({ timeout: 500 }).catch(() => false);
      if (visible) {
        copyBtn = el;
        break;
      }
    }
    if (copyBtn) {
      await copyBtn.click({ timeout: 1200 }).catch(() => {});
      await sleep(600);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const clipUrl = postUrlFromRaw(clip || '', groupId);
      if (clipUrl) {
        out = { url: clipUrl, postId: postIdFromUrl(clip || '', groupId) || undefined };
      }
    }

    // 2) Fallback DOM: escanear el panel/menú abierto por enlaces al post.
    if (!out) {
      const urls = await collectShareSurfaceUrls(page);
      for (const raw of urls) {
        const url = postUrlFromRaw(raw, groupId);
        if (url) {
          out = { url, postId: postIdFromUrl(raw, groupId) || undefined };
          break;
        }
      }
    }
  } finally {
    await dismissShareSurface(page);
  }
  return out;
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
  opts?: { maxScrolls?: number; minScrolls?: number; sharePeek?: boolean }
): Promise<CardRaw[]> {
  const minScrolls = opts?.minScrolls ?? config.groupMinScrolls ?? 6;
  const maxScrolls = opts?.maxScrolls ?? config.groupMaxScrolls ?? 12;
  const sharePeek = opts?.sharePeek ?? true;
  const staleLimit = config.groupStaleLimit ?? 3;

  const cards: CardRaw[] = [];
  const seen = new Set<string>();
  const sharePeeked = new Set<string>();
  let stale = 0;
  let shareAttempts = 0;

  for (let i = 0; i < maxScrolls; i++) {
    const found = await readGroupCards(page, groupId);
    const newOnes: CardRaw[] = [];
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
      newOnes.push(c);
      added++;
    }
    stale = added > 0 ? 0 : stale + 1;

    // Recuperar enlace real vía botón Compartir para las tarjetas nuevas que aún
    // no tienen permalink (mientras su artículo sigue visible en el viewport).
    if (sharePeek && config.sharePeekEnabled) {
      for (const c of newOnes) {
        if (shareAttempts >= config.sharePeekMax) break;
        if (isCanonicalPermalink(c.href)) continue;
        const tag = `${c.key}|${c.text.slice(0, 80)}`;
        if (sharePeeked.has(tag)) continue;
        sharePeeked.add(tag);
        shareAttempts++;
        // Comportarse más parecido a un humano: pausa pequeña aleatoria antes del clic.
        await randomDelay(0.4, 1.1);
        const rec = await tryRecoverPermalinkViaShare(page, groupId, c.text || c.label || '');
        if (rec) {
          c.href = rec.url;
          if (rec.postId) {
            const canonicalKey = `${groupId}_${rec.postId}`;
            c.key = canonicalKey;
            seen.add(canonicalKey);
          }
        }
      }
    }

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

  // Interceptar respuestas GraphQL ANTES de navegar para capturar post IDs pasivamente
  const interceptor = setupPostIdInterceptor(page, groupId);

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

  // 3. Enriquecer tarjetas sin permalink usando los post IDs capturados del GraphQL
  const gqlEnriched = enrichCardsFromIntercepted(cards, interceptor.discovered, groupId);
  if (gqlEnriched > 0 || interceptor.discovered.size > 0) {
    log('info', `  [grupo ${groupName}] GraphQL: ${interceptor.discovered.size} post IDs interceptados, ${gqlEnriched} permalinks recuperados`);
  }
  interceptor.cleanup();

  // 4. Fallback inteligente: si una publicación no tiene permalink directo,
  // crear un enlace de búsqueda interno del grupo con las palabras clave de su título.
  const stopWords =
    /\b(publicaci[oó]n|facebook|precio|venta|vendo|remato|ocasi[oó]n|gratis|d[oó]lares|soles|informes|whatsapp|inmobiliaria|ahora|mismo|muy|para|como|desde|hasta|aqui|pero|este|esta)\b/gi;
  for (const c of cards) {
    if (!c.href || c.href === `https://www.facebook.com/groups/${groupId}`) {
      const words = (c.rawTitle || c.label || c.text || '')
        .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
        .replace(stopWords, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 6)
        .join(' ');
      const fallbackWords = (c.text || c.label || '')
        .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
        .replace(stopWords, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 8)
        .join(' ');
      const finalWords = words || fallbackWords;
      c.href = finalWords
        ? `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(finalWords)}`
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

  // Interceptar GraphQL antes de navegar
  const interceptor = setupPostIdInterceptor(page, groupId);

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

  const cards = await collectGroupCardsExhaust(page, groupId, { minScrolls: 6, maxScrolls: 20, sharePeek: false });

  // Enriquecer con GraphQL interceptado
  const gqlEnriched = enrichCardsFromIntercepted(cards, interceptor.discovered, groupId);
  if (gqlEnriched > 0) {
    log('info', `  [recover ${groupName}] GraphQL: ${gqlEnriched} permalinks recuperados de interceptor`);
  }
  interceptor.cleanup();

  let fixed = 0;
  let shareAttempts = 0;

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
    // Recuperar enlace real vía botón Compartir cuando el feed aún no lo expone.
    let href = card.href;
    const origKey = card.key;
    if (!isCanonicalPermalink(href) && shareAttempts < config.sharePeekMax) {
      shareAttempts++;
      await randomDelay(0.4, 1.0);
      const rec = await tryRecoverPermalinkViaShare(page, groupId, card.text || card.label || '');
      if (rec) {
        href = rec.url;
        if (rec.postId) card.key = `${groupId}_${rec.postId}`;
      }
    }
    if (!isCanonicalPermalink(href)) continue;

    const cardText = normalizeTitleForMatch(card.text);

    // 1) Fila con la misma clave → actualizar URL a permalink real
    const prev = store.get(origKey);
    if (prev) {
      const prevUrl = prev.url_publicacion || prev.url || '';
      if (!isCanonicalPermalink(prevUrl)) {
        store.patch(origKey, { url_publicacion: href, url: href, link_status: 'permalink' });
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
        store.patch(best.row.id_publicacion, { url_publicacion: href, url: href, link_status: 'permalink' });
        fixed++;
        const idx = pendingPool.findIndex((c) => c.row.id_publicacion === best!.row.id_publicacion);
        if (idx >= 0) pendingPool.splice(idx, 1);
      }
      continue;
    }

    // 3) Duplicado real con el mismo permalink bajo otra clave → consolidar
    const dup = store.findByHref(href, groupId);
    if (dup && dup.id_publicacion && dup.id_publicacion !== card.key) {
      store.delete(dup.id_publicacion);
      fixed++;
    }
  }

  return { scanned: cards.length, fixed };
}

export { randomDelay };