import { chromium, type Browser, type Page } from 'playwright';
import { isoDate, isoTime, type SearchOutcome } from './searchers';
import { store, type ListingRow } from './store';
import { log } from './logs';
import { classifyTipo, detectRealDistrict, extractM2, extractPhones, parsePrice } from './detect';
import { config } from './config';

// Navent/Imperva (AdondeVivir y Urbania) bloquean el User-Agent por defecto de Playwright (403 "Verificación de seguridad en curso")
// y limitan por ráfaga: solo toleran la PRIMERA navegación por contexto; las siguientes dan 403.
// Solución: contexto efímero nuevo (sin perfil de Facebook) + UA de Chrome real + UN contexto por URL.
const PORTAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CHALLENGE_TEXT = 'Verificación de seguridad en curso';

// Urbania no expone páginas SEO por distrito para Arequipa (dan 403); solo sirve feeds a nivel Perú.
// Cargamos esos feeds y filtramos por distritos de la provincia de Arequipa.
const AREQUIPA_DISTRICTS = [
  'alto selva alegre',
  'cayma',
  'cerro colorado',
  'characato',
  'chiguata',
  'jacobo hunter',
  'jose luis bustamante',
  'la joya',
  'mariano melgar',
  'miraflores',
  'mollebaya',
  'paucarpata',
  'pocsi',
  'polobaya',
  'queque\u00f1a',
  'saband\u00eda',
  'sachaca',
  'san juan de siguas',
  'san juan de tarucani',
  'santa isabel de siguas',
  'santa rita de siguas',
  'socabaya',
  'tiabaya',
  'uchumayo',
  'vitor',
  'yanahuara',
  'yarabamba',
  'yura',
];

function isArequipaArea(text: string): boolean {
  const s = ` ${text.toLowerCase()} `;
  if (s.includes('arequipa')) return true;
  return AREQUIPA_DISTRICTS.some((d) => s.includes(` ${d}`));
}

export interface PortalItemRaw {
  key: string;
  title: string;
  priceRaw: string;
  locationRaw: string;
  descriptionRaw: string;
  featuresRaw: string;
  imageUrl: string;
  href: string;
  phoneRaw?: string;
  source: 'adondevivir' | 'urbania';
}

