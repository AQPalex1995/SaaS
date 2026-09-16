import { store, type ListingRow } from './store';
import { writeListingsCsv } from './exportCsv';

export function cleanKeywordsForSearch(title: string, desc: string): string {
  const full = `${title} ${desc}`
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
    .replace(/\b(publicaci[oó]n|facebook|precio|venta|vendo|remato|ocasi[oó]n|gratis|d[oó]lares|soles|informes|whatsapp|inmobiliaria)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = full.split(' ').filter((w) => w.length > 3);
  return words.slice(0, 4).join(' ');
}

export function migrateGroupLinks(): { total: number; fixed: number } {
  const rows = store.all();
  let fixed = 0;

  for (const row of rows) {
    if (row.fuente !== 'grupo') continue;

    const currentUrl = row.url_publicacion || row.url || '';
    const hasCanonical = /\/groups\/[^/]+\/(?:posts|permalink|multi_permalink)\/\d+/.test(currentUrl);

    if (!hasCanonical) {
      // Extraer ID del grupo de la URL actual o del id_publicacion
      const urlMatch = currentUrl.match(/\/groups\/([^/?#]+)/);
      const idMatch = (row.id_publicacion || '').match(/^([^_]+)_/);
      const groupId = urlMatch ? urlMatch[1] : idMatch ? idMatch[1] : '';

      if (groupId) {
        // Si ya tiene /search/ con query, no tocar
        const hasSearch = currentUrl.includes('/search/?q=') && currentUrl.includes('%');
        if (hasSearch) continue;

        const query = cleanKeywordsForSearch(row.titulo || '', row.descripcion || '');
        const targetUrl = query
          ? `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(query)}`
          : `https://www.facebook.com/groups/${groupId}`;

        row.url_publicacion = targetUrl;
        row.url = targetUrl;
        store.update(row.id_publicacion, row);
        fixed++;
      }
    }
  }

  if (fixed > 0) {
    writeListingsCsv(store.all());
  }

  return { total: rows.length, fixed };
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '')) {
  console.log('--- Migrando enlaces de grupos en scout.db ---');
  const res = migrateGroupLinks();
  console.log(`Proceso completado. Enlaces de grupos corregidos: ${res.fixed} de ${res.total}`);
}
