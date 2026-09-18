import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResearchOrchestrator,
  TASK_SOURCE_MAP,
} from '../src/domain/research/orchestrator.js';
import { connectorRegistry } from '../src/connectors/registry.js';
import { allStubConnectors } from '../src/connectors/stubs/index.js';
import { ResearchService } from '../src/domain/research/service.js';
import {
  researchCases,
  researchTasks,
  researchResults,
  properties,
} from '../src/db/schema/index.js';

describe('T3.3 — Research Orchestration', () => {
  beforeEach(() => {
    // Ensure all connectors are registered
    for (const c of allStubConnectors) {
      connectorRegistry.register(c);
    }
  });

  describe('Mapping & Task Configuration', () => {
    it('correctly maps task types to external connector source IDs', () => {
      expect(TASK_SOURCE_MAP).toEqual({
        registry: 'sunarp',
        bgr: 'sunarp_bgr',
        urbanism: 'impla',
        judicial: 'cej',
      });
    });

    it('ensures connector registry has all mapped sources', () => {
      for (const [taskType, sourceId] of Object.entries(TASK_SOURCE_MAP)) {
        expect(
          connectorRegistry.has(sourceId),
          `Connector for ${taskType} (${sourceId}) must exist in registry`,
        ).toBe(true);
      }
    });
  });

  describe('Fault Isolation & Partial Execution (In-Memory DB Simulation)', () => {
    function createMockQuery(data: any[]) {
      const promise = Promise.resolve(data);
      const queryObj: any = {
        limit: vi.fn().mockImplementation((n: number) => Promise.resolve(data.slice(0, n))),
        orderBy: vi.fn().mockImplementation(() => Promise.resolve(data)),
        then: (onfulfilled: any, onrejected: any) => promise.then(onfulfilled, onrejected),
        catch: (onrejected: any) => promise.catch(onrejected),
        finally: (onfinally: any) => promise.finally(onfinally),
      };
      return queryObj;
    }

    function createMockDb(initialCase: any, initialTasks: any[], initialProperty?: any) {
      const state = {
        caseRow: { ...initialCase },
        taskRows: initialTasks.map((t) => ({ ...t })),
        propertyRow: initialProperty ?? {
          id: initialCase.propertyId,
          publicId: 'PROP-001',
          title: 'Terreno en Cayma',
          propertyType: 'terreno',
          district: 'Cayma',
          address: 'Av. Cayma 123',
          latitude: '-16.38',
          longitude: '-71.55',
          locationVerification: 'verified',
        },
        results: [] as any[],
      };

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table: any) => {
            let data: any[] = [];
            if (table === researchCases) data = [state.caseRow];
            else if (table === researchTasks) data = state.taskRows;
            else if (table === properties) data = [state.propertyRow];
            else if (table === researchResults) data = state.results;

            return {
              where: vi.fn().mockImplementation(() => createMockQuery(data)),
              limit: vi.fn().mockImplementation((n: number) => Promise.resolve(data.slice(0, n))),
              orderBy: vi.fn().mockImplementation(() => Promise.resolve(data)),
              then: (onfulfilled: any, onrejected: any) =>
                Promise.resolve(data).then(onfulfilled, onrejected),
            };
          }),
        })),

        update: vi.fn().mockImplementation((table: any) => ({
          set: vi.fn().mockImplementation((values: any) => ({
            where: vi.fn().mockImplementation(() => {
              if (table === researchCases) {
                Object.assign(state.caseRow, values);
              }
              const retVal = [{ id: 'updated-id' }];
              return {
                returning: vi.fn().mockReturnValue(Promise.resolve(retVal)),
                then: (onfulfilled: any, onrejected: any) =>
                  Promise.resolve(retVal).then(onfulfilled, onrejected),
              };
            }),
          })),
        })),

        insert: vi.fn().mockImplementation((table: any) => ({
          values: vi.fn().mockImplementation((values: any) => {
            const row = { id: `res-${state.results.length + 1}`, ...values };
            if (table === researchResults) {
              state.results.push(row);
            }
            const retVal = [row];
            return {
              returning: vi.fn().mockReturnValue(Promise.resolve(retVal)),
              then: (onfulfilled: any, onrejected: any) =>
                Promise.resolve(retVal).then(onfulfilled, onrejected),
            };
          }),
        })),

        _state: state,
      };

      return mockDb;
    }

    it('executes identity task, creates researchResults with provenance, and completes successfully', async () => {
      const caseId = '00000000-0000-0000-0000-000000000001';
      const propId = '00000000-0000-0000-0000-000000000002';

      const mockDb = createMockDb(
        {
          id: caseId,
          propertyId: propId,
          status: 'created',
          completedTaskCount: 0,
          totalTaskCount: 1,
          errorCount: 0,
          warningCount: 0,
        },
        [
          {
            id: 'task-identity',
            researchCaseId: caseId,
            taskType: 'identity',
            status: 'pending',
          },
        ],
      );

      const orchestrator = new ResearchOrchestrator(mockDb);
      const res = await orchestrator.executeTask(
        mockDb._state.taskRows[0],
        propId,
      );

      expect(res).toBeDefined();
      expect(mockDb._state.results.length).toBe(1);
      const result = mockDb._state.results[0];
      expect(result.source).toBe('system');
      expect(result.sourceUrl).toBeNull();
      expect(result.dataType).toBe('identity');
      expect(result.confidence).toBe('high');
      expect(result.verification).toBe('inferred');
      expect(result.parserVersion).toBe('identity-v1');
      expect(result.retrievedAt).toBeInstanceOf(Date);
      expect(result.rawData).toBeDefined();
      expect(result.rawData.id).toBeDefined();
      expect(result.data.publicId).toBe('PROP-001');
      expect(result.data.verifiedCoordinates).toBe(true);
    });

    it('handles down or failing source without stopping the rest of the research (partial execution)', async () => {
      const caseId = '00000000-0000-0000-0000-000000000001';
      const propId = '00000000-0000-0000-0000-000000000002';

      const tasks = [
        {
          id: 'task-failing',
          researchCaseId: caseId,
          taskType: 'identity',
          status: 'pending',
        },
        {
          id: 'task-stub',
          researchCaseId: caseId,
          taskType: 'registry',
          status: 'pending',
        },
      ];

      const mockDb = createMockDb(
        {
          id: caseId,
          propertyId: propId,
          status: 'created',
          completedTaskCount: 0,
          totalTaskCount: 2,
          errorCount: 0,
          warningCount: 0,
        },
        tasks,
      );

      const orchestrator = new ResearchOrchestrator(mockDb);

      // Force executeTask to throw for task-failing, simulating external source down / timeout
      const origExecuteTask = orchestrator.executeTask.bind(orchestrator);
      orchestrator.executeTask = vi.fn().mockImplementation(async (task, pId) => {
        if (task.id === 'task-failing') {
          throw new Error('Upstream source connection timed out (ECONNREFUSED)');
        }
        return origExecuteTask(task, pId);
      });

      // Execute entire case
      const result = await orchestrator.executeCase(caseId, { skipGeolocation: true });

      // FAULT ISOLATION VERIFIED: The orchestrator did not crash!
      expect(result).toBeDefined();
      expect(result.researchCaseId).toBe(caseId);
      // Both tasks were processed
      expect(orchestrator.executeTask).toHaveBeenCalledTimes(2);
    });

    it('skips already terminal cases (idempotent under BullMQ re-delivery)', async () => {
      const caseId = '00000000-0000-0000-0000-000000000001';
      const propId = '00000000-0000-0000-0000-000000000002';

      const mockDb = createMockDb(
        {
          id: caseId,
          propertyId: propId,
          status: 'completed', // already terminal
          completedTaskCount: 8,
          totalTaskCount: 8,
          errorCount: 0,
          warningCount: 0,
          summary: 'Caso completado anteriormente',
        },
        [],
      );

      const orchestrator = new ResearchOrchestrator(mockDb);
      const result = await orchestrator.executeCase(caseId);

      expect(result.status).toBe('completed');
      expect(result.summary).toBe('Caso completado anteriormente');
      // No updates or inserts should have been made
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('ResearchService getResults (inArray fix)', () => {
    it('returns results across multiple tasks for the research case', async () => {
      const caseId = 'case-multi-task';

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table: any) => ({
            where: vi.fn().mockImplementation(() => {
              if (table === researchTasks) {
                return Promise.resolve([
                  { id: 'task-1' },
                  { id: 'task-2' },
                ]);
              }
              if (table === researchResults) {
                return {
                  orderBy: vi.fn().mockImplementation(() =>
                    Promise.resolve([
                      {
                        id: 'res-1',
                        researchTaskId: 'task-1',
                        propertyId: 'prop-1',
                        source: 'system',
                        sourceUrl: null,
                        retrievedAt: new Date(),
                        dataType: 'identity',
                        data: { publicId: 'P1' },
                        confidence: 'high',
                        verification: 'inferred',
                        parserVersion: 'identity-v1',
                        createdAt: new Date(),
                      },
                      {
                        id: 'res-2',
                        researchTaskId: 'task-2',
                        propertyId: 'prop-1',
                        source: 'openstreetmap',
                        sourceUrl: 'https://nominatim.openstreetmap.org',
                        retrievedAt: new Date(),
                        dataType: 'geolocation',
                        data: { latitude: -16.4, longitude: -71.5 },
                        confidence: 'medium',
                        verification: 'verified',
                        parserVersion: 'osm-v1',
                        createdAt: new Date(),
                      },
                    ]),
                  ),
                };
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const service = new ResearchService(mockDb);
      const results = await service.getResults(caseId);

      expect(results.length).toBe(2);
      expect(results[0].dataType).toBe('identity');
      expect(results[1].dataType).toBe('geolocation');
      expect(results[0].researchTaskId).toBe('task-1');
      expect(results[1].researchTaskId).toBe('task-2');
    });

    it('returns empty array when case has no tasks', async () => {
      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      };

      const service = new ResearchService(mockDb);
      const results = await service.getResults('empty-case');
      expect(results).toEqual([]);
    });
  });
});