function readPortalCards(page: Page, source: 'adondevivir' | 'urbania'): Promise<PortalItemRaw[]> {
  return page.evaluate((src) => {
    const results: PortalItemRaw[] = [];

    const cards = document.querySelectorAll<HTMLElement>(
      'div[data-qa^="posting"], div[class*="postingCardLayout"], article[data]'
    );

    cards.forEach((card) => {
      const keyAttr = card.getAttribute('data-id') || card.getAttribute('id') || '';
      if (!keyAttr) return;

      const prefix = src === 'adondevivir' ? 'av' : 'urb';

      const titleEl = card.querySelector<HTMLElement>('[data-qa="POSTING_CARD_LOCATION"], h2, h3');
      const priceEl = card.querySelector<HTMLElement>('[data-qa="POSTING_CARD_PRICE"], [class*="price"]');
      const descEl = card.querySelector<HTMLElement>('[data-qa="POSTING_CARD_DESCRIPTION"], [class*="Description"]');
      const featuresEl = card.querySelector<HTMLElement>(
        '[data-qa="POSTING_CARD_FEATURES"], [class*="posting-main-features-block"]'
      );
      const imgEl = card.querySelector<HTMLImageElement>(
        '.postingGallery img[src], [data-qa="POSTING_CARD_GALLERY"] img[src]'
      );
      const whatsappEl = card.querySelector<HTMLAnchorElement>('a[href*="wa.me"], a[href*="whatsapp"]');

      const locationText = titleEl ? (titleEl as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      const price = priceEl ? (priceEl as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      const description = descEl ? (descEl as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      const features = featuresEl ? (featuresEl as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';

      const toPosting = card.getAttribute('data-to-posting');
      const linkEl = card.querySelector<HTMLAnchorElement>('a[href]');
      const href = toPosting
        ? new URL(toPosting, window.location.origin).href
        : linkEl && linkEl.href
          ? linkEl.href
          : '';

      const imageUrl = imgEl
        ? imgEl.src || imgEl.getAttribute('data-flickity-lazyload') || imgEl.getAttribute('data-src') || ''
        : '';

      let phoneRaw = '';
      if (whatsappEl) {
        const waHref = whatsappEl.href || '';
        const match = waHref.match(/(?:phone=|send\?phone=)(\d+)/);
        if (match) phoneRaw = match[1];
      }

      if (locationText || price || href) {
        results.push({
          key: keyAttr.startsWith(`${prefix}-`) ? keyAttr : `${prefix}-${keyAttr}`,
          title: locationText,
          priceRaw: price,
          locationRaw: locationText,
          descriptionRaw: description,
          featuresRaw: features,
          imageUrl,
          href: href || window.location.href,
          phoneRaw,
          source: src,
        });
      }
    });

    return results;
  }, source);
}

async function fetchPortalCards(
  url: string,
  source: 'adondevivir' | 'urbania',
  browser: Browser
): Promise<PortalItemRaw[]> {
  // Cada URL obtiene su propio contexto limpio (Imperva bloquea si se reutiliza el mismo contexto)
  const ctx = await browser.newContext({
    userAgent: PORTAL_UA,
    viewport: { width: 1366, height: 900 },
    locale: 'es-PE',
    extraHTTPHeaders: { 'Accept-Language': 'es-PE,es;q=0.9' },
  });
  await ctx.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__name = (target: unknown) => target;
  });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => null);
    await page.waitForTimeout(1000);

    if (resp && resp.status() >= 400) {
      log('warn', `  [${source}] ${resp.status()} ${url.slice(0, 60)}... blocked`);
      return [];
    }

    const challenged = await page.evaluate(() =>
      document.body ? document.body.innerText.includes('Verificación de seguridad en curso') : true
    );
    if (challenged) {
      log('warn', `  [${source}] challenge ${url.slice(0, 60)}...`);
      return [];
    }

    return await readPortalCards(page, source);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function scrapeAdondeVivir(started: Date): Promise<SearchOutcome> {
  const baseCategories = [
    'https://www.adondevivir.com/inmuebles-en-venta-en-arequipa-provincia.html',
    'https://www.adondevivir.com/terrenos-en-venta-en-arequipa-provincia.html',
    'https://www.adondevivir.com/casas-en-venta-en-arequipa-provincia.html',
    'https://www.adondevivir.com/departamentos-en-venta-en-arequipa-provincia.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-uchumayo-arequipa.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-la-joya-arequipa.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-cayma-arequipa.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-cerro-colorado-arequipa.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-yanahuara-arequipa.html',
    'https://www.adondevivir.com/inmuebles-en-venta-en-paucarpata-arequipa.html',
  ];

  const urls: string[] = [];
  for (const base of baseCategories) {
    urls.push(base);
    const prefix = base.replace('.html', '');
    for (let p = 2; p <= 5; p++) {
      urls.push(`${prefix}-pagina-${p}.html`);
    }
  }

  let totalFound = 0;
  let totalInserted = 0;

  // Lanzar un solo navegador para todas las páginas de AdondeVivir
  const browser = await chromium.launch({ headless: config.headless });
  try {
    for (const url of urls) {
      try {
        const items = await fetchPortalCards(url, 'adondevivir', browser);
        totalFound += items.length;
        for (const item of items) {
          if (storePortalItem(item, 'adondevivir', started)) totalInserted++;
        }
      } catch (e) {
        log('warn', `  [adondevivir] ${url}: ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log('info', `  [adondevivir] Barrido Arequipa -> ${totalFound} publicaciones (${totalInserted} nuevas)`);
  return { count: totalFound, inserted: totalInserted };
}

export async function scrapeUrbania(started: Date): Promise<SearchOutcome> {
  const baseCategories = [
    'https://urbania.pe/buscar/venta-de-terrenos',
    'https://urbania.pe/buscar/venta-de-casas',
    'https://urbania.pe/buscar/venta-de-inmuebles',
  ];

  let totalFound = 0;
  let totalInserted = 0;

  // Reutilizar un solo navegador para Urbania
  const browser = await chromium.launch({ headless: config.headless });
  try {
    for (const url of baseCategories) {
      try {
        const items = (await fetchPortalCards(url, 'urbania', browser)).filter((i) =>
          isArequipaArea(`${i.title} ${i.descriptionRaw} ${i.featuresRaw} ${i.href}`)
        );
        totalFound += items.length;
        for (const item of items) {
          if (storePortalItem(item, 'urbania', started)) totalInserted++;
        }
      } catch (e) {
        log('warn', `  [urbania] ${url}: ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log('info', `  [urbania] Barrido Arequipa (filtro distritos) -> ${totalFound} publicaciones (${totalInserted} nuevas)`);
  return { count: totalFound, inserted: totalInserted };
}

function storePortalItem(
  item: PortalItemRaw,
  source: 'adondevivir' | 'urbania',
  started: Date
): boolean {
  const fullText = `${item.title} ${item.descriptionRaw} ${item.featuresRaw}`;

  const priceParsed = parsePrice(item.priceRaw || fullText);
  const m2Parsed = extractM2(fullText);

  let phone = item.phoneRaw || '';
  if (!phone) {
    const phonesExtracted = extractPhones(fullText, item.key);
    phone = phonesExtracted[0]?.phone || '';
  }

  const distRes = detectRealDistrict({
    title: item.title,
    description: item.descriptionRaw,
    marketplaceLocation: item.locationRaw,
  });

  const row: ListingRow = {
    id_publicacion: item.key,
    fecha_busqueda: isoDate(started),
    hora_busqueda: isoTime(started),
    fecha_publicacion: 'hoy',
    tipo: classifyTipo(fullText),
    titulo: item.title || `${source.toUpperCase()} Arequipa`,
    descripcion: item.descriptionRaw.slice(0, 2000),
    m2: m2Parsed,
    distrito: distRes.district,
    distrito_origen: distRes.source,
    precio: priceParsed.price,
    moneda: priceParsed.currency,
    telefono: phone,
    imagen_url: item.imageUrl,
    url_publicacion: item.href,
    url: item.href,
    fuente: source,
  };

  return store.insert(row);
}