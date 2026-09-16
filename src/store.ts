import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_DIR, DB_PATH } from './paths';

export type ListingRow = Record<string, string>;

class Store {
  private db: DatabaseSync;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, data TEXT NOT NULL, seen_at TEXT NOT NULL)'
    );
  }

  insert(row: ListingRow): boolean {
    const seen = `${row.fecha_busqueda} ${row.hora_busqueda}`;
    const res = this.db
      .prepare('INSERT OR IGNORE INTO listings (id, data, seen_at) VALUES (?, ?, ?)')
      .run(row.id_publicacion, JSON.stringify(row), seen);
    return (res.changes ?? 0) > 0;
  }

  upsert(row: ListingRow): boolean {
    const seen = `${row.fecha_busqueda} ${row.hora_busqueda}`;
    const res = this.db
      .prepare(
        'INSERT INTO listings (id, data, seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, seen_at = excluded.seen_at'
      )
      .run(row.id_publicacion, JSON.stringify(row), seen);
    return (res.changes ?? 0) > 0;
  }

  update(id: string, row: ListingRow): void {
    this.db.prepare('UPDATE listings SET data = ? WHERE id = ?').run(JSON.stringify(row), id);
  }

  patch(id: string, updates: Partial<ListingRow>): ListingRow | null {
    const current = this.get(id);
    if (!current) return null;
    const merged: ListingRow = { ...current, ...updates } as ListingRow;
    this.update(id, merged);
    return merged;
  }

  get(id: string): ListingRow | null {
    const item = this.db.prepare('SELECT data FROM listings WHERE id = ?').get(id) as { data: string } | undefined;
    if (!item) return null;
    try {
      return JSON.parse(item.data) as ListingRow;
    } catch {
      return null;
    }
  }

  has(id: string): boolean {
    const item = this.db.prepare('SELECT 1 AS ok FROM listings WHERE id = ?').get(id) as { ok: number } | undefined;
    return !!item;
  }

  all(): ListingRow[] {
    const rows = this.db.prepare('SELECT data FROM listings').all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as ListingRow);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  }

  deleteKeyLike(prefixPattern: string): number {
    const res = this.db.prepare('DELETE FROM listings WHERE id LIKE ?').run(prefixPattern);
    return Number(res.changes ?? 0);
  }

  purgeIrrelevant(isRealEstateFn: (title: string, desc: string) => boolean): number {
    const rows = this.all();
    let purged = 0;
    for (const r of rows) {
      const id = r.id_publicacion || r.id || '';
      if (!id) continue;
      const isOk = isRealEstateFn(r.titulo || '', r.descripcion || '');
      if (!isOk) {
        this.delete(id);
        purged++;
      }
    }
    return purged;
  }

  count(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM listings').get() as { n: number };
    return Number(r.n);
  }
}

export const store = new Store();