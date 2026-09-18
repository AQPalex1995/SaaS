import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseFechaRemaju,
  parseRemajuHome,
  remajuConnector,
  REMAJU_HOME_URL,
} from '../src/connectors/implementations/remaju';

const fixture = readFileSync(new URL('./fixtures/remaju-home.html', import.meta.url), 'utf8');

type FetchCall = { url: string; opts?: RequestInit };

function stubFetch(
  body: string,
  status = 200,
  extraHeaders: Record<string, string> = {},
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (_url: string | URL, opts?: RequestInit): Promise<Response> => {
    return new Response(body, {
      status,
      headers: { 'content-type': 'text/html', ...extraHeaders },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function calls(fn: ReturnType<typeof vi.fn>): FetchCall[] {
  return fn.mock.calls.map((c) => ({ url: String(c[0]), opts: (c[1] as RequestInit | undefined) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('REM@JU public parser (offline fixture, fetch-stubbed)', () => {
  it('normaliza fechas dd/MM/yyyy → ISO', () => {
    expect(parseFechaRemaju('27/09/2026')).toBe('2026-09-27');
    expect(parseFechaRemaju('01/01/2025')).toBe('2025-01-01');
    expect(parseFechaRemaju('2026-09-27')).toBeUndefined();
    expect(parseFechaRemaju('')).toBeUndefined();
    expect(parseFechaRemaju(undefined)).toBeUndefined();
  });

  it('extrae remates del carrusel público (con entidades &quot;)', () => {
    const slides = parseRemajuHome(fixture);
    expect(slides.length).toBe(4);

    const [first] = slides;
    expect(first.convocatoria).toBe('40451');
    expect(first.tipoConvocatoria).toBe('1');
    expect(first.remate).toBe('25296');
    expect(first.tipoLabel).toBe('REMATE SIMPLE');
    expect(first.ubicacion).toBe('MIRAFLORES');
    expect(first.fecha).toBe('27/09/2026');
    expect(first.fechaISO).toBe('2026-09-27');
    expect(first.info).toContain('ÚLTIMO DÍA DE INSCRIPCIÓN');
    expect(first.esUltimoDiaInscripcion).toBe(true);
  });

  it('también acepta comillas planas (variante render)', () => {
    const slides = parseRemajuHome(fixture);
    const carabayllo = slides.find((s) => s.ubicacion === 'CARABAYLLO');
    expect(carabayllo).toBeDefined();
    expect(carabayllo?.convocatoria).toBe('40450');
    expect(carabayllo?.remate).toBe('25295');
    expect(carabayllo?.esUltimoDiaInscripcion).toBe(true);
  });

  it('tolera paneles incompletos (sin fecha/info/ids)', () => {
    const slides = parseRemajuHome(fixture);
    const sinDetalle = slides.find((s) => s.ubicacion === 'SIN DETALLE');
    expect(sinDetalle).toBeDefined();
    expect(sinDetalle?.convocatoria).toBeUndefined();
    expect(sinDetalle?.remate).toBeUndefined();
    expect(sinDetalle?.fecha).toBeUndefined();
    expect(sinDetalle?.fechaISO).toBeUndefined();
    expect(sinDetalle?.esUltimoDiaInscripcion).toBe(false);
  });

  it('devuelve [] para HTML sin carrusel', () => {
    expect(parseRemajuHome('<html><body>sin remates</body></html>')).toEqual([]);
    expect(parseRemajuHome('')).toEqual([]);
  });
});

describe('REM@JU connector (public surface, no auth)', () => {
  it('search mapea el carrusel a SearchResult[Item]', async () => {
    stubFetch(fixture);
    const res = await remajuConnector.search({});
    expect(res.source).toBe('remaju');
    expect(res.totalFound).toBe(3);
    expect(res.items.length).toBe(3);

    const [first] = res.items;
    expect(first.externalId).toBe('remaju:remate:25296');
    expect(first.sourceUrl).toBe(`${REMAJU_HOME_URL}?remate=25296`);
    expect(first.district).toBe('MIRAFLORES');
    expect(first.title).toContain('REMATE SIMPLE');
    expect(first.rawData).toMatchObject({ convocatoria: '40451' });
  });

  it('reutiliza la sesión HTTP (cookie jsessionid) entre peticiones', async () => {
    const fn = stubFetch(fixture, 200, {
      'set-cookie': 'jsessionid=abc123; Path=/; HttpOnly',
    });
    await remajuConnector.search({});
    await remajuConnector.search({});
    const reqs = calls(fn);
    expect(reqs.length).toBeGreaterThanOrEqual(2);
    const firstHeaders = reqs[0].opts?.headers as Record<string, string> | undefined;
    expect(firstHeaders?.Cookie ?? firstHeaders?.['cookie']).toBeUndefined();
    const secondHeaders = reqs[1].opts?.headers as Record<string, string> | undefined;
    expect(secondHeaders?.Cookie ?? secondHeaders?.['cookie']).toBe('jsessionid=abc123');
  });

  it('filtra por distrito (case-insensitive) y aplica limit', async () => {
    stubFetch(fixture);
    const cusco = await remajuConnector.search({ district: 'cusco', limit: 10 });
    expect(cusco.totalFound).toBe(1);
    expect(cusco.items[0]?.externalId).toBe('remaju:remate:25290');

    const limit = await remajuConnector.search({ limit: 2 });
    expect(limit.items.length).toBe(2);
    expect(limit.totalFound).toBe(3);

    const none = await remajuConnector.search({ district: 'NOEXISTE' });
    expect(none.totalFound).toBe(0);
    expect(none.items).toEqual([]);
  });

  it('ante 403 del WAF degrada a sin resultados (nunca inventa datos)', async () => {
    stubFetch('<html><body>blocked</body></html>', 403);
    const res = await remajuConnector.search({});
    expect(res.items).toEqual([]);
    expect(res.totalFound).toBe(0);
  });

  it('getStatus refleja disponibilidad real del home público', async () => {
    stubFetch(fixture);
    const ok = await remajuConnector.getStatus();
    expect(ok.status).toBe('available');

    stubFetch('<html>denied</html>', 403);
    const blocked = await remajuConnector.getStatus();
    expect(blocked.status).toBe('unavailable');
    expect(blocked.message).toContain('REM@JU');

    stubFetch('', 500);
    const down = await remajuConnector.getStatus();
    expect(down.status).toBe('unavailable');
  });

  it('getDetails informa que el detalle requiere AJAX/sesión (T4.5)', async () => {
    const detail = await remajuConnector.getDetails('remaju:remate:25296');
    expect(detail.found).toBe(false);
    expect(detail.source).toBe('remaju');
    expect(detail.requiresManualAction).toBe(false);
  });
});