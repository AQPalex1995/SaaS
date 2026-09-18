import { describe, it, expect } from 'vitest';
import {
  planRemajuMatches,
  toRemateEntry,
  type RemajuPropertyInput,
  type RemajuRemateEntry,
} from '../src/domain/research/remaju-research';

const property: RemajuPropertyInput = {
  propertyId: 'prop-1',
  district: 'Arequipa',
  address: 'Av. Ejército 400',
  registryNumbers: ['P-1234-5678'],
};

function remate(over: Partial<RemajuRemateEntry> = {}): RemajuRemateEntry {
  return {
    externalId: 'remaju:remate:1',
    sourceUrl: 'https://remaju.pj.gob.pe/remaju/index.xhtml?remate=1',
    title: 'Remate · Ajedrez',
    partida: null,
    ubicacion: 'Arequipa',
    ubicacionKey: 'AREQUIPA',
    fechaISO: '2026-10-01T00:00:00.000Z',
    tipo: 'remate_simple',
    remateId: 1,
    convocatoriaId: null,
    ...over,
  };
}

describe('REM@JU research matching (T4.6)', () => {
  it('toRemateEntry extrae los campos normalizados del rawData', () => {
    const entry = toRemateEntry({
      externalId: 'remaju:remate:7',
      sourceUrl: 'u',
      title: 't',
      district: 'Yanahuara',
      rawData: {
        normalized: { ubicacion: 'Yanahuara', ubicacionKey: 'YANAHUARA', fechaISO: '2026-11-01' },
      },
    } as never);
    expect(entry.ubicacionKey).toBe('YANAHUARA');
    expect(entry.fechaISO).toBe('2026-11-01');
    expect(entry.partida).toBeNull();
  });

  it('coincidencia débil por distrito da confidence low y ningún hard match', () => {
    const plan = planRemajuMatches(property, [remate()]);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]).toMatchObject({ matchType: 'district', confidence: 'low' });
    expect(plan.hardMatch).toBe(false);
    expect(plan.confidence).toBe('low');
    expect(plan.bestMatchType).toBe('district');
  });

  it('coincidencia por partida registral es un hard match high', () => {
    const plan = planRemajuMatches(property, [
      remate({ partida: ' p 1234 5678 ', matchType: 'partida' } as never),
    ]);
    expect(plan.hardMatch).toBe(true);
    expect(plan.confidence).toBe('high');
    expect(plan.bestMatchType).toBe('partida');
  });

  it('advierte cuando la property no tiene partida registral', () => {
    const plan = planRemajuMatches({ ...property, registryNumbers: [] }, [remate()]);
    expect(plan.warnings.some((w) => w.includes('no tiene partida registral'))).toBe(true);
    expect(plan.hardMatch).toBe(false);
  });

  it('sin distrito ni dirección no hay candidatos (confidence unknown)', () => {
    const plan = planRemajuMatches(
      { propertyId: 'prop-1', registryNumbers: [] },
      [remate()],
    );
    expect(plan.matches).toHaveLength(0);
    expect(plan.confidence).toBe('unknown');
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('ordena los matches por score descendente y no duplica un remate', () => {
    const plan = planRemajuMatches(
      { ...property, registryNumbers: [] },
      [remate(), remate({ externalId: 'remaju:remate:2' })],
    );
    expect(plan.matches).toHaveLength(2);
    expect(plan.matches[0].score).toBeGreaterThanOrEqual(plan.matches[1].score);
    expect(new Set(plan.matches.map((m) => m.externalId)).size).toBe(2);
  });
});