export interface PhoneHit {
  phone: string;
  raw: string;
}

export interface DistrictRule {
  name: string;
  rx: RegExp;
  keywords: RegExp[];
}

export const DISTRICT_RULES: DistrictRule[] = [
  {
    name: 'La Joya',
    rx: /\bla\s+joya\b|san\s+isidro\s+(?:la\s+joya|\b)|la\s+planicie|canoas|san\s+camilo|el\s+triunfo/i,
    keywords: [/\bla\s+joya\b/i, /san\s+isidro/i, /la\s+planicie/i, /canoas/i, /san\s+camilo/i],
  },
  {
    name: 'Cayma',
    rx: /\bcayma\b|la\s+tomilla|acequia\s+alta|tronchadero|dean\s+valdivia/i,
    keywords: [/\bcayma\b/i, /la\s+tomilla/i, /acequia\s+alta/i],
  },
  {
    name: 'Cerro Colorado',
    rx: /cerro\s+colorado|cono\s+norte|pachacutec|ciudad\s+municipal|zamacola|v[ií]a\s+54|mariscal\s+castilla/i,
    keywords: [/cerro\s+colorado/i, /cono\s+norte/i, /pachacutec/i, /ciudad\s+municipal/i, /zamacola/i],
  },
  {
    name: 'Paucarpata',
    rx: /paucarpata|ciudad\s+blanca|miguel\s+grau|israel\b|bad[eé]n/i,
    keywords: [/paucarpata/i, /ciudad\s+blanca/i, /miguel\s+grau/i],
  },
  {
    name: 'Yanahuara',
    rx: /yanahuara|umacollo|chullo/i,
    keywords: [/yanahuara/i, /umacollo/i],
  },
  {
    name: 'Alto Selva Alegre',
    rx: /alto\s+selva\s+alegre|selva\s+alegre|gr[aá]ficos|independencia\b/i,
    keywords: [/alto\s+selva\s+alegre/i, /selva\s+alegre/i],
  },
  {
    name: 'Sachaca',
    rx: /sachaca|t[ií]o\s+chico|t[ií]o\s+grande|huaranguillo|arancota/i,
    keywords: [/sachaca/i, /huaranguillo/i, /arancota/i],
  },
  {
    name: 'Socabaya',
    rx: /socabaya|lara\b|san\s+mart[ií]n\s+de\s+socabaya|bellapampa/i,
    keywords: [/socabaya/i, /lara\b/i, /bellapampa/i],
  },
  {
    name: 'Jacobo Hunter',
    rx: /jacobo\s+hunter|j\.?\s*hunter|\bhunter\b|bellavista\b/i,
    keywords: [/jacobo\s+hunter/i, /j\.?\s*hunter/i, /\bhunter\b/i],
  },
  {
    name: 'José Luis Bustamante y Rivero',
    rx: /bustamante(?:\s+y\s+rivero)?|jlb\s*y\s*r|jlbyr|ciudad\s+mi\s+trabajo|dolores\b|avelino/i,
    keywords: [/bustamante/i, /jlbyr/i, /ciudad\s+mi\s+trabajo/i],
  },
  {
    name: 'Miraflores',
    rx: /\bmiraflores\b|alameda\s+salaverry|alto\s+misti/i,
    keywords: [/\bmiraflores\b/i, /alameda\s+salaverry/i],
  },
  {
    name: 'Mariano Melgar',
    rx: /mariano\s+melgar|jerusal[eé]n\b/i,
    keywords: [/mariano\s+melgar/i],
  },
  {
    name: 'Tiabaya',
    rx: /tiabaya|los\s+tunales|alata\b/i,
    keywords: [/tiabaya/i],
  },
  {
    name: 'Yura',
    rx: /\byura\b|la\s+calera|quiscos|la\s+estaci[oó]n\b/i,
    keywords: [/\byura\b/i, /quiscos/i, /la\s+calera/i],
  },
  {
    name: 'Characato',
    rx: /characato|ojo\s+de\s+agua/i,
    keywords: [/characato/i],
  },
  {
    name: 'Sabandía',
    rx: /saband[ií]a/i,
    keywords: [/saband[ií]a/i],
  },
  {
    name: 'Mollebaya',
    rx: /mollebaya/i,
    keywords: [/mollebaya/i],
  },
  {
    name: 'Quequeña',
    rx: /queque[ñn]a/i,
    keywords: [/queque[ñn]a/i],
  },
  {
    name: 'Chiguata',
    rx: /chiguata/i,
    keywords: [/chiguata/i],
  },
  {
    name: 'Uchumayo',
    rx: /uchumayo|congata|cerro\s+verde/i,
    keywords: [/uchumayo/i, /congata/i],
  },
  {
    name: 'Yarabamba',
    rx: /yarabamba/i,
    keywords: [/yarabamba/i],
  },
  {
    name: 'Polobaya',
    rx: /polobaya/i,
    keywords: [/polobaya/i],
  },
  {
    name: 'Vítor',
    rx: /v[ií]tor\b/i,
    keywords: [/v[ií]tor\b/i],
  },
  {
    name: 'Santa Rita de Siguas',
    rx: /santa\s+rita(?:\s+de\s+siguas)?/i,
    keywords: [/santa\s+rita/i],
  },
  {
    name: 'Majes',
    rx: /\bmajes\b|pedregal|el\s+pedregal|majes\s+siguas/i,
    keywords: [/\bmajes\b/i, /pedregal/i, /el\s+pedregal/i],
  },
  {
    name: 'Camaná',
    rx: /caman[aá]\b/i,
    keywords: [/caman[aá]\b/i],
  },
  {
    name: 'Mollendo',
    rx: /mollendo|islay/i,
    keywords: [/mollendo/i],
  },
  {
    name: 'Mejía',
    rx: /\bmej[ií]a\b/i,
    keywords: [/\bmej[ií]a\b/i],
  },
  {
    name: 'Arequipa (Cercado)',
    rx: /\bcercado\b|vallecito/i,
    keywords: [/\bcercado\b/i],
  },
];

