import { researchResults } from '../../db/schema/index.js';
import { getDb, type Database } from '../../db/connection.js';

export type ResultConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type ResultVerification =
  | 'reported'
  | 'inferred'
  | 'verified'
  | 'conflicting'
  | 'unknown';

/**
 * Input for persisting one `research_results` row with full provenance
 * discipline (Phase 3 / T3.5).
 *
 * Every result MUST record: source, source_url, retrieved_at, confidence,
 * verification_status, raw_data, normalized_data (data) and parser_version.
 * The helper normalizes the optional ones so no producer can forget them.
 */
export interface RecordResultInput {
  researchTaskId: string;
  propertyId: string;

  /** Connector/source identifier (e.g. 'openstreetmap', 'manual', 'system'). */
  source: string;
  sourceUrl?: string | null;

  /** When the data was actually retrieved/entered (defaults to now). */
  retrievedAt?: Date;

  /** Normalized data produced by the parser. */
  data?: Record<string, unknown> | null;
  /** Raw payload as returned by the source (null when none exists). */
  rawData?: Record<string, unknown> | null;

  confidence?: ResultConfidence;
  verification?: ResultVerification;
  parserVersion?: string;
  dataType?: string;

  metadata?: Record<string, unknown> | null;
}

/**
 * Single code path used by every research_results producer (orchestrator,
 * geocoding worker, manual action service) to guarantee provenance fields are
 * always persisted. Returns the id of the inserted result.
 */
export async function recordResearchResult(
  db: Database = getDb(),
  input: RecordResultInput,
): Promise<string> {
  const now = new Date();

  const [row] = await db
    .insert(researchResults)
    .values({
      researchTaskId: input.researchTaskId,
      propertyId: input.propertyId,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      retrievedAt: input.retrievedAt ?? now,
      dataType: input.dataType ?? 'unknown',
      data: input.data ?? {},
      rawData: input.rawData ?? null,
      confidence: input.confidence ?? 'unknown',
      verification: input.verification ?? 'reported',
      parserVersion: input.parserVersion ?? 'v1',
      metadata: input.metadata ?? null,
    })
    .returning({ id: researchResults.id });

  return row.id;
}