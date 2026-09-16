import { store, type ListingRow } from './store';
import { detectRealDistrict, extractPhones } from './detect';
import { writeListingsCsv } from './exportCsv';

console.log('--- Iniciando corrección y migración de distritos y teléfonos en scout.db ---');

const rows = store.all();
console.log(`Total registros en base de datos: ${rows.length}`);

let corregidosDistrito = 0;
let corregidosTelefonos = 0;

for (const row of rows) {
  const id = row.id_publicacion;
  const oldDistrict = row.distrito || '';
  const title = row.titulo || '';
  const desc = row.descripcion || '';

  // Limpiar título de sufijo de publicación
  const cleanTitle = title
    .replace(/,\s*publicaci[oó]n\s*\d+/i, '')
    .replace(/,\s*(?:S\/|\$|Gratis)[^,]+/i, '')
    .replace(/,\s*[^,]+,\s*AR$/i, '')
    .trim();

  // Detección estricta de distrito
  const distRes = detectRealDistrict({
    title: cleanTitle,
    description: desc,
    marketplaceLocation: row.distrito, // si antes tenía ubicación de FB
  });

  let changed = false;

  if (distRes.district && distRes.district !== oldDistrict) {
    row.distrito = distRes.district;
    row.distrito_origen = distRes.source;
    corregidosDistrito++;
    changed = true;
    console.log(`[DIST] ID ${id}: "${oldDistrict}" -> "${distRes.district}" (fuente: ${distRes.source}) | "${cleanTitle.slice(0, 50)}"`);
  }

  // Corregir teléfonos falsos derivados de IDs de publicación
  const phones = extractPhones(desc + ' ' + title, id);
  const newPhone = phones[0]?.phone ?? '';
  if (row.telefono && (!newPhone || row.telefono !== newPhone)) {
    // Si el teléfono guardado era una subcadena del ID
    if (id && id.includes(row.telefono)) {
      console.log(`[TEL FALSO ELIMINADO] ID ${id}: Tel ${row.telefono} era parte del ID de publicación.`);
      row.telefono = newPhone;
      corregidosTelefonos++;
      changed = true;
    }
  }

  if (changed) {
    store.update(id, row);
  }
}

// Regenerar el CSV con los datos corregidos
const updatedRows = store.all();
writeListingsCsv(updatedRows);

console.log('--- Resumen de corrección ---');
console.log(`Distritos corregidos: ${corregidosDistrito}`);
console.log(`Teléfonos falsos eliminados: ${corregidosTelefonos}`);
console.log(`CSV actualizado en data/Arequipa_terrenos.csv`);
