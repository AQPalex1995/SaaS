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
export const researchStatusEnum = pgEnum('research_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
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
