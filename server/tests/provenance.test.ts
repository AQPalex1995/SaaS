import { describe, expect, it, vi } from 'vitest';
import { researchResults } from '../src/db/schema/index.js';
import { recordResearchResult } from '../src/domain/research/result-provenance.js';

type CapturedValues = Record<string, any>;

/** Minimal mock DB that captures every research_results insert. */
function buildCaptureDb() {
  const inserts: CapturedValues[] = [];
  const db = {
    insert: vi.fn().mockImplementation((table: any) => ({
      values: (values: any) => {
        if (table === researchResults) inserts.push(values);
        const retVal = [{ id: `captured-${inserts.length}` }];
        return {
          returning: vi.fn().mockResolvedValue(retVal),
          then: (
            onfulfilled: (v: any) => any,
            onrejected: (e: any) => any,
          ) => Promise.resolve(retVal).then(onfulfilled, onrejected),
        };
      },
    })),
  } as any;
  return { db, inserts };
}

describe('T3.5 — Research Result provenance', () => {
  it('enforces full provenance on every insert with normalized defaults', async () => {
    const { db, inserts } = buildCaptureDb();
    const before = new Date();

    const id = await recordResearchResult(db, {
      researchTaskId: 'task-1',
      propertyId: 'prop-1',
      source: 'openstreetmap',
      dataType: 'geolocation',
      data: { latitude: -16.4, longitude: -71.5 },
    });

    expect(id).toBe('captured-1');
    expect(inserts.length).toBe(1);
    const row = inserts[0];

    // 1) source
    expect(row.source).toBe('openstreetmap');
    // 2) source_url — null when the source does not provide one
    expect(row.sourceUrl).toBeNull();
    // 3) retrieved_at — defaults to now
    expect(row.retrievedAt).toBeInstanceOf(Date);
    expect(row.retrievedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    // 4) confidence / 5) verification / 8) parser_version defaults
    expect(row.confidence).toBe('unknown');
    expect(row.verification).toBe('reported');
    expect(row.parserVersion).toBe('v1');
    // 6) raw_data / 7) normalized data
    expect(row.rawData).toBeNull();
    expect(row.data).toEqual({ latitude: -16.4, longitude: -71.5 });
    // data_type required
    expect(row.dataType).toBe('geolocation');
  });

  it('preserves explicit provenance values and returns the inserted id', async () => {
    const { db, inserts } = buildCaptureDb();
    const retrievedAt = new Date('2026-09-17T12:00:00Z');

    const id = await recordResearchResult(db, {
      researchTaskId: 'task-2',
      propertyId: 'prop-2',
      source: 'sunarp',
      sourceUrl: 'https://www.sunarp.gob.pe/partida/11029384',
      retrievedAt,
      dataType: 'registry',
      data: { chargeDetected: false },
      rawData: { rawResponse: '...' },
      confidence: 'high',
      verification: 'verified',
      parserVersion: 'registry-v2',
      metadata: { attempt: 1 },
    });

    expect(id).toBe('captured-1');
    const row = inserts[0];
    expect(row.sourceUrl).toBe('https://www.sunarp.gob.pe/partida/11029384');
    expect(row.retrievedAt).toBe(retrievedAt);
    expect(row.rawData).toEqual({ rawResponse: '...' });
    expect(row.confidence).toBe('high');
    expect(row.verification).toBe('verified');
    expect(row.parserVersion).toBe('registry-v2');
    expect(row.metadata).toEqual({ attempt: 1 });
  });
});