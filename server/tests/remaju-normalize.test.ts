import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeTipoConvocatoria,
  normalizeUbicacion,
  normalizeRemateSlide,
  parseFechaRemaju,
  parseMontoPEN,
  REMAJU_PARSER_VERSION,
} from '../src/connectors/implementations/remaju-normalize';
import { parseRemajuHome } from '../src/connectors/implementations/remaju';
import { remajuConnector } from '../src/connectors/implementations/remaju';

const fixture = readFileSync(new URL('./fixtures/remaju-home.html', import.meta.url), 'utf8');

function stubFetch(body: string, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('REM@JU normalization (T4.3)', () => {
  it('canoniza el tipo de convocatoria (label gana al código)', () => {
    expect(normalizeTipoConvocatoria('1', 'REMATE SIMPLE')).toBe('remate_simple');
    expect(normalizeTipoConvocatoria(undefined, 'REMATE SIMPLE')).toBe('remate_simple');
    expect(normalizeTipoConvocatoria('2', 'REMATE EN SEGUNDA CONVOCATORIA')).toBe(
      'segunda_convocatoria',
    );
    expect(normalizeTipoConvocatoria('3')).toBe('tercera_convocatoria');
    expect(normalizeTipoConvocatoria('4', 'SUBASTA PÚBLICA')).toBe('subasta');
    expect(normalizeTipoConvocatoria('2', 'REMATE SIMPLE')).toBe('remate_simple');
    expect(normalizeTipoConvocatoria('99')).toBe('desconocido');
    expect(normalizeTipoConvocatoria(null, null)).toBe('desconocido');
  });

  it('normaliza ubicaciones (display Title Case + key sin acentos)', () => {
    expect(normalizeUbicacion('  san   juan de miraflores ')).toEqual({
      display: 'San Juan De Miraflores',
      key: 'SAN JUAN DE MIRAFLORES',
    });
    expect(normalizeUbicacion('JOSÉ LUIS BUSTAMANTE Y RIVERO')).toEqual({
      display: 'José Luis Bustamante Y Rivero',
      key: 'JOSE LUIS BUSTAMANTE Y RIVERO',
    });
    expect(normalizeUbicacion(null)).toBeNull();
    expect(normalizeUbicacion('   ')).toBeNull();
  });

  it('fecha dd/MM/yyyy → ISO con validación básica', () => {
    expect(parseFechaRemaju('27/09/2026')).toBe('2026-09-27');
    expect(parseFechaRemaju('01/01/2025')).toBe('2025-01-01');
    expect(parseFechaRemaju('32/01/2026')).toBeNull();
    expect(parseFechaRemaju('01/13/2026')).toBeNull();
    expect(parseFechaRemaju('2026-09-27')).toBeNull();
    expect(parseFechaRemaju(undefined)).toBeNull();
  });

  it('parsea montos PEN y rechaza moneda extranjera', () => {
    expect(parseMontoPEN('S/ 1,234.56')).toBe(1234.56);
    expect(parseMontoPEN('S/. 900')).toBe(900);
    expect(parseMontoPEN('1234.56')).toBe(1234.56);
    expect(parseMontoPEN('S/ 1 234,56')).toBe(1234.56);
    expect(parseMontoPEN('US$ 100')).toBeNull();
    expect(parseMontoPEN('EUR 50')).toBeNull();
    expect(parseMontoPEN('$ 20')).toBeNull();
    expect(parseMontoPEN('S/')).toBeNull();
    expect(parseMontoPEN('')).toBeNull();
  });

  it('normaliza una fila cruda completa del carrusel', () => {
    const [first] = parseRemajuHome(fixture);
    const normalized = normalizeRemateSlide(first);
    expect(normalized).toMatchObject({
      source: 'remaju',
      parserVersion: REMAJU_PARSER_VERSION,
      remateId: 25296,
      convocatoriaId: 40451,
      tipo: 'remate_simple',
      tipoRaw: 'REMATE SIMPLE',
      ubicacion: 'Miraflores',
      ubicacionKey: 'MIRAFLORES',
      fechaISO: '2026-09-27',
      esUltimoDiaInscripcion: true,
      moneda: null,
      monto: null,
    });
  });

  it('acepta monto opcional (detalle T4.5) y lo tipa como PEN', () => {
    const [first] = parseRemajuHome(fixture);
    const normalized = normalizeRemateSlide(first, 'S/ 1,234.56');
    expect(normalized.moneda).toBe('PEN');
    expect(normalized.monto).toBe(1234.56);
  });

  it('tolera filas incompletas (sin ids/fecha/tipo)', () => {
    const normalized = normalizeRemateSlide({
      ubicacion: undefined,
      esUltimoDiaInscripcion: false,
    });
    expect(normalized.remateId).toBeNull();
    expect(normalized.convocatoriaId).toBeNull();
    expect(normalized.tipo).toBe('desconocido');
    expect(normalized.ubicacion).toBeNull();
    expect(normalized.ubicacionKey).toBeNull();
    expect(normalized.fechaISO).toBeNull();
    expect(normalized.tipoRaw).toBeNull();
  });

  it('el conector adjunta el shape normalizado en rawData', async () => {
    stubFetch(fixture);
    const res = await remajuConnector.search({});
    const raw = res.items[0]?.rawData as
      | { normalized?: Record<string, unknown> }
      | undefined;
    expect(raw?.normalized).toMatchObject({
      source: 'remaju',
      tipo: 'remate_simple',
      ubicacionKey: 'MIRAFLORES',
    });
  });
});