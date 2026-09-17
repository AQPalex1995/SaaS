import type { Job } from 'bullmq';
import { ResearchOrchestrator } from '../../domain/research/orchestrator.js';
import { logger } from '../../logger.js';

export interface ResearchJobData {
  propertyId: string;
  researchCaseId: string;
}

export async function processResearchJob(job: Job<ResearchJobData>): Promise<void> {
  const { propertyId, researchCaseId } = job.data ?? {};
  if (!propertyId || !researchCaseId) {
    throw new Error('Job research incompleto (propertyId/researchCaseId)');
  }

  const orchestrator = new ResearchOrchestrator();
  const result = await orchestrator.executeCase(researchCaseId, {
    skipGeolocation: true,
  });

  logger.info(
    {
      researchCaseId,
      propertyId,
      status: result.status,
      completedTasks: result.completedTasks,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
    },
    'Research job procesado por ResearchOrchestrator',
  );
}