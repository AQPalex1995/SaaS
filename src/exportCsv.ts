import fs from 'node:fs';
import { BITACORA_PATH, CSV_PATH } from './paths';
import type { ListingRow } from './store';

export const CSV_HEADERS = [
  'id_publicacion',
  'favorito',
  'visto',
  'fecha_busqueda',
  'hora_busqueda',
  'fecha_publicacion',
  'tipo',
  'titulo',
  'descripcion',
  'm2',
  'distrito',
  'distrito_origen',
  'precio',
  'moneda',
  'precio_real_afiche',
  'telefono',
  'notas',
  'imagen_url',
  'url',
] as const;

function esc(value: unknown): string {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
  if (/[",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function rowToArray(row: ListingRow): string[] {
  return CSV_HEADERS.map((h) => esc(row[h] ?? ''));
}

export function writeListingsCsv(rows: ListingRow[]): void {
  const lines = [CSV_HEADERS.join(','), ...rows.map((r) => rowToArray(r).join(','))];
  fs.writeFileSync(CSV_PATH, '\uFEFF' + lines.join('\r\n'), 'utf8');
}

export function appendBitacora(entry: {
  inicio: string;
  fin: string;
  busquedas: number;
  nuevos: number;
  estado: string;
}): void {
  const exists = fs.existsSync(BITACORA_PATH);
  const header = 'inicio,fin,busquedas,nuevos,estado';
  const line = [entry.inicio, entry.fin, entry.busquedas, entry.nuevos, esc(entry.estado)].join(',');
  const content = (exists ? '' : '\uFEFF' + header + '\r\n') + line + '\r\n';
  fs.appendFileSync(BITACORA_PATH, content, 'utf8');
}