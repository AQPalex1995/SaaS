import { describe, it, expect, beforeEach } from 'vitest';
import {
  SunarpConnector,
  sunarpConnector,
  sunarpManualActionDescription,
  sunarpOwnerSearchManualActionDescription,
  sunarpRegistryManualActionDescription,
  SUNARP_CONOCE_AQUI_URL,
  SUNARP_CONSULTA_PROPERTY_URL,
} from '../src/connectors/implementations/sunarp.js';
import { ResearchOrchestrator } from '../src/domain/research/orchestrator.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const CASE_ID = '00000000-0000-0000-0000-000000000003';
const PROP_ID = '00000000-0000-0000-0000-000000000004';

/**
 * Fase 5 / T5.1–T5.2 — SUNARP "Conoce Aquí" y "Consulta de Propiedad" (offline).
 *
 * Para Verdad: SUNARP NO ofrece ninguna superficie consultable sin identidad
 * personal (DNI + fecha de emisión) + CAPTCHA. El conector `sunarp` adopta una
 * postura honesta: requires_auth + manual action, sin peticiones de red y sin
 * datos simulados. T5.2 añade la superficie "Consulta de Propiedad" (búsqueda
 * de partidas por NOMBRE del propietario) al mismo estándar.
 */
describe('Fase 5 / T5.1–T5.2 — SUNARP Conoce Aquí + Consulta de Propiedad', () => {
  beforeEach(() => {
    for (const c of allStubConnectors) connectorRegistry.register(c);
    connectorRegistry.register(sunarpConnector);
  });

  it('getStatus reporta requires_auth + requiere ambas vías de investigación', async () => {
    const connector = new SunarpConnector();
    const status = await connector.getStatus();

    expect(status.status).toBe('requires_auth');
    expect(status.requiresManualAction).toBe(true);
    expect(status.message).toContain('CAPTCHA');
    // La superficie que el operador debe abrir llega en `url` (T5.10).
    expect(status.url).toBe(SUNARP_CONOCE_AQUI_URL);
    // El operador debe poder localizar la partida (Consulta de Propiedad) y
    // luego ver su contenido (Conoce Aquí).
    expect(status.manualActionDescription).toContain(SUNARP_CONSULTA_PROPERTY_URL);
    expect(status.manualActionDescription).toContain(SUNARP_CONOCE_AQUI_URL);
  });

  it('search (por titular) señala Consulta de Propiedad — nunca datos simulados', async () => {
    const connector = new SunarpConnector();
    const result = await connector.search({ query: 'P12345678' });

    expect(result.items).toHaveLength(0);
    expect(result.totalFound).toBe(0);
    expect(result.source).toBe('sunarp');
    expect(result.requiresManualAction).toBe(true);
    expect(result.manualActionDescription).toContain(SUNARP_CONSULTA_PROPERTY_URL);
    expect(result.manualActionDescription).toMatch(/denominación|propietario|DNI/i);
  });

  it('getDetails (contenido de partida) apunta a Conoce Aquí', async () => {
    const connector = new SunarpConnector();
    const detail = await connector.getDetails('P12345678');

    expect(detail.found).toBe(false);
    expect(detail.requiresManualAction).toBe(true);
    expect(detail.manualActionDescription).toContain(SUNARP_CONOCE_AQUI_URL);
  });

  it('la guía del operador cubre ambas superficies oficiales (sin bypass)', () => {
    const owner = sunarpOwnerSearchManualActionDescription();
    expect(owner).toContain(SUNARP_CONSULTA_PROPERTY_URL);
    expect(owner).toMatch(/No automatizable/);

    const detail = sunarpManualActionDescription();
    expect(detail).toContain(SUNARP_CONOCE_AQUI_URL);

    const registry = sunarpRegistryManualActionDescription();
    expect(registry).toContain(SUNARP_CONSULTA_PROPERTY_URL);
    expect(registry).toContain(SUNARP_CONOCE_AQUI_URL);
  });

  it('E2E offline: tarea registry → requires_manual_action + manual action (login) con guía combinada', async () => {
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
    expect(task.manualActionDescription).toContain('Consulta de Propiedad');

    expect(state.manualActions).toHaveLength(1);
    expect(state.manualActions[0]).toMatchObject({
      actionKind: 'login',
      source: 'sunarp',
      url: SUNARP_CONOCE_AQUI_URL,
    });
    const instructions = state.manualActions[0].instructions;
    expect(instructions).toContain('DNI');
    expect(instructions).toContain(SUNARP_CONSULTA_PROPERTY_URL);
    expect(instructions).toContain(SUNARP_CONOCE_AQUI_URL);
  });
});