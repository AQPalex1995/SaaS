import path from 'node:path';
import fs from 'node:fs';
import { createWorker, type Worker } from 'tesseract.js';
import { DATA_DIR } from './paths';
import { log } from './logs';

export interface OcrData {
  text: string;
  phones: string[];
  prices: Array<{ price: string; currency: string }>;
  m2: string;
  rawDistrictM2: string;
}

const CACHE_FILE = path.join(DATA_DIR, 'ocr-cache.json');
let cache: Record<string, OcrData> = {};

function loadCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(raw);
    }
  } catch {
    cache = {};
  }
}

function saveCache(): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {}
}

loadCache();

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('spa');
      return worker;
    })();
  }
  return workerPromise;
}

export async function analyzeImage(imageUrl: string, cacheKey?: string): Promise<OcrData | null> {
  if (!imageUrl || !imageUrl.startsWith('http')) return null;

  const key = cacheKey || imageUrl;
  if (cache[key]) {
    return cache[key];
  }

  try {
    const worker = await getWorker();
    const ret = await worker.recognize(imageUrl);
    const text = ret?.data?.text || '';

    const data = parseOcrText(text);
    cache[key] = data;
    saveCache();
    return data;
  } catch (e) {
    log('warn', `Fallo al procesar imagen OCR (${imageUrl.slice(0, 40)}...): ${e}`);
    return null;
  }
}

export function parseOcrText(text: string): OcrData {
  const normText = text.replace(/\r\n/g, '\n');

  // 1. Teléfonos peruanos (9 dígitos que empiezan con 9)
  const phones: string[] = [];
  const phoneRx = /(?<!\d)(?:(?:\+?51)?\s*)?9[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g;
  let pm: RegExpExecArray | null;
  while ((pm = phoneRx.exec(normText))) {
    const digits = pm[0].replace(/\D/g, '');
    const clean9 = digits.startsWith('51') && digits.length === 11 ? digits.slice(2) : digits;
    if (clean9.length === 9 && clean9.startsWith('9') && !phones.includes(clean9)) {
      phones.push(clean9);
    }
  }

  // 2. Precios en afiche (ej: S/. 35,000.00, S/ 40,000, $50,000)
  const prices: Array<{ price: string; currency: string }> = [];
  const solesRx = /(?:S\s*\/\s*\.?|soles|s\/\.?)\s*([1-9]\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = solesRx.exec(normText))) {
    const num = cleanOcrNumber(sm[1]);
    if (num && num >= 500) {
      prices.push({ price: String(num), currency: 'PEN' });
    }
  }

  const dolRx = /(?:US\s*\$\s*|\$\s*|USD\s*|U\$\s*)\s*([1-9]\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dolRx.exec(normText))) {
    const num = cleanOcrNumber(dm[1]);
    if (num && num >= 500) {
      prices.push({ price: String(num), currency: 'USD' });
    }
  }

  // 3. Metraje m2 en afiche (ej: 450 m2, 450m2, 1,000 m2)
  let m2 = '';
  const m2Rx = /(?<!\d)([1-9]\d{1,4}(?:[.,]\d{3})?)\s*(?:m\s*2|m[²2]|mts?\s*2|metros\s+cuadrados|m\b)/i;
  const mm = normText.match(m2Rx);
  if (mm) {
    const n = cleanOcrNumber(mm[1]);
    if (n && n >= 20 && n <= 100000) {
      m2 = String(Math.round(n));
    }
  }

  return {
    text: normText,
    phones,
    prices,
    m2,
    rawDistrictM2: normText,
  };
}

function cleanOcrNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  const noSep = s.replace(/[,.](\d{3})/g, '$1');
  const clean = noSep.replace(/[,.]\d{2}$/, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}