const TIPO_RULES: Array<[string, RegExp]> = [
  ['duplex', /duplex|d[uú]plex/i],
  ['departamento', /\bdepartamento\b|\bdepart\b|\bdpto\b|\bdepas?\b|\bdepa\b|d[eé]part/i],
  ['casa', /\bcasas?\b|vivienda|chalet|chal[eé]|adosado|bungalow/i],
  ['comercial', /local|tienda|oficina|galer[ií]a|comercial/i],
  ['agricola', /agr[ií]cola|cultivo|chacra|fundo|tierra[s]?\s+d[eé]\s+cultivo|huerta|granja/i],
  ['lote', /\blote\b|\blotes\b|lotiz|urba|loteo/i],
  ['terreno', /\bterrenos?\b|predio|parcela|solar/i],
];

export function extractPhones(text: string, excludeId?: string): PhoneHit[] {
  const out: PhoneHit[] = [];
  const seen = new Set<string>();

  // Limpiar posibles IDs de publicación o URL para evitar falsos positivos
  let cleanText = text.replace(/https?:\/\/[^\s]+/gi, ' ');
  cleanText = cleanText.replace(/\/marketplace\/item\/\d+/gi, ' ');
  cleanText = cleanText.replace(/publicaci[oó]n\s*\d+/gi, ' ');
  if (excludeId) {
    cleanText = cleanText.replace(new RegExp(excludeId, 'g'), ' ');
  }

  // Celulares de 9 dígitos que comienzan con 9, aislados de otros dígitos (soporta espacios, puntos, guiones, #, /)
  const phoneRx = /(?<!\d)(?:(?:\+?51|cel\.?|tel\.?|wssp?|whatsapp)?\s*)?9(?:[\s./#_-]*\d){8}(?!\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = phoneRx.exec(cleanText))) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    const clean9 = digits.startsWith('51') && digits.length === 11 ? digits.slice(2) : digits;
    if (clean9.length === 9 && clean9.startsWith('9')) {
      if (!seen.has(clean9)) {
        seen.add(clean9);
        out.push({ phone: clean9, raw });
      }
    }
  }

  // Enlaces de wa.me
  const wa = /wa\.me\/(?:[^/]+\/)?(\+?51)?\s*(\d{9,12})/gi;
  while ((m = wa.exec(text))) {
    const digits = m[2].replace(/\D/g, '');
    if (digits.length >= 9 && digits.startsWith('9')) {
      const p = digits.slice(-9);
      if (!seen.has(p)) {
        seen.add(p);
        out.push({ phone: p, raw: m[0] });
      }
    }
  }

  return out;
}

export function cleanNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  const com = (s.match(/,/g) || []).length;
  const dot = (s.match(/\./g) || []).length;
  if (com > 0 && dot > 0) {
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (com > 0) {
    const frac = s.length - s.lastIndexOf(',') - 1;
    if (frac >= 1 && frac <= 2) {
      const n = parseFloat(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    const n = parseInt(s.replace(/,/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }
  if (dot > 0) {
    const frac = s.length - s.lastIndexOf('.') - 1;
    if (frac === 3) {
      const n = parseInt(s.replace(/\./g, ''), 10);
      return Number.isNaN(n) ? null : n;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function parsePrice(text: string): { price: string; currency: string } {
  const pesos = text.match(/(?:S\s*\/\s*\.?|soles|s\/\.?)\s*([\d.,\s]+)/i);
  if (pesos) {
    const n = cleanNumber(pesos[1]);
    if (n !== null) return { price: String(n), currency: 'PEN' };
  }
  const dolares = text.match(/(?:US\s*\$\s*|\$\s*|USD\s*|U\$\s*)\s*([\d.,\s]+)/i);
  if (dolares) {
    const n = cleanNumber(dolares[1]);
    if (n !== null) return { price: String(n), currency: 'USD' };
  }
  const bare = text.match(/(?<![\w$,.])(\d{3,8}(?:[.,]\d{1,3})?)/);
  if (bare) {
    const n = cleanNumber(bare[1]);
    if (n !== null && n >= 1000) return { price: String(n), currency: '(no indicado)' };
  }
  return { price: '', currency: '' };
}

export function extractM2(text: string): string {
  const rx = /(\d{1,5}(?:[.,]\d+)?)\s*(?:m\s*2|m[²2]|mts?\s*2|mtrs2|metros\s+cuadrados|metros\s+c)/i;
  const m = text.match(rx);
  if (!m) return '';
  const n = cleanNumber(m[1]);
  if (n === null) return '';
  return String(Math.round(n));
}

export interface DistrictDetectionResult {
  district: string;
  source: 'title' | 'ocr' | 'description' | 'location' | 'none';
}

/**
 * Detecta el distrito REAL del terreno según la siguiente jerarquía estricta:
 * 1. TÍTULO del anuncio (lo que el vendedor escribió explícitamente para describir su propiedad).
 * 2. OCR de la imagen publicitaria (texto del afiche / volante con la ubicación real).
 * 3. CUERPO de la descripción del anuncio.
 * 4. UBICACIÓN de Marketplace (fallback: solo si no hay ninguna mención en título, imagen o descripción).
 */
export function detectRealDistrict(options: {
  title?: string;
  description?: string;
  ocrText?: string;
  marketplaceLocation?: string;
}): DistrictDetectionResult {
  const { title = '', description = '', ocrText = '', marketplaceLocation = '' } = options;

  // 1. PRIORIDAD MÁXIMA: Título del anuncio
  if (title) {
    for (const rule of DISTRICT_RULES) {
      if (rule.rx.test(title)) {
        return { district: rule.name, source: 'title' };
      }
    }
  }

  // 2. PRIORIDAD ALTA: Texto OCR del afiche en la imagen
  if (ocrText) {
    for (const rule of DISTRICT_RULES) {
      if (rule.rx.test(ocrText)) {
        return { district: rule.name, source: 'ocr' };
      }
    }
  }

  // 3. PRIORIDAD MEDIA: Descripción del anuncio
  if (description) {
    // Buscar patrones contextuales ("en [distrito]", "ubicado en [distrito]")
    for (const rule of DISTRICT_RULES) {
      for (const kw of rule.keywords) {
        const contextualRx = new RegExp(`(?:en|ubicad[oa]\\s+en|zona\\s+de|sector|distrito\\s+de)\\s+${kw.source}`, 'i');
        if (contextualRx.test(description)) {
          return { district: rule.name, source: 'description' };
        }
      }
    }
    // Mención directa en la descripción
    for (const rule of DISTRICT_RULES) {
      if (rule.rx.test(description)) {
        return { district: rule.name, source: 'description' };
      }
    }
  }

  // 4. FALLBACK: Ubicación geográfica reportada por Facebook Marketplace
  if (marketplaceLocation) {
    for (const rule of DISTRICT_RULES) {
      if (rule.rx.test(marketplaceLocation)) {
        return { district: rule.name, source: 'location' };
      }
    }
  }

  return { district: '', source: 'none' };
}

export function detectDistrict(text: string): string {
  // Separar posibles secciones si vienen juntas
  const res = detectRealDistrict({ title: text, description: text });
  return res.district;
}

export function classifyTipo(text: string): string {
  for (const [tipo, rx] of TIPO_RULES) {
    if (rx.test(text)) return tipo;
  }
  return 'otro';
}

export function relativeDate(text: string): string {
  const rx = /\bhace\s+\d+\s+(?:minutos?|minuto|min|horas|hora|hrs|hr|h|d[ií]as|dias|d|semana|semanas)/i;
  const m = text.match(rx);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  const short = text.match(/(?:^|\s)(\d+\s*(?:horas|hora|hrs?|h|minutos?|min|d[ií]as|dias|d)\b)/i);
  if (short) return short[1].trim();
  return '';
}

export function firstMeaningfulLine(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 8);
  return lines[0] ?? '';
}

const IRRELEVANT_PATTERNS = [
  /botella/i,
  /lote\s+de\s+(?:ropa|polo|polos|zapatillas|camisas?|prendas?)/i,
  /\bropa\b/i,
  /zapatillas?\b/i,
  /zapatos?\b/i,
  /polos?\b/i,
  /camisas?\b/i,
  /celular/i,
  /iphone/i,
  /samsung/i,
  /televisor/i,
  /\btv\b/i,
  /laptop/i,
  /mochila/i,
  /cartera/i,
  /juguete/i,
  /refrigerador/i,
  /lavadora/i,
  /veh[ií]culo/i,
  /camioneta/i,
  /llantas?\b/i,
  /maquillaje/i,
  /perfume/i,
  /comida\b/i,
  /torta\b/i,
  /pasteles\b/i,
  /reparaci[oó]n/i,
  /soporte\s+t[eé]cnico/i,
  /herramientas?\b/i,
  /taladro/i,
  /bicicleta/i,
  /colch[oó]n/i,
  /vestido/i,
  /peluche/i,
];

const REAL_ESTATE_PATTERNS = [
  /\bterrenos?\b/i,
  /\blotes?\b/i,
  /\bcasas?\b/i,
  /casa[\s-]campo/i,
  /\bchacras?\b/i,
  /\bparcelas?\b/i,
  /\bpredios?\b/i,
  /\bsolares?\b/i,
  /\binmuebles?\b/i,
  /\bpropieda(?:d|des)\b/i,
  /\bdepartamentos?\b/i,
  /\bdepas?\b/i,
  /\bdpto\b/i,
  /\bduplex\b/i,
  /\blocales?\b/i,
  /urbanizac/i,
  /lotizac/i,
  /posesi[oó]n/i,
  /\bm2\b/i,
  /hect[aá]reas?/i,
  /\bha\b/i,
  /agricola|agrícola/i,
  /residencial/i,
];

export function isRealEstateItem(title: string, text: string): boolean {
  const full = `${title} ${text}`;
  for (const pattern of IRRELEVANT_PATTERNS) {
    if (pattern.test(full)) return false;
  }
  for (const pattern of REAL_ESTATE_PATTERNS) {
    if (pattern.test(full)) return true;
  }
  return false;
}