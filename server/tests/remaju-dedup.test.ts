import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  dedupeEntries,
  dedupeRemates,
  mergeRemate,
  remajuContentHash,
  remajuDedupKey,
} from '../src/connectors/implementations/remaju-dedup';
import { normalizeRemateSlide } from '../src/connectors/implementations/remaju-normalize';
import { remajuConnector } from '../src/connectors/implementations/remaju';
import type { NormalizedRemate } from '../src/connectors/implementations/remaju-normalize';

function remate(overrides: Partial<NormalizedRemate>): NormalizedRemate {
  return {
    ...normalizeRemateSlide({
      remate: '25296',
      convocatoria: '40451',
      tipoConvocatoria: '1',
      tipoLabel: 'REMATE SIMPLE',
      ubicacion: 'MIRAFLORES',
      fecha: '27/09/2026',
      esUltimoDiaInscripcion: false,
    }),
    ...overrides,
  };
}

function panel(opts: {
  remate?: string;
  convocatoria?: string;
  tipo?: string;
  ubicacion: string;
  fecha: string;
  info?: string;
  label?: string;
}): string {
  const pairs = [
    opts.convocatoria ? `{name:"convocatoria",value:"${opts.convocatoria}"}` : '',
    opts.tipo ? `{name:"tipoConvocatoria",value:"${opts.tipo}"}` : '',
    opts.remate ? `{name:"remate",value:"${opts.remate}"}` : '',
  ]
    .filter(Boolean)
    .join(',');
  return (
    `<li class="ui-galleria-panel ui-corner-all"><div class="box-remate">` +
    `<span class="text-bold">${opts.label ?? 'REMATE SIMPLE'}</span>` +
    `<div><i class="fa fa-map-marker"></i> ${opts.ubicacion}</div>` +
    `<div class="fecha"><i class="fa fa-calendar"></i> ${opts.fecha}</div>` +
    (opts.info ? `<div class="info">${opts.info}</div>` : '') +
    `<a><span>Detalle</span></a>` +
    `<script>PrimeFaces.ab({pa:[${pairs}]});</script>` +
    `</div></li>`
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('REM@JU dedup (T4.4)', () => {
  it('contentHash es determinista e insensible a mayúsculas/espacios en info', () => {
    const a = remate({ info: 'ÚLTIMO   DÍA de Inscripción' });
    const b = remate({ info: 'último día de inscripción' });
    expect(remajuContentHash(a)).toHaveLength(64);
    expect(remajuContentHash(a)).toBe(remajuContentHash(b));
    expect(remajuContentHash(a)).not.toBe(remajuContentHash(remate({ info: null })));
  });

  it('contentHash cambia con el contenido (tipo/ubicación/fecha)', () => {
    const base = remate({});
    expect(remajuContentHash(base)).not.toBe(remajuContentHash(remate({ tipo: 'subasta' })));
    expect(remajuContentHash(base)).not.toBe(remajuContentHash(remate({ ubicacionKey: 'CUSCO' })));
    expect(remajuContentHash(base)).not.toBe(remajuContentHash(remate({ fechaISO: '2026-10-01' })));
  });

  it('dedupKey prioriza remate > convocatoria > hash', () => {
    expect(remajuDedupKey(remate({}))).toBe('remate:25296');
    expect(remajuDedupKey(remate({ remateId: null }))).toBe('convocatoria:40451');
    const noIds = remate({ remateId: null, convocatoriaId: null });
    expect(remajuDedupKey(noIds)).toBe(`hash:${remajuContentHash(noIds)}`);
  });

  it('dedupeRemates colapsa un mismo remate y fusiona campos faltantes', () => {
    const sparse = remate({ remateId: null, tipo: 'desconocido', info: null, fechaISO: null });
    const full = remate({ info: 'ÚLTIMO DÍA DE INSCRIPCIÓN' });
    const result = dedupeRemates([sparse, full]);
    expect(result.totalInput).toBe(2);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.unique[0].normalized).toMatchObject({
      remateId: 25296,
      tipo: 'remate_simple',
      fechaISO: '2026-09-27',
      info: 'ÚLTIMO DÍA DE INSCRIPCIÓN',
    });
  });

  it('dedupeRemates separa remates distintos y entradas sin ids', () => {
    const a = remate({});
    const b = remate({ remateId: 999, convocatoriaId: 42500 });
    const noId = remate({ remateId: null, convocatoriaId: null, ubicacionKey: 'CUSCO' });
    const result = dedupeRemates([a, b, noId]);
    expect(result.unique).toHaveLength(3);
    expect(result.duplicates).toHaveLength(0);
  });

  it('dedupeEntries conserva el raw representativo (primera aparición)', () => {
    const first = { raw: 'p1', normalized: remate({ tipo: 'desconocido' }) };
    const second = { raw: 'p2', normalized: remate({}) };
    const result = dedupeEntries([first, second]);
    expect(result.unique).toHaveLength(1);
    expect(result.unique[0].raw).toBe('p1');
    expect(result.unique[0].normalized.tipo).toBe('remate_simple');
    expect(result.duplicates[0].raw).toBe('p2');
  });

  it('mergeRemate no pisa valores ya presentes', () => {
    const merged = mergeRemate(remate({ info: 'original' }), remate({ info: 'nuevo' }));
    expect(merged.info).toBe('original');
  });

  it('el conector deduplica el carrusel y expone el shape fusionado', async () => {
    const html =
      '<ul>' +
      panel({ remate: '25296', convocatoria: '40451', tipo: '1', ubicacion: 'MIRAFLORES', fecha: '27/09/2026' }) +
      panel({
        remate: '25296',
        convocatoria: '40451',
        tipo: '1',
        ubicacion: 'MIRAFLORES',
        fecha: '27/09/2026',
        info: 'ÚLTIMO DÍA DE INSCRIPCIÓN',
      }) +
      panel({ remate: '25295', convocatoria: '40450', tipo: '2', ubicacion: 'CARABAYLLO', fecha: '01/10/2026' }) +
      '</ul>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })),
    );

    const res = await remajuConnector.search({});
    expect(res.totalFound).toBe(2);
    expect(res.items).toHaveLength(2);
    const first = res.items[0];
    const normalized = (first.rawData as { normalized: NormalizedRemate }).normalized;
    expect(first.externalId).toBe('remaju:remate:25296');
    expect(normalized.info).toBe('ÚLTIMO DÍA DE INSCRIPCIÓN');
  });

  it('el conector ignora paneles sin ids (no inventa externalId)', async () => {
    const html = '<ul>' + panel({ ubicacion: 'SIN DETALLE', fecha: '01/01/2026' }) + '</ul>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })),
    );
    const res = await remajuConnector.search({});
    expect(res.totalFound).toBe(0);
    expect(res.items).toEqual([]);
  });
});
