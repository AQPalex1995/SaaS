import { getQueue, withRedisTimeout } from './queue.js';
import { logger } from '../logger.js';

const COMMON_OPTIONS = {
  removeOnComplete: { age: 86_400, count: 200 },
  removeOnFail: { age: 604_800, count: 500 },
} as const;

const ENQUEUE_TIMEOUT_MS = 2_000;

export interface GeocodingJobData {
  propertyId: string;
}

export interface ResearchJobData {
  propertyId: string;
  researchCaseId: string;
}

export async function enqueueGeocoding(propertyId: string): Promise<boolean> {
  const queue = getQueue('geocoding');
  if (!queue) return false;
  try {
    await withRedisTimeout(
      queue.add(
        'geocode',
        { propertyId } satisfies GeocodingJobData,
        { ...COMMON_OPTIONS, attempts: 2, backoff: { type: 'exponential' as const, delay: 5_000 } },
      ),
      ENQUEUE_TIMEOUT_MS,
    );
    logger.debug({ propertyId }, 'Geocoding job enqueued');
    return true;
  } catch (err) {
    logger.warn({ err, propertyId }, 'Failed to enqueue geocoding job');
    return false;
  }
}

export async function enqueueResearch(
  propertyId: string,
  researchCaseId: string,
): Promise<boolean> {
  const queue = getQueue('research');
  if (!queue) return false;
  try {
    await withRedisTimeout(
      queue.add(
        'process-research',
        { propertyId, researchCaseId } satisfies ResearchJobData,
        { ...COMMON_OPTIONS, attempts: 1 },
      ),
      ENQUEUE_TIMEOUT_MS,
    );
    logger.debug({ propertyId, researchCaseId }, 'Research job enqueued');
    return true;
  } catch (err) {
    logger.warn({ err, propertyId }, 'Failed to enqueue research job');
    return false;
  }
}
