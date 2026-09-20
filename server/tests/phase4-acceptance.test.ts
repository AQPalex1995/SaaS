import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchOrchestrator } from '../src/domain/research/orchestrator.js';
import { ManualActionService } from '../src/domain/research/manual-action.service.js';
import { planRemateIntake } from '../src/domain/research/remate-manual.js';
import { planRemajuMatches } from '../src/domain/research/remaju-research.js';
import { linkRemateToProperties } from '../src/connectors/implementations/remaju-link.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const CASE_ID = '00000000-0000-0000-0000-000000000001';
const PROP_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Fase 4 / T4.8 — Acceptance tests (offline).
 *
 * End-to-end REM@JU manual cycle without network: judicial task → weak
 * candidates → requires_manual_action → operator completes (result + provenance)
 * → task settled and case completed. Plus fixtures and link/intake edge cases.
 */

describe('Fase 4 acceptance (T4.8)', () => {
  beforeEach(() => {
    for (const c of allStubConnectors) connectorRegistry.register(c);
  });

  it('ciclo E2E offline: judicial → requires_manual_action → operador completa → case completed', async () => {
    const { db, state } = createInMemoryDb({
      property: {
        id: PROP_ID,
        district: 'Cayma',
        address: 'Av. Cayma 123',
        latitude: '-16.38',
        longitude: '-71.55',
        locationVerification: 'verified',
      },
      cases: [
        { id: CASE_ID, propertyId: PROP_ID, status: 'created', totalTaskCount: 1 },
      ],
      tasks: [
        { id: 'task-judicial', researchCaseId: CASE_ID, taskType: 'judicial', status: 'pending' },
      ],
    });

    // 1. Fase automática: remates públicos débiles (sin partida).
    const orchestrator = new ResearchOrchestrator(db, {
      remajuSearch: async () => ({
        items: [
          {
            externalId: 'remaju:remate:10',
            sourceUrl: 'https://remaju.pj.gob.pe/remaju/index.xhtml?remate=10',
            title: 'Remate · Cayma',
            district: 'Cayma',
            rawData: {
              normalized: { ubicacion: 'Cayma', ubicacionKey: 'CAYMA', fechaISO: '2026-10-01T00:00:00.000Z', tipo: 'remate_simple' },
            },
          },
        ],
        totalFound: 1,
        source: 'remaju',
        searchedAt: new Date(),
      }),
    });

    const caseResult = await orchestrator.executeCase(CASE_ID);

    expect(caseResult.status).toBe('completed'); // requires_manual_action es settled
    const task = state.tasks[0];
    expect(task.status).toBe('requires_manual_action');
    expect(task.requiresManualAction).toBe(true);
    expect(state.manualActions).toHaveLength(1);
    expect(state.results).toHaveLength(1);
    expect(state.results[0].data.hardMatch).toBe(false);

    // 2. Fase manual: el operador cruza el detalle (result con provenance).
    const manualService = new ManualActionService(db);
    const completed = await manualService.completeManualAction(state.manualActions[0].id, {
      result: {
        partida: 'P-05012345',
        registryId: 'reg-manual-1',
        locationApplied: true,
        warnings: [],
      },
      completedBy: 'operador',
    });

    expect(completed.status).toBe('completed');
    expect(completed.completedBy).toBe('operador');

    const settled = state.tasks[0];
    expect(settled.status).toBe('completed');
    expect(settled.requiresManualAction).toBe(false);

    // Resultado manual persistido con provenance high/verified.
    const manualResult = state.results[state.results.length - 1];
    expect(manualResult).toMatchObject({
      source: 'manual',
      dataType: 'judicial',
      confidence: 'high',
      verification: 'verified',
      parserVersion: 'manual-v1',
    });
    expect(manualResult.data.partida).toBe('P-05012345');

    // Auditoría.
    expect(state.auditLogs.length).toBeGreaterThan(0);
  });

  it('fixture de payload: planRemateIntake normaliza partida/montos/dirección y geocode', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const payload = JSON.parse(
      readFileSync(join(here, 'fixtures', 'remate-manual-payload.json'), 'utf8'),
    );

    const plan = planRemateIntake(payload as never);

    expect(plan.normalized.partida).toBe('P-12345678');
    expect(plan.normalized.valorDeuda).toBe(150000.5);
    expect(plan.normalized.tasacion).toBe(200000);
    expect(plan.normalized.precioRemate).toBe(180000);
    expect(plan.normalized.direccion).toContain('Los Álamos');
    expect(plan.normalized.direccion).toContain('Lote 12');
    expect(plan.normalized.direccion).toContain('Arequipa');
    expect(plan.normalized.origenUbicacion).toBe('partida');
    expect(plan.location).toMatchObject({ latitude: -16.409, longitude: -71.537, confidence: 'high' });
    expect(plan.needsGeocoding).toBe(false);
    expect(plan.warnings).toHaveLength(0);
  });

  it('planRemajuMatches: múltiples partidas y hard match con la segunda', () => {
    const plan = planRemajuMatches(
      {
        propertyId: PROP_ID,
        district: 'Arequipa',
        registryNumbers: ['P-11111111', 'P-22222222'],
      },
      [
        {
          externalId: 'remaju:remate:1',
          partida: 'p 2222 2222',
          ubicacionKey: 'AREQUIPA',
          title: 'Remate',
        },
      ],
    );
    expect(plan.hardMatch).toBe(true);
    expect(plan.matches[0]).toMatchObject({ matchType: 'partida', confidence: 'high' });
  });

  it('linkRemateToProperties prioriza partida sobre dirección cuando hay ambas', () => {
    const links = linkRemateToProperties(
      { partida: 'P1', ubicacionKey: 'AREQUIPA', direccion: 'Av. Ejército 400' },
      [
        { propertyId: 'addr', district: 'Arequipa', address: 'Avenida Ejercito 400, Yanahuara' },
        { propertyId: 'partida', registryNumber: 'p 1' },
      ],
    );
    expect(links[0].propertyId).toBe('partida');
    expect(links[0].matchType).toBe('partida');
  });

  it('intake sin direcciones solo advierte y no geocodifica', () => {
    const plan = planRemateIntake({ partida: 'P9', valorDeuda: 10 } as never);
    expect(plan.normalized.direccion).toBeNull();
    expect(plan.needsGeocoding).toBe(false);
    expect(plan.location).toBeNull();
    expect(plan.warnings.length).toBeGreaterThanOrEqual(1);
  });
});