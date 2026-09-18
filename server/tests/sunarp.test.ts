import { describe, it, expect, beforeEach } from 'vitest';
import {
  SunarpConnector,
  sunarpConnector,
  sunarpManualActionDescription,
  SUNARP_CONOCE_AQUI_URL,
} from '../src/connectors/implementations/sunarp.js';
import { ResearchOrchestrator } from '../src/domain/research/orchestrator.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const CASE_ID = '00000000-0000-0000-0000-000000000003';
const PROP_ID = '00000000-0000-0000-0000-000000000004';

/**
 * Fase 5 / T5.1 — SUNARP "Conoce Aquí" (offline).
 *
 * Para Verdad: SUNARP NO ofrece ninguna superficie consultable sin identidad
 * personal (DNI + fecha de emisión) + CAPTCHA. El conector `sunarp` adopta una
 * postura honesta: requires_auth + manual action, sin peticiones de red y sin
 * datos simulados.
 */
describe('Fase 5 / T5.1 — SUNARP Conoce Aquí', () => {
  beforeEach(() => {
    for (const c of allStubConnectors) connectorRegistry.register(c);
    connectorRegistry.register(sunarpConnector);
  });

  it('getStatus reporta requires_auth + requiresManualAction con instrucciones', async () => {
    const connector = new SunarpConnector();
    const status = await connector.getStatus();

    expect(status.status).toBe('requires_auth');
    expect(status.requiresManualAction).toBe(true);
    expect(status.manualActionDescription).toContain('DNI');
    expect(status.manualActionDescription).toContain('CAPTCHA');
  });

  it('search devuelve resultados vacíos (nunca datos simulados)', async () => {
    const connector = new SunarpConnector();
    const result = await connector.search({ query: 'P12345678' });

    expect(result.items).toHaveLength(0);
    expect(result.totalFound).toBe(0);
    expect(result.source).toBe('sunarp');
  });

  it('getDetails devuelve found=false + requiere acción manual', async () => {
    const connector = new SunarpConnector();
    const detail = await connector.getDetails('P12345678');

    expect(detail.found).toBe(false);
    expect(detail.requiresManualAction).toBe(true);
    expect(detail.manualActionDescription).toContain('Conoce Aquí');
  });

  it('la instrucción del operador cita el servicio público oficial sin bypass', () => {
    const description = sunarpManualActionDescription();
    expect(description).toContain(SUNARP_CONOCE_AQUI_URL);
    expect(description).toMatch(/no? automatizable|No automatizable/);
  });

  it('E2E offline: tarea registry → requires_manual_action + manual action (login)', async () => {
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
        { id: 'task-registry', researchCaseId: CASE_ID, taskType: 'registry', status: 'pending' },
      ],
    });

    const orchestrator = new ResearchOrchestrator(db);
    const caseResult = await orchestrator.executeCase(CASE_ID);

    // requires_manual_action es settled: el case completa sin bloquearse.
    expect(caseResult.status).toBe('completed');

    const task = state.tasks[0];
    expect(task.status).toBe('requires_manual_action');
    expect(task.requiresManualAction).toBe(true);
    expect(task.manualActionDescription).toContain('Conoce Aquí');

    expect(state.manualActions).toHaveLength(1);
    expect(state.manualActions[0]).toMatchObject({
      actionKind: 'login',
      source: 'sunarp',
    });
    expect(state.manualActions[0].instructions).toContain('DNI');
  });
});