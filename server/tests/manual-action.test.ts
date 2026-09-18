import { describe, it, expect, beforeEach } from 'vitest';
import {
  ManualActionService,
  type ManualActionFilters,
} from '../src/domain/research/manual-action.service';
import {
  auditLogs,
  manualActions,
  researchCases,
  researchResults,
  researchTasks,
} from '../src/db/schema/index';
import { connectorRegistry } from '../src/connectors/registry';
import {
  ResearchOrchestrator,
} from '../src/domain/research/orchestrator';
import { sunarpConnector } from '../src/connectors/stubs/index';
import type { PropertyDataSource } from '../src/connectors/base';

describe('T3.4 — Manual Action mechanism', () => {
  // ── In-memory DB simulation with predicate evaluation ─────────────────
  function isColumn(node: any): boolean {
    // Drizzle column: has a `.name` (the DB column name), a `.table`
    // back-reference, and no `value` shortcut. Params/StringChunks/SQL
    // nodes have none of those.
    return (
      !!node &&
      typeof node === 'object' &&
      typeof node.name === 'string' &&
      node.table !== undefined
    );
  }

  function isParam(node: any): boolean {
    return (
      !!node &&
      (node.constructor?.name === 'Param' ||
        (typeof node === 'object' && 'value' in node && 'column' in node))
    );
  }

  // Resolve the JS property key (camelCase) for a column from its table,
  // since `column.name` is the snake_case DB column name.
  function columnKey(col: any): string | null {
    const table = col?.table;
    if (table && typeof table === 'object') {
      for (const key of Object.keys(table)) {
        if ((table as any)[key] === col) return key;
      }
    }
    return typeof col?.name === 'string' ? col.name : null;
  }

  function evalWhere(pred: any, row: Record<string, any>): boolean {
    if (!pred || typeof pred !== 'object') return true;
    const chunks = Array.isArray(pred.queryChunks) ? pred.queryChunks : null;
    if (!chunks) return true;

    const innerSq = chunks.filter((c: any) => c?.constructor?.name === 'SQL');
    if (innerSq.length > 0) {
      return innerSq.every((c: any) => evalWhere(c, row));
    }

    const colChunk = chunks.find((c: any) => isColumn(c));
    const paramChunk = chunks.find((c: any) => isParam(c));
    if (colChunk && paramChunk) {
      const key = columnKey(colChunk);
      if (key) return row[key] === paramChunk.value;
    }
    return true;
  }

  function buildMockDb(initial: {
    actions?: any[];
    tasks?: any[];
    results?: any[];
    cases?: any[];
  }) {
    const manualDefaults = {
      actionKind: 'user_action',
      status: 'requested',
      url: null,
      source: null,
      requestedAt: new Date(),
      completedAt: null,
      completedBy: null,
      result: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const state = {
      actions: (initial.actions ?? []).map((r) => ({ ...manualDefaults, ...r })),
      tasks: (initial.tasks ?? []).map((r) => ({ ...r })),
      results: (initial.results ?? []).map((r) => ({ ...r })),
      cases: (initial.cases ?? []).map((r) => ({ ...r })),
      auditLogs: [] as any[],
    };

    const tableData = (table: any): any[] => {
      if (table === manualActions) return state.actions;
      if (table === researchTasks) return state.tasks;
      if (table === researchResults) return state.results;
      if (table === researchCases) return state.cases;
      if (table === auditLogs) return state.auditLogs;
      return [];
    };

    function queryable(data: any[]) {
      const promise = Promise.resolve(data);
      const q: any = {
        where: (pred: any) => queryable(data.filter((r) => evalWhere(pred, r))),
        limit: (n: number) => Promise.resolve(data.slice(0, n)),
        orderBy: () =>
          Promise.resolve(
            [...data].sort(
              (a: any, b: any) =>
                new Date(b.requestedAt ?? 0).getTime() - new Date(a.requestedAt ?? 0).getTime(),
            ),
          ),
        then: (onf: any, onr: any) => promise.then(onf, onr),
        catch: (onc: any) => promise.catch(onc),
        finally: (onf: any) => promise.finally(onf),
      };
      return q;
    }

    const mockDb: any = {
      select: () => ({
        from: (table: any) => queryable(tableData(table)),
      }),
      insert: (table: any) => ({
        values: (values: any) => {
          const base = { id: `seed-${state.actions.length + 1}`, ...values };
          const row = table === manualActions ? { ...manualDefaults, ...values, id: base.id } : base;
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
          where: () => {
            const rows = tableData(table);
            for (const r of rows) Object.assign(r, values);
            const ret = rows.length > 0 ? [rows[rows.length - 1]] : [{ id: 'none', ...values }];
            return {
              returning: () => Promise.resolve(ret),
              then: (onf: any, onr: any) => Promise.resolve(ret).then(onf, onr),
            };
          },
        }),
      }),
      _state: state,
    };
    return mockDb;
  }

  const caseId = '00000000-0000-0000-0000-000000000001';
  const propId = '00000000-0000-0000-0000-000000000002';
  const taskId = '00000000-0000-0000-0000-000000000003';

  function taskRow(status = 'requires_manual_action') {
    return { id: taskId, researchCaseId: caseId, taskType: 'geolocation', status };
  }

  function caseRow(status = 'running') {
    return {
      id: caseId,
      propertyId: propId,
      status,
      errorCount: 0,
      warningCount: 0,
      completedTaskCount: 0,
      totalTaskCount: 1,
    };
  }

  it('requestManualAction creates a record with all required fields', async () => {
    const mockDb = buildMockDb({ tasks: [taskRow()] });
    const service = new ManualActionService(mockDb);

    const dto = await service.requestManualAction(taskId, propId, {
      actionKind: 'captcha',
      instructions: 'Resuelva el CAPTCHA para consultar la partida registral',
      url: 'https://enlinea.sunarp.gob.pe',
      source: 'sunarp',
    });

    expect(dto.status).toBe('requested');
    expect(dto.researchTaskId).toBe(taskId);
    expect(dto.propertyId).toBe(propId);
    expect(dto.actionKind).toBe('captcha');
    expect(dto.instructions).toBe('Resuelva el CAPTCHA para consultar la partida registral');
    expect(dto.url).toBe('https://enlinea.sunarp.gob.pe');
    expect(dto.source).toBe('sunarp');
    expect(dto.completedAt).toBeNull();
    expect(dto.completedBy).toBeNull();
    expect(dto.result).toBeNull();
    expect(dto.requestedAt).toBeTruthy();

    expect(mockDb._state.actions.length).toBe(1);
    const row = mockDb._state.actions[0];
    expect(row.status).toBe('requested');
    expect(row.instructions).toBe('Resuelva el CAPTCHA para consultar la partida registral');
    expect(row.url).toBe('https://enlinea.sunarp.gob.pe');
    expect(row.propertyId).toBe(propId);
  });

  it('requestManualAction defaults actionKind to user_action and is idempotent per task', async () => {
    const existing = {
      id: 'ma-1',
      researchTaskId: taskId,
      propertyId: propId,
      actionKind: 'captcha',
      status: 'requested',
      instructions: 'instrucción existente',
    };
    const mockDb = buildMockDb({ actions: [existing], tasks: [taskRow()] });
    const service = new ManualActionService(mockDb);

    const returned = await service.requestManualAction(taskId, propId, {
      instructions: 'instrucción existente',
      source: 'sunarp',
    });

    expect(returned.id).toBe('ma-1');
    expect(returned.actionKind).toBe('captcha');
    expect(mockDb._state.actions.length).toBe(1);

    const fresh = await service.requestManualAction('other-task', propId, {
      instructions: 'nueva acción',
    });
    expect(fresh.actionKind).toBe('user_action');
  });

  it('listManualActions returns all actions and supports filters', async () => {
    const mockDb = buildMockDb({
      actions: [
        { id: 'ma-1', researchTaskId: taskId, propertyId: propId, status: 'requested', instructions: 'a' },
        { id: 'ma-2', researchTaskId: taskId, propertyId: propId, status: 'completed', instructions: 'b', completedAt: new Date() },
        { id: 'ma-3', researchTaskId: 't-other', propertyId: propId, status: 'requested', instructions: 'c' },
      ],
    });
    const service = new ManualActionService(mockDb);

    const all = await service.listManualActions();
    expect(all.length).toBe(3);

    const filter: ManualActionFilters = { status: 'requested' };
    const requested = await service.listManualActions(filter);
    expect(requested.length).toBe(2);
    expect(requested.every((a) => a.status === 'requested')).toBe(true);
  });

  it('completeManualAction records result and settles the research task', async () => {
    const mockDb = buildMockDb({
      actions: [
        {
          id: 'ma-1',
          researchTaskId: taskId,
          propertyId: propId,
          status: 'requested',
          actionKind: 'user_action',
          instructions: 'Llene la dirección del predio para geolocalizar',
          url: null,
          source: 'system',
        },
      ],
      tasks: [taskRow('requires_manual_action')],
      cases: [caseRow('running')],
    });
    const service = new ManualActionService(mockDb);

    const completed = await service.completeManualAction('ma-1', {
      result: { address: 'Av. Ejército 400, Yanahuara' },
      completedBy: 'analyst-01',
    });

    expect(completed.status).toBe('completed');
    expect(completed.completedBy).toBe('analyst-01');
    expect(completed.completedAt).toBeTruthy();
    expect(completed.result).toEqual({ address: 'Av. Ejército 400, Yanahuara' });

    // Result persisted with provenance into research_results
    expect(mockDb._state.results.length).toBe(1);
    const res = mockDb._state.results[0];
    expect(res.researchTaskId).toBe(taskId);
    expect(res.source).toBe('manual');
    expect(res.verification).toBe('verified');
    expect(res.confidence).toBe('high');
    expect(res.parserVersion).toBe('manual-v1');
    expect(res.dataType).toBe('geolocation');
    expect(res.data).toEqual({ address: 'Av. Ejército 400, Yanahuara' });

    // Task settled as completed with result reference
    expect(mockDb._state.tasks[0].status).toBe('completed');
    expect(mockDb._state.tasks[0].resultReference).toBe(mockDb._state.results[0].id);
    expect(mockDb._state.tasks[0].requiresManualAction).toBe(false);

    // Case progress refreshed
    expect(mockDb._state.cases[0].status).toBe('completed');

    // Audit trail recorded
    expect(mockDb._state.auditLogs.length).toBe(1);
    expect(mockDb._state.auditLogs[0].action).toBe('manual_result_entered');
    expect(mockDb._state.auditLogs[0].userId).toBe('analyst-01');
  });

  it('completeManualAction throws when the action is already resolved', async () => {
    const mockDb = buildMockDb({
      actions: [
        {
          id: 'ma-1',
          researchTaskId: taskId,
          propertyId: propId,
          status: 'completed',
          instructions: 'x',
          completedAt: new Date(),
        },
      ],
    });
    const service = new ManualActionService(mockDb);

    await expect(
      service.completeManualAction('ma-1', { result: { ok: true } }),
    ).rejects.toThrow(/already completed/);
  });

  it('completeManualAction records data but does not touch a task no longer waiting on the human', async () => {
    const mockDb = buildMockDb({
      actions: [
        {
          id: 'ma-1',
          researchTaskId: taskId,
          propertyId: propId,
          status: 'requested',
          instructions: 'x',
        },
      ],
      tasks: [taskRow('completed')],
    });
    const service = new ManualActionService(mockDb);

    const completed = await service.completeManualAction('ma-1', {
      result: { address: 'x' },
      completedBy: 'analyst-02',
    });

    expect(completed.status).toBe('completed');
    expect(mockDb._state.tasks[0].status).toBe('completed');
    expect(mockDb._state.results.length).toBe(0);
  });

  it('cancelManualAction moves a pending action to cancelled (idempotent)', async () => {
    const mockDb = buildMockDb({
      actions: [
        {
          id: 'ma-1',
          researchTaskId: taskId,
          propertyId: propId,
          status: 'requested',
          instructions: 'x',
        },
      ],
    });
    const service = new ManualActionService(mockDb);

    const cancelled = await service.cancelManualAction('ma-1', 'analyst-01');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedBy).toBe('analyst-01');

    const again = await service.cancelManualAction('ma-1');
    expect(again.status).toBe('cancelled');
  });

  it('getManualAction returns null for unknown ids', async () => {
    const mockDb = buildMockDb({});
    const service = new ManualActionService(mockDb);
    expect(await service.getManualAction('does-not-exist')).toBeNull();
  });

  describe('Orchestrator wiring', () => {
    beforeEach(() => {
      connectorRegistry.register(sunarpConnector);
    });

    it('creates a manual action when a connector requires authentication', async () => {
      const fakeSunarp: PropertyDataSource = {
        sourceId: 'sunarp',
        sourceName: 'SUNARP (fake for test)',
        async getStatus() {
          return {
            sourceId: 'sunarp',
            status: 'requires_auth',
            message: 'Requiere iniciar sesión en SUNARP',
            lastChecked: new Date(),
          };
        },
        async search() {
          return { items: [], totalFound: 0, source: 'sunarp', searchedAt: new Date() };
        },
        async getDetails() {
          return { found: false, source: 'sunarp', retrievedAt: new Date() };
        },
      };
      connectorRegistry.register(fakeSunarp);

      const mockDb = buildMockDb({
        tasks: [
          {
            id: taskId,
            researchCaseId: caseId,
            taskType: 'registry',
            status: 'pending',
          },
        ],
        cases: [caseRow('running')],
      });

      const orchestrator = new ResearchOrchestrator(mockDb);
      await orchestrator.executeTask(mockDb._state.tasks[0], propId);

      expect(mockDb._state.tasks[0].status).toBe('requires_manual_action');
      expect(mockDb._state.tasks[0].requiresManualAction).toBe(true);
      expect(mockDb._state.actions.length).toBe(1);
      const action = mockDb._state.actions[0];
      expect(action.actionKind).toBe('login');
      expect(action.source).toBe('sunarp');
      expect(action.instructions).toBe('Requiere iniciar sesión en SUNARP');

      // Restore the real stub for subsequent tests
      connectorRegistry.register(sunarpConnector);
    });
  });
});