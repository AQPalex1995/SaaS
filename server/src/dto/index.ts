/**
 * Land Intelligence — Frontend DTOs (Data Transfer Objects)
 *
 * These types define the API contract between frontend and backend.
 * The frontend MUST NOT depend on internal database structures.
 */

// ── Property ────────────────────────────────────────────────

export interface PropertySummary {
  id: string;
  publicId: string;
  title: string | null;
  propertyType: string;
  status: string;
  price: string | null;
  currency: string;
  areaM2: string | null;
  district: string | null;
  province: string | null;
  department: string | null;
  latitude: string | null;
  longitude: string | null;
  listingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDetail extends PropertySummary {
  description: string | null;
  address: string | null;
  priceSource: string | null;
  priceConfidence: string;
  priceVerification: string;
  areaSource: string | null;
  areaConfidence: string;
  areaVerification: string;
  locationSource: string | null;
  locationConfidence: string;
  locationVerification: string;
  metadata: Record<string, unknown> | null;
}

// ── Listings ────────────────────────────────────────────────

export interface PropertyListing {
  id: string;
  propertyId: string | null;
  sourceType: string;
  externalId: string | null;
  sourceUrl: string | null;
  title: string | null;
  description: string | null;
  price: string | null;
  currency: string;
  areaM2: string | null;
  district: string | null;
  phone: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  scrapedAt: string | null;
  status: string;
  contentHash: string | null;
}

// ── Research ────────────────────────────────────────────────

export interface ResearchCaseDTO {
  id: string;
  propertyId: string;
  runNumber: number;
  status: string;
  summary: string | null;
  errorCount: number;
  warningCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTaskDTO {
  id: string;
  researchCaseId: string;
  taskType: string;
  status: string;
  priority: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  requiresManualAction: boolean;
  manualActionDescription: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchResultDTO {
  id: string;
  researchTaskId: string;
  propertyId: string;
  source: string;
  sourceUrl: string | null;
  retrievedAt: string | null;
  dataType: string | null;
  data: Record<string, unknown> | null;
  rawData: Record<string, unknown> | null;
  confidence: string;
  verification: string;
  parserVersion: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ManualActionDTO {
  id: string;
  researchTaskId: string;
  propertyId: string;
  actionKind: string;
  status: string;
  instructions: string;
  url: string | null;
  source: string | null;
  requestedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ── Research History (RP.3) ────────────────────────────────
//
// El historial de un predio distingue tres niveles (docs/RESEARCH_GOVERNANCE.md
// §4): PROPERTY (el predio), RESEARCH_CASE (una investigación sobre él) y
// RESEARCH_RUN (una ejecución de esa investigación). Las ejecuciones se derivan
// de `run_number` sobre `research_cases` (ADR-007: no hay tabla
// `research_runs` todavía — DECISION REQUIRED).

/** Una ejecución (run) de investigación en el historial de un predio. */
export interface ResearchRunDTO {
  runNumber: number;
  caseId: string;
  status: string;
  summary: string | null;
  errorCount: number;
  warningCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Cambio material detectado entre una ejecución y la anterior (mismo run). */
export interface ResearchChangeDTO {
  taskType: string;
  source: string;
  change: 'added' | 'removed' | 'edited' | 'unchanged';
  /** Claves de primer nivel de `data` cuyo valor cambió (solo `edited`). */
  fieldsChanged: string[];
  /** Momento en que se obtuvo la versión nueva (retrievedAt de la fuente). */
  changedAt: string | null;
}

export interface ResearchHistoryTaskDTO {
  taskType: string;
  status: string;
  requiresManualAction: boolean;
}

export interface ResearchHistoryResultDTO {
  researchTaskId: string;
  taskType: string;
  source: string;
  dataType: string | null;
  retrievedAt: string | null;
  confidence: string;
  verification: string;
  parserVersion: string | null;
}

/** Un caso de investigación dentro del historial (con sus tareas/resultados). */
export interface ResearchCaseHistoryDTO extends ResearchRunDTO {
  tasks: ResearchHistoryTaskDTO[];
  results: ResearchHistoryResultDTO[];
  /** Diferencias vs. la ejecución anterior del mismo predio (run-1). */
  changes: ResearchChangeDTO[];
  /** true si esta ejecución introdujo (o perdió) información vs. la previa. */
  updated: boolean;
}

/**
 * Historial completo de un predio: PROPERTY + todos sus
 * RESEARCH_CASES / RESEARCH_RUNs, ordenados cronológicamente.
 */
export interface ResearchHistoryDTO {
  property: PropertySummary;
  /** Ejecuciones ordenadas por runNumber (1, 2, 3…). */
  runs: ResearchRunDTO[];
  /** Casos con detalle (tareas, resultados y cambios por ejecución). */
  cases: ResearchCaseHistoryDTO[];
}

// ── Scores & Alerts ─────────────────────────────────────────

export interface PropertyScoreDTO {
  id: string;
  propertyId: string;
  scoreType: string;
  scoreValue: string | null;
  maxValue: string | null;
  label: string | null;
  description: string | null;
  confidence: string;
  calculatedAt: string | null;
}

export interface PropertyAlertDTO {
  id: string;
  propertyId: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  source: string | null;
  createdAt: string;
}

// ── Source Status ────────────────────────────────────────────

export interface SourceStatus {
  sourceType: string;
  name: string;
  status: string;
  isEnabled: boolean;
  requiresAuth: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

// ── API Response Wrappers ───────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface NotImplementedResponse {
  status: 'not_implemented';
  message: string;
  plannedFor: string;
}
