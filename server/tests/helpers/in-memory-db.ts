import type { Database } from '../../src/db/connection.js';
import {
  auditLogs,
  manualActions,
  properties,
  researchCases,
  researchResults,
  researchTasks,
} from '../../src/db/schema/index.js';
import { registryProperties } from '../../src/db/schema/registry.js';

/**
 * Minimal in-memory Drizzle db for offline tests.
 * Supports the select/insert/update shapes used by the services under test.
 */

export interface InMemorySeed {
  property?: any;
  properties?: any[];
  manualActions?: any[];
  cases?: any[];
  tasks?: any[];
  results?: any[];
  auditLogs?: any[];
}

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

export function createInMemoryDb(seed: InMemorySeed = {}) {
  const now = new Date();
  const state: any = {
    properties: seed.properties
      ? seed.properties.map((p) => ({ ...p }))
      : seed.property
        ? [{ ...seed.property }]
        : [],
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
      runNumber: 1,
      status: 'created',
      completedTaskCount: 0,
      totalTaskCount: (seed.tasks ?? []).length,
      errorCount: 0,
      warningCount: 0,
      summary: null,
      ...c,
    })),
    results: [...(seed.results ?? [])].map((r) => ({ ...r })),
    manualActions: [...(seed.manualActions ?? [])].map((m) => ({ ...m })),
    auditLogs: [...(seed.auditLogs ?? [])].map((a) => ({ ...a })),
    registryProperties: [],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;
  const extra = new Map<object, any[]>();
  const tableData = (table: any): any[] => {
    if (table === properties) return state.properties;
    if (table === researchCases) return state.cases;
    if (table === researchTasks) return state.tasks;
    if (table === researchResults) return state.results;
    if (table === manualActions) return state.manualActions;
    if (table === auditLogs) return state.auditLogs;
    if (table === registryProperties) return state.registryProperties;
    if (!extra.has(table)) extra.set(table, []);
    return extra.get(table)!;
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