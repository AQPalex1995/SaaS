import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/domain/monitoring/monitoring.service.js';
import { createInMemoryDb } from './helpers/in-memory-db.js';

const dayMs = 24 * 3_600_000;

function at(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * dayMs);
}

describe('T4.9 — MonitoringService', () => {
  it('agrega el ciclo manual: estados, stale pending y promedio de completado', async () => {
    const now = new Date();
    const { db } = createInMemoryDb({
      manualActions: [
        { id: 'ma-a', status: 'requested', requestedAt: at(1) },
        { id: 'ma-b', status: 'requested', requestedAt: at(8) },
        { id: 'ma-c', status: 'completed', requestedAt: at(2), completedAt: at(2 - 20 / 24) },
        { id: 'ma-d', status: 'completed', requestedAt: at(3), completedAt: at(3 - 20 / 24) },
        { id: 'ma-e', status: 'cancelled', requestedAt: at(5) },
      ],
    });

    const summary = await new MonitoringService(db).getOperationsSummary(now);

    expect(summary.manualCycle).toMatchObject({ total: 5, requested: 2, completed: 2, cancelled: 1, stalePending: 1 });
    expect(summary.manualCycle.avgCompletionHours).toBeCloseTo(20, 5);
    expect(summary.stuck.items.some((i) => i.id === 'ma-b' && i.kind === 'stale_pending_action')).toBe(true);
  });

  it('reporta el pipeline judicial: tareas por estado y resultados por fuente/parser', async () => {
    const { db } = createInMemoryDb({
      tasks: [
        { id: 'task-j1', taskType: 'judicial', status: 'completed' },
        { id: 'task-j2', taskType: 'judicial', status: 'requires_manual_action' },
        { id: 'task-j3', taskType: 'judicial', status: 'pending' },
        { id: 'task-reg', taskType: 'registry', status: 'completed' },
      ],
      results: [
        { id: 'r1', dataType: 'judicial', source: 'remaju', parserVersion: 'remaju-research-v1' },
        { id: 'r2', dataType: 'judicial', source: 'manual', parserVersion: 'manual-v1' },
        { id: 'r3', dataType: 'judicial', source: 'manual', parserVersion: 'manual-v1' },
        { id: 'r4', dataType: 'registry', source: 'sunarp', parserVersion: 'registry-v1' },
      ],
    });

    const summary = await new MonitoringService(db).getOperationsSummary(new Date());

    expect(summary.judicialPipeline.tasks).toMatchObject({
      total: 3,
      completed: 1,
      requiresManualAction: 1,
      pending: 1,
    });
    expect(summary.judicialPipeline.resultsBySource).toEqual({ remaju: 1, manual: 2 });
    expect(summary.judicialPipeline.resultsByParser).toEqual({
      'remaju-research-v1': 1,
      'manual-v1': 2,
    });
  });

  it('detecta tareas huérfanas requires_manual_action sin acción pendiente', async () => {
    const now = new Date();
    const { db } = createInMemoryDb({
      tasks: [
        { id: 'task-orphan', taskType: 'judicial', status: 'requires_manual_action', updatedAt: at(8) },
        { id: 'task-ok', taskType: 'judicial', status: 'requires_manual_action', updatedAt: at(1) },
      ],
      manualActions: [
        // La acción de task-orphan fue cancelada → queda sin resolución.
        { id: 'ma-orphan', researchTaskId: 'task-orphan', status: 'cancelled', requestedAt: at(8) },
        { id: 'ma-ok', researchTaskId: 'task-ok', status: 'requested', requestedAt: at(1) },
      ],
    });

    const summary = await new MonitoringService(db).getOperationsSummary(now);

    const orphans = summary.stuck.items.filter((i) => i.kind === 'orphan_task');
    expect(orphans.map((o) => o.id)).toEqual(['task-orphan']);
    expect(summary.stuck.total).toBe(1);
  });

  it('getQueueStatus usa el reporter inyectado y degrada cuando Redis no responde', async () => {
    const { db } = createInMemoryDb();
    const service = new MonitoringService(db);

    const connected = await service.getQueueStatus(async () => ({
      waiting: 2,
      active: 1,
      delayed: 0,
      completed: 10,
      failed: 0,
      paused: 0,
    }));
    expect(connected.connected).toBe(true);
    expect(connected.queues.research).toMatchObject({ waiting: 2, active: 1, completed: 10 });

    const degraded = await service.getQueueStatus(async () => null);
    expect(degraded.connected).toBe(false);
  });
});