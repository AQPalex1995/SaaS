import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchOrchestrator } from '../src/domain/research/orchestrator.js';
import { ManualActionService } from '../src/domain/research/manual-action.service.js';
import { planRemateIntake } from '../src/domain/research/remate-manual.js';
import { planRemajuMatches } from '../src/domain/research/remaju-research.js';
import { linkRemateToProperties } from '../src/connectors/implementations/remaju-link.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import type { Database } from '../src/db/connection.js';
import {
  auditLogs,
  manualActions,
  properties,
  researchCases,
  researchResults,
  researchTasks,
} from '../src/db/schema/index.js';

const CASE_ID = '00000000-0000-0000-0000-000000000001';
const PROP_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Fase 4 / T4.8 — Acceptance tests (offline).
 *
 * End-to-end REM@JU manual cycle without network: judicial task → weak
 * candidates → requires_manual_action → operator completes (result + provenance)
 * → task settled and case completed. Plus fixtures and link/intake edge cases.
 */

function isColumn(node: any): boolean {
  return !!node && typeof node === 'object' && typeof node.name === 'string' && node.table !== undefined;
}
function isParam(node: any): boolean {
  return (
    !!node &&
    (node.constructor?.name === 'Param' || (typeof node === 'object' && 'value' in node && 'column' in node))
  );
}
function columnKey(col: any): string | null {
  const table = col?.table as any;
  if (table && typeof table === 'object') {
    for (const key of Object.keys(table)) if (table[key] === col) return key;
  }
  return typeof col?.name === 'string' ? col.name : null;
}
function evalWhere(pred: any, row: Record<string, any>): boolean {
  if (!pred || typeof pred !== 'object') return true;
  const chunks = Array.isArray(pred.queryChunks) ? pred.queryChunks : null;
  if (!chunks) return true;
  const inner = chunks.filter((c: any) => c?.constructor?.name === 'SQL');
  if (inner.length > 0) return inner.every((c: any) => evalWhere(c, row));
  const col = chunks.find((c: any) => isColumn(c));
  const param = chunks.find((c: any) => isParam(c));
  if (col && param) {
    const key = columnKey(col);
    if (key) return row[key] === param.value;
  }
  return true;
}

function createInMemoryDb(seed: { property?: any; tasks?: any[]; cases?: any[] }) {
  const now = new Date();
  const state: any = {
    properties: seed.property ? [{ ...seed.property }] : [],
    tasks: (seed.tasks ?? []).map((t) => ({
      status: 'pending',
      requiresManualAction: false,
      manualActionDescription: null,
      retryCount: 0,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...t,
    })),
    cases: (seed.cases ?? []).map((c) => ({
      status: 'created',
      completedTaskCount: 0,
      totalTaskCount: (seed.tasks ?? []).length,
      errorCount: 0,
      warningCount: 0,
      summary: null,
      ...c,
    })),
    results: [] as any[],
    manualActions: [] as any[],
    auditLogs: [] as any[],
    registryProperties: [] as any[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;
  const tableData = (table: any): any[] => {
    if (table === properties) return state.properties;
    if (table === researchCases) return state.cases;
    if (table === researchTasks) return state.tasks;
    if (table === researchResults) return state.results;
    if (table === manualActions) return state.manualActions;
    if (table === auditLogs) return state.auditLogs;
    return [];
  };
  const queryable = (data: any[]) => {
    const promise = Promise.resolve(data);
    const q: any = {
      where: (pred: any) => queryable(data.filter((r) => evalWhere(pred, r))),
      limit: (n: number) => Promise.resolve(data.slice(0, n)),
      orderBy: () => Promise.resolve(data),
      then: (onf: any, onr: any) => promise.then(onf, onr),
      catch: (onc: any) => promise.catch(onc),
    };
    return q;
  };
  return {
    db: {
      select: () => ({ from: (table: any) => queryable(tableData(table)) }),
      insert: (table: any) => ({
        values: (values: any) => {
          const prefix =
            table === researchCases
              ? 'case'
              : table === researchTasks
                ? 'task'
                : table === researchResults
                  ? 'res'
                  : table === manualActions
                    ? 'ma'
                    : 'row';
          const row = {
            id: values.id ?? nextId(prefix),
            createdAt: now,
            updatedAt: now,
            status: table === manualActions ? values.status ?? 'requested' : values.status,
            ...values,
          };
          tableData(table).push(row);
          const ret = [row];
          return {
            returning: () => Promise.resolve(ret),
            then: (onf: any, onr: any) => Promise.resolve(ret).then(onf, onr),
          };
        },
      }),
      update: (table: any) => ({
        set: (values: any) => ({
          where: (pred: any) => {
            const matched = tableData(table).filter((r: any) => evalWhere(pred, r));
            for (const r of matched) Object.assign(r, values);
            const ret = matched.map((r: any) => ({ ...r }));
            return {
              returning: () => Promise.resolve(ret),
              then: (onf: any, onr: any) => Promise.resolve(ret).then(onf, onr),
            };
          },
        }),
      }),
    } as unknown as Database,
    state,
  };
}

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

    expect(plan.normalized.partida).toBe('P12345678');
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