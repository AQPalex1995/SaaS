import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/connection.js';
import {
  properties,
  researchCases,
  researchTasks,
  researchResults,
} from '../../db/schema/index.js';
import { updateCaseProgress } from './geocoding.worker.js';
import { logger } from '../../logger.js';

export interface ResearchJobData {
  propertyId: string;
  researchCaseId: string;
}

const UNAVAILABLE_TASKS = new Set([
  'registry',
  'bgr',
  'urbanism',
  'judicial',
  'market',
  'risk',
  'documentation',
]);

async function completeIdentityTask(
  researchTaskId: string,
  propertyId: string,
): Promise<void> {
  const db = getDb();
  const propRows = await db
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  const prop = propRows[0];
  if (!prop) {
    throw new Error(`Property ${propertyId} not found for identity task`);
  }

  const [result] = await db
    .insert(researchResults)
    .values({
      researchTaskId,
      propertyId,
      source: 'system',
      dataType: 'identity',
      data: {
        publicId: prop.publicId,
        title: prop.title,
        propertyType: prop.propertyType ?? 'otro',
        district: prop.district,
        verifiedCoordinates: !!(prop.latitude && prop.longitude),
      },
      confidence: 'high',
      verification: 'inferred',
      parserVersion: 'identity-v1',
    })
    .returning({ id: researchResults.id });

  await db
    .update(researchTasks)
    .set({
      status: 'completed',
      resultReference: result.id,
      startedAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(researchTasks.id, researchTaskId));
}

export async function processResearchJob(job: Job<ResearchJobData>): Promise<void> {
  const { propertyId, researchCaseId } = job.data ?? {};
  if (!propertyId || !researchCaseId) {
    throw new Error('Job research incompleto (propertyId/researchCaseId)');
  }

  const db = getDb();

  const caseRows = await db
    .select({ id: researchCases.id, status: researchCases.status })
    .from(researchCases)
    .where(eq(researchCases.id, researchCaseId))
    .limit(1);
  if (caseRows.length === 0) {
    logger.warn({ researchCaseId }, 'Research case no encontrada, abortando');
    return;
  }

  await db
    .update(researchCases)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(researchCases.id, researchCaseId));

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.researchCaseId, researchCaseId));

  for (const task of tasks) {
    if (task.taskType === 'geolocation') {
      // Geolocation runs in its own queue consumer. The geocoding job was
      // already enqueued when the research case was created — re-enqueuing
      // here would duplicate locations/geometries, so we skip it.
      continue;
    }
    if (task.taskType === 'identity') {
      await completeIdentityTask(task.id, propertyId);
      continue;
    }
    if (UNAVAILABLE_TASKS.has(task.taskType)) {
      // Connector-backed tasks whose external source is still a stub.
      // Honest, non-simulated outcome: mark as unavailable.
      await db
        .update(researchTasks)
        .set({
          status: 'unavailable',
          error: 'Conector externo no implementado (stub)',
          updatedAt: new Date(),
        })
        .where(eq(researchTasks.id, task.id));
    }
  }

  await updateCaseProgress(db, researchCaseId);
  logger.info({ propertyId, researchCaseId }, 'Research job procesado');
}