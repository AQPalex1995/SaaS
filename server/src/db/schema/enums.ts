import { pgEnum } from 'drizzle-orm/pg-core';

// ── Property ────────────────────────────────────────────────
export const propertyTypeEnum = pgEnum('property_type', [
  'terreno',
  'lote',
  'casa',
  'departamento',
  'duplex',
  'agricola',
  'comercial',
  'industrial',
  'otro',
]);

export const propertyStatusEnum = pgEnum('property_status', [
  'active',
  'inactive',
  'sold',
  'reserved',
  'unknown',
]);

// ── Verification / Provenance ───────────────────────────────
export const verificationStatusEnum = pgEnum('verification_status', [
  'reported',
  'inferred',
  'verified',
  'conflicting',
  'unknown',
]);

export const confidenceLevelEnum = pgEnum('confidence_level', [
  'high',
  'medium',
  'low',
  'unknown',
]);

// ── Currency ────────────────────────────────────────────────
export const currencyEnum = pgEnum('currency', [
  'PEN',
  'USD',
  'unknown',
]);

// ── Source / Connector ──────────────────────────────────────
export const sourceTypeEnum = pgEnum('source_type', [
  'facebook_marketplace',
  'facebook_group',
  'adondevivir',
  'urbania',
  'remaju',
  'sunarp',
  'sunarp_bgr',
  'sunarp_sprl',
  'google_maps',
  'openstreetmap',
  'impla',
  'pdm',
  'pat',
  'municipality',
  'cadastre',
  'cej',
  'sbn',
  'cofopri',
  'seace',
  'manual',
  'other',
]);

export const connectorStatusEnum = pgEnum('connector_status', [
  'available',
  'unavailable',
  'maintenance',
  'rate_limited',
  'requires_auth',
  'error',
]);

// ── Research ────────────────────────────────────────────────
// ResearchCase lifecycle: created → queued → running → completed | partial | failed.
// `pending` (legacy) and `cancelled` are kept as-is; new values are appended
// to the PostgreSQL enum for a non-destructive migration (ALTER TYPE ADD VALUE).
export const researchStatusEnum = pgEnum('research_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'created',
  'queued',
  'partial',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'requires_manual_action',
  'blocked',
  'unavailable',
  'skipped',
]);

export const taskTypeEnum = pgEnum('task_type', [
  'identity',
  'geolocation',
  'registry',
  'bgr',
  'urbanism',
  'judicial',
  'market',
  'risk',
  'documentation',
  'manual_verification',
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'critical',
  'high',
  'medium',
  'low',
]);

// ── Listing ─────────────────────────────────────────────────
export const listingStatusEnum = pgEnum('listing_status', [
  'active',
  'inactive',
  'expired',
  'removed',
  'unknown',
]);

// ── Scraping ────────────────────────────────────────────────
export const scrapingJobStatusEnum = pgEnum('scraping_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

// ── Research / Manual Action ───────────────────────────────
// Generic mechanism for sources that require CAPTCHA, LOGIN, PAYMENT
// or other USER ACTION to deliver their data (Phase 3 / T3.4).
export const manualActionKindEnum = pgEnum('manual_action_kind', [
  'captcha',
  'login',
  'payment',
  'user_action',
  'other',
]);

export const manualActionStatusEnum = pgEnum('manual_action_status', [
  'requested',
  'completed',
  'cancelled',
]);

// ── Audit ───────────────────────────────────────────────────
export const auditActionEnum = pgEnum('audit_action', [
  'property_created',
  'property_updated',
  'property_deleted',
  'listing_created',
  'listing_linked',
  'research_started',
  'research_completed',
  'research_failed',
  'task_completed',
  'task_failed',
  'manual_result_entered',
  'score_changed',
  'alert_created',
  'alert_dismissed',
]);

// ── Documents ───────────────────────────────────────────────
export const documentTypeEnum = pgEnum('document_type', [
  'image',
  'pdf',
  'screenshot',
  'certificate',
  'map',
  'report',
  'raw_response',
  'other',
]);

// ── Scores / Alerts ─────────────────────────────────────────
export const alertSeverityEnum = pgEnum('alert_severity', [
  'critical',
  'warning',
  'info',
]);

export const alertStatusEnum = pgEnum('alert_status', [
  'active',
  'dismissed',
  'resolved',
]);
