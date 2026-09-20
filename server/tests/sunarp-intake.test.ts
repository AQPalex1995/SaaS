import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchOrchestrator } from '../src/domain/research/orchestrator.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import {
  sunarpConnector,
  SUNARP_CONOCE_AQUI_URL,
} from '../src/connectors/implementations/sunarp.js';
import { RemateIntakeService } from '../src/domain/research/remate-intake.service.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const CASE_ID = '00000000-0000-0000-0000-000000000003';
const PROP_ID = '00000000-0000-0000-0000-000000000004';

/**
 * Fase 5 / T5.10 — Intake SUNARP end-to-end (offline).
 *
 * Ciclo cerrado para SUNARP dentro de la plataforma: la tarea `registry` cae
 * en `requires_manual_action` y el orchestrator crea una `manual_action`
 * (kind login) que ahora lleva la **URL oficial** del servicio
 * (`ConnectorStatus.url`, T5.10). El operador la completa desde el intake con
 * la captura del detalle registral (titulares, cargas, títulos) y el sistema
 * persiste en `registry_*` atribuyendo el origen real de la captura
 * (`source: 'sunarp'`, regla de trazabilidad AGENTS §3.5 y provenance T5.9).
 */
describe('Fase 5 / T5.10 — Intake SUNARP end-to-end', () => {
  beforeEach(() => {
    for (const c of allStubConnectors) connectorRegistry.register(c);
    connectorRegistry.register(sunarpConnector);
  });

  it('ciclo E2E offline: registry → manual action con URL → operador completa captura SUNARP → task completed', async () => {
    const { db, state } = createInMemoryDb({
      property: {
        id: PROP_ID,
        district: 'Cayma',
        address: 'Av. Cayma 123',
        latitude: '-16.38',
        longitude: '-71.55',
        locationVerification: 'verified',
      },
      cases: [{ id: CASE_ID, propertyId: PROP_ID, status: 'created', totalTaskCount: 1 }],
      tasks: [
        { id: 'task-registry', researchCaseId: CASE_ID, taskType: 'registry', status: 'pending' },
      ],
    });

    // 1. Fase automática: el conector SUNARP reporta requires_auth → manual action.
    const orchestrator = new ResearchOrchestrator(db);
    const caseResult = await orchestrator.executeCase(CASE_ID);

    expect(caseResult.status).toBe('completed'); // requires_manual_action es settled
    expect(state.tasks[0].status).toBe('requires_manual_action');
    expect(state.manualActions).toHaveLength(1);
    expect(state.manualActions[0]).toMatchObject({
      actionKind: 'login',
      source: 'sunarp',
      url: SUNARP_CONOCE_AQUI_URL,
    });

    // 2. Fase manual: el operador completa la acción con la captura del detalle
    //    registral que vio en Conoce Aquí.
    const intake = new RemateIntakeService({ db: db as never });
    const result = await intake.complete(state.manualActions[0].id, {
      payload: {
        partida: 'P-05012345',
        distrito: 'Cayma',
        latitude: -16.38,
        longitude: -71.55,
        propietarios: [
          { nombre: 'MARIA QUISPE', tipoDocumento: 'DNI', numeroDocumento: '12345678' },
          { nombre: 'JUAN PEREZ', tipoDocumento: 'CARNET DE EXTRANJERIA', numeroDocumento: 'CE00112233' },
        ],
        cargas: [
          { tipo: 'HIPOTECA', monto: 'S/ 100,000', moneda: 'S/', estado: 'VIGENTE' },
          { tipo: 'EMBARGO', monto: 'S/ 25,000', moneda: 'S/', estado: 'VENCIDO' },
        ],
        titulos: [
          { titulo: '006-2020', fechaTitulo: '15/03/2020', tipoTitulo: 'INDEPENDIZACION' },
        ],
      },
      completedBy: 'analista',
    });

    // Titulares/cargas/títulos SUNARP persistidos.
    expect(result.ownersPersisted).toBe(2);
    expect(result.chargesPersisted).toBe(2);
    expect(result.titlesPersisted).toBe(1);

    // La fila registral se atribuye a SUNARP, no a una transcripción manual.
    expect(result.plan.registry?.source).toBe('sunarp');
    expect(result.plan.registry?.provenance).toMatchObject({
      source: 'sunarp',
      sourceUrl: SUNARP_CONOCE_AQUI_URL,
      parserVersion: 'v1',
    });
    // La provenance de superficie del intake apunta a la captura SUNARP.
    expect(result.plan.normalized.provenance).toMatchObject({
      source: 'sunarp',
      sourceUrl: SUNARP_CONOCE_AQUI_URL,
      confidence: 'medium',
      verification: 'reported',
    });
    // El estado derivado sigue marcándose como inferido (nunca un HECHO).
    expect(result.plan.normalized.historical.provenance).toMatchObject({
      source: 'sunarp',
      verification: 'inferred',
    });

    expect(state.registryProperties[0]).toMatchObject({
      registryNumber: 'P-05012345',
      source: 'sunarp',
      verification: 'reported',
    });

    // La tarea se asienta como completada.
    const settled = state.tasks[0];
    expect(settled.status).toBe('completed');
    expect(settled.requiresManualAction).toBe(false);

    // El resultado manual queda registrado con provenance de la captura.
    const manualResult = state.results[state.results.length - 1];
    expect(manualResult).toMatchObject({
      source: 'manual',
      dataType: 'registry',
      confidence: 'high',
      verification: 'verified',
    });
    expect(manualResult.data.provenance.source).toBe('sunarp');
  });
});