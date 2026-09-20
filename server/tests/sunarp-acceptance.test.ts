import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SunarpConnector,
  sunarpConnector,
  SUNARP_CONOCE_AQUI_URL,
} from '../src/connectors/implementations/sunarp.js';
import {
  SunarpSprlConnector,
  SUNARP_SPRL_URL,
} from '../src/connectors/implementations/sunarp-sprl.js';
import { planRemateIntake } from '../src/domain/research/remate-manual.js';
import { RemateIntakeService } from '../src/domain/research/remate-intake.service.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const CASE_ID = '00000000-0000-0000-0000-000000000005';
const PROP_ID = '00000000-0000-0000-0000-000000000006';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, 'fixtures', 'registry-capture.json'), 'utf8'),
);

/**
 * Fase 5 / T5.11 — Acceptance tests (offline).
 *
 * Regresión integral de la fase SUNARP (T5.1–T5.10), sin red:
 * postura honesta + anti-datos-inventados, pipeline captura → normalización →
 * estado derivado → provenance, atribución de la fuente real de la captura y
 * el ciclo manual completo (incluida la variante SPRL de pago).
 */
describe('Fase 5 acceptance (T5.11)', () => {
  let fetchSpy!: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Cualquier intento de red durante la fase SUNARP es un fallo del test.
    fetchSpy = vi.fn(() => {
      throw new Error('red no permitida en los acceptance tests de SUNARP');
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('postura honesta: SUNARP y SPRL reportan requires_auth + URL, sin datos simulados ni red', async () => {
    const sunarp = new SunarpConnector();
    const sprl = new SunarpSprlConnector();

    const sStatus = await sunarp.getStatus();
    expect(sStatus.status).toBe('requires_auth');
    expect(sStatus.requiresManualAction).toBe(true);
    expect(sStatus.url).toBe(SUNARP_CONOCE_AQUI_URL);

    const pStatus = await sprl.getStatus();
    expect(pStatus.status).toBe('requires_auth');
    expect(pStatus.requiresManualAction).toBe(true);
    expect(pStatus.url).toBe(SUNARP_SPRL_URL);
    expect(pStatus.message).toContain('pago');

    // Nunca datos simulados.
    expect((await sunarp.search({ query: 'P-01234567' })).items).toHaveLength(0);
    expect((await sunarp.getDetails('P-01234567')).found).toBe(false);
    expect((await sprl.search({ query: 'P-01234567' })).items).toHaveLength(0);
    expect((await sprl.getDetails('P-01234567')).found).toBe(false);

    // Ni una sola petición de red en toda la interacción.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pipeline desde el fixture: normaliza partida/titulares/cargas, deriva estado y adjunta provenance', () => {
    const plan = planRemateIntake(
      {
        partida: fixture.partida,
        distrito: fixture.distrito,
        propietarios: fixture.propietarios,
        cargas: fixture.cargas,
      },
      new Date('2026-09-19T15:00:00.000Z'),
      { source: 'sunarp', url: SUNARP_CONOCE_AQUI_URL },
    );

    expect(plan.normalized.partida).toBe('P-01234567');
    expect(plan.normalized.propietarios).toHaveLength(2);
    expect(plan.normalized.cargas).toHaveLength(2);

    // Estado derivado (T5.8): hay una carga vigente → 'cargado'.
    expect(plan.normalized.historical.chargeCount).toBe(2);
    expect(plan.normalized.historical.activeCharges).toHaveLength(1);
    expect(plan.normalized.historical.registryState).toBe('cargado');
    expect(plan.normalized.historical.totalActiveDebtPen).toBe(1234567.89);
    expect(plan.normalized.historical.totalActiveDebtUsd).toBe(0);

    // Provenance de la captura (T5.9 + T5.10): fuente real, reported, parser v1.
    expect(plan.normalized.provenance).toMatchObject({
      source: 'sunarp',
      sourceUrl: SUNARP_CONOCE_AQUI_URL,
      retrievedAt: '2026-09-19T15:00:00.000Z',
      verification: 'reported',
      parserVersion: 'v1',
    });
    expect(plan.registry).toMatchObject({ source: 'sunarp' });
    // La derivación nunca se presenta como HECHO verificado.
    expect(plan.normalized.historical.provenance.verification).toBe('inferred');
  });

  it('atribución de la captura: manual/remaju por defecto y sunarp/sunarp_sprl/sunarp_bgr explícitas', () => {
    const sources = [
      { context: {}, intake: 'manual', registry: 'remaju' },
      { context: { source: 'sunarp' as const }, intake: 'sunarp', registry: 'sunarp' },
      { context: { source: 'sunarp_sprl' as const }, intake: 'sunarp_sprl', registry: 'sunarp_sprl' },
      { context: { source: 'sunarp_bgr' as const }, intake: 'sunarp_bgr', registry: 'sunarp_bgr' },
    ];

    for (const { context, intake, registry } of sources) {
      const plan = planRemateIntake({ partida: 'P 110 0123 4567' }, undefined, context);
      expect(plan.normalized.provenance.source).toBe(intake);
      expect(plan.registry?.source).toBe(registry);
      expect(plan.registry?.provenance.source).toBe(registry);
      // Nunca se etiqueta una captura como 'remaju' en la superficie del intake.
      if (intake !== 'manual') expect(plan.normalized.provenance.source).not.toBe('manual');
    }
  });

  it('ciclo manual completo con SPRL (de pago): captura → provenance sunarp_sprl → task completed', async () => {
    const { db, state } = createInMemoryDb({
      property: {
        id: PROP_ID,
        district: 'Arequipa',
        address: 'Av. Los Geranios 240',
        latitude: '-16.40',
        longitude: '-71.53',
        locationVerification: 'verified',
      },
      cases: [{ id: CASE_ID, propertyId: PROP_ID, status: 'running', totalTaskCount: 1 }],
      tasks: [
        {
          id: 'task-registry',
          researchCaseId: CASE_ID,
          taskType: 'registry',
          status: 'requires_manual_action',
        },
      ],
      manualActions: [
        {
          id: 'ma-sprl',
          researchTaskId: 'task-registry',
          propertyId: PROP_ID,
          actionKind: 'login',
          status: 'requested',
          instructions: 'Gestionar copia literal SUNARP (SPRL, de pago)',
          url: SUNARP_SPRL_URL,
          source: 'sunarp_sprl',
          requestedAt: new Date(),
        },
      ],
    });

    const intake = new RemateIntakeService({ db: db as never });
    const result = await intake.complete('ma-sprl', {
      payload: {
        partida: 'P-05012345',
        distrito: 'Arequipa',
        latitude: -16.4,
        longitude: -71.53,
        propietarios: [{ nombre: 'MARIA QUISPE', tipoDocumento: 'DNI', numeroDocumento: '12345678' }],
        cargas: [{ tipo: 'HIPOTECA', monto: 'S/ 100,000', moneda: 'S/', estado: 'VIGENTE' }],
      },
      completedBy: 'analista',
    });

    // La captura SPRL se atribuye a su fuente real (no a 'manual').
    expect(result.plan.normalized.provenance).toMatchObject({
      source: 'sunarp_sprl',
      sourceUrl: SUNARP_SPRL_URL,
      verification: 'reported',
      parserVersion: 'v1',
    });
    expect(result.plan.registry?.source).toBe('sunarp_sprl');
    expect(result.ownersPersisted).toBe(1);
    expect(result.chargesPersisted).toBe(1);

    // La tarea se asienta y el resultado manual conserva el provenance de la captura.
    expect(state.tasks[0].status).toBe('completed');
    const manualResult = state.results[state.results.length - 1];
    expect(manualResult.data.provenance.source).toBe('sunarp_sprl');
  });

  it('registro singleton: la postura es la misma que la de las instancias reales', async () => {
    expect((await sunarpConnector.getStatus()).url).toBe(SUNARP_CONOCE_AQUI_URL);
  });
});