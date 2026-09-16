import { getDb } from '../../db/connection.js';
import { auditLogs } from '../../db/schema/index.js';
import { logger } from '../../logger.js';

/**
 * Audit Service — Records important system events.
 */
export class AuditService {
  private db = getDb();

  async log(params: {
    action: typeof auditLogs.$inferInsert['action'];
    entityType: string;
    entityId?: string;
    propertyId?: string;
    researchCaseId?: string;
    userId?: string;
    requestId?: string;
    jobId?: string;
    sourceId?: string;
    previousData?: unknown;
    newData?: unknown;
    description?: string;
  }): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        propertyId: params.propertyId,
        researchCaseId: params.researchCaseId,
        userId: params.userId,
        requestId: params.requestId,
        jobId: params.jobId,
        sourceId: params.sourceId,
        previousData: params.previousData,
        newData: params.newData,
        description: params.description,
      });
    } catch (err) {
      // Audit logging should never crash the application
      logger.error({ err, action: params.action }, 'Failed to write audit log');
    }
  }
}
