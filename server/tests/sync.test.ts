import { describe, it, expect } from 'vitest';
import {
  contentHash,
  mapSourceType,
  mapPropertyType,
  mapCurrency,
  parseScrapedAt,
  isUuid,
  type ScoutListingRow,
} from '../src/domain/ingestion/sync';

function row(partial: ScoutListingRow = {}): ScoutListingRow {
  return {
    id_publicacion: '1234567890',
    titulo: 'Terreno en venta',
    precio: '1.74',
    descripcion: 'A 5 min de la plaza',
    ...partial,
  };
}

describe('Sync: contentHash', () => {
  it('is deterministic for identical content', () => {
    expect(contentHash(row())).toBe(contentHash(row()));
  });

  it('changes when title, price, or description change', () => {
    const base = contentHash(row());
    expect(contentHash(row({ titulo: 'Otro terreno' }))).not.toBe(base);
    expect(contentHash(row({ precio: '999' }))).not.toBe(base);
    expect(contentHash(row({ descripcion: 'Cerca del mercado' }))).not.toBe(base);
  });

  it('ignores case and formatting inconsistencies', () => {
    expect(contentHash(row({ titulo: 'Terreno en VENTA' }))).toBe(
      contentHash(row({ titulo: 'terreno en venta' })),
    );
  });
});

describe('Sync: mapSourceType', () => {
  it('maps marketplace ids to facebook_marketplace', () => {
    expect(mapSourceType(row())).toBe('facebook_marketplace');
    expect(mapSourceType(row({ fuente: 'marketplace' }))).toBe('facebook_marketplace');
  });

  it('maps grupo or underscore-separated ids to facebook_group', () => {
    expect(mapSourceType(row({ fuente: 'grupo' }))).toBe('facebook_group');
    expect(mapSourceType(row({ id_publicacion: 'urb_123' }))).toBe('facebook_group');
  });

  it('maps adondevivir ids to adondevivir', () => {
    expect(mapSourceType(row({ id_publicacion: 'av-123' }))).toBe('adondevivir');
    expect(mapSourceType(row({ fuente: 'adondevivir' }))).toBe('adondevivir');
  });

  it('maps urbania ids to urbania', () => {
    expect(mapSourceType(row({ id_publicacion: 'urb-123' }))).toBe('urbania');
    expect(mapSourceType(row({ fuente: 'urbania' }))).toBe('urbania');
  });
});

describe('Sync: mapPropertyType', () => {
  it('maps valid types case-insensitively', () => {
    expect(mapPropertyType('Terreno')).toBe('terreno');
    expect(mapPropertyType('CASA')).toBe('casa');
    expect(mapPropertyType('Departamento')).toBe('departamento');
    expect(mapPropertyType('Duplex')).toBe('duplex');
  });

  it('falls back to "otro" for unknown types', () => {
    expect(mapPropertyType('quinta')).toBe('otro');
    expect(mapPropertyType(undefined)).toBe('otro');
    expect(mapPropertyType('')).toBe('otro');
  });
});

describe('Sync: mapCurrency', () => {
  it('maps USD and PEN', () => {
    expect(mapCurrency('USD')).toBe('USD');
    expect(mapCurrency('usd')).toBe('USD');
    expect(mapCurrency('pen')).toBe('PEN');
  });

  it('falls back to unknown', () => {
    expect(mapCurrency('')).toBe('unknown');
    expect(mapCurrency('S/')).toBe('unknown');
    expect(mapCurrency(undefined)).toBe('unknown');
  });
});

describe('Sync: parseScrapedAt', () => {
  it('combines fecha_busqueda and hora_busqueda', () => {
    expect(
      parseScrapedAt(row({ fecha_busqueda: '2025-04-01', hora_busqueda: '10:30:00' })),
    ).toEqual(new Date('2025-04-01 10:30:00'));
  });

  it('falls back to now for missing/unparseable dates', () => {
    const before = new Date(Date.now() - 5_000);
    const parsed = parseScrapedAt(row({}));
    expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(isNaN(parseScrapedAt(row({ fecha_busqueda: 'nope' })).getTime())).toBe(false);
  });
});

describe('Sync: isUuid', () => {
  it('detects UUIDs', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(
      isUuid('F47AC10B-58CC-4372-A567-0E02B2C3D479'),
    ).toBe(true);
  });

  it('rejects SQLite ids, empty strings, and malformed strings', () => {
    expect(isUuid('1709640736761984')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('00000000')).toBe(false);
  });
});