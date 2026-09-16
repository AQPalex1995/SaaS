CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('property_created', 'property_updated', 'property_deleted', 'listing_created', 'listing_linked', 'research_started', 'research_completed', 'research_failed', 'task_completed', 'task_failed', 'manual_result_entered', 'score_changed', 'alert_created', 'alert_dismissed');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('available', 'unavailable', 'maintenance', 'rate_limited', 'requires_auth', 'error');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('PEN', 'USD', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('image', 'pdf', 'screenshot', 'certificate', 'map', 'report', 'raw_response', 'other');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'inactive', 'expired', 'removed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('active', 'inactive', 'sold', 'reserved', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('terreno', 'lote', 'casa', 'departamento', 'duplex', 'agricola', 'comercial', 'industrial', 'otro');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scraping_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('facebook_marketplace', 'facebook_group', 'adondevivir', 'urbania', 'remaju', 'sunarp', 'sunarp_bgr', 'sunarp_sprl', 'google_maps', 'openstreetmap', 'impla', 'pdm', 'pat', 'municipality', 'cadastre', 'cej', 'sbn', 'cofopri', 'seace', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'running', 'completed', 'failed', 'requires_manual_action', 'blocked', 'unavailable', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('identity', 'geolocation', 'registry', 'bgr', 'urbanism', 'judicial', 'market', 'risk', 'documentation', 'manual_verification');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('reported', 'inferred', 'verified', 'conflicting', 'unknown');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"user_id" varchar(100),
	"request_id" varchar(100),
	"job_id" varchar(100),
	"research_case_id" uuid,
	"property_id" uuid,
	"source_id" varchar(100),
	"previous_data" jsonb,
	"new_data" jsonb,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"document_type" "document_type" DEFAULT 'other',
	"file_name" varchar(300),
	"mime_type" varchar(100),
	"size_bytes" integer,
	"storage_path" text,
	"storage_url" text,
	"checksum" varchar(64),
	"source" varchar(100),
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" varchar(500),
	"link_type" varchar(100),
	"source" varchar(100),
	"description" text,
	"last_checked_at" timestamp with time zone,
	"is_accessible" varchar(10) DEFAULT 'unknown',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "judicial_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"case_number" varchar(100),
	"court" varchar(200),
	"case_type" varchar(100),
	"subject" text,
	"status" varchar(100),
	"filing_date" date,
	"parties" text,
	"source" varchar(100) DEFAULT 'cej' NOT NULL,
	"source_url" text,
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "judicial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judicial_case_id" uuid NOT NULL,
	"event_date" date,
	"event_type" varchar(100),
	"description" text,
	"resolution" text,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"comparable_title" varchar(500),
	"comparable_url" text,
	"comparable_price" numeric(15, 2),
	"comparable_currency" "currency" DEFAULT 'unknown',
	"comparable_area_m2" numeric(12, 2),
	"comparable_district" varchar(100),
	"distance_meters" numeric(10, 2),
	"price_per_m2" numeric(12, 2),
	"similarity" numeric(5, 4),
	"source" varchar(100) NOT NULL,
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"estimated_price" numeric(15, 2),
	"currency" "currency" DEFAULT 'unknown',
	"price_per_m2" numeric(12, 2),
	"estimation_type" varchar(50),
	"confidence" "confidence_level" DEFAULT 'unknown',
	"comparables_used" jsonb,
	"source" varchar(100) NOT NULL,
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(20) NOT NULL,
	"title" varchar(500),
	"description" text,
	"property_type" "property_type" DEFAULT 'otro',
	"status" "property_status" DEFAULT 'active',
	"price" numeric(15, 2),
	"currency" "currency" DEFAULT 'unknown',
	"price_source" varchar(100),
	"price_confidence" "confidence_level" DEFAULT 'unknown',
	"price_verification" "verification_status" DEFAULT 'reported',
	"area_m2" numeric(12, 2),
	"area_source" varchar(100),
	"area_confidence" "confidence_level" DEFAULT 'unknown',
	"area_verification" "verification_status" DEFAULT 'reported',
	"address" varchar(500),
	"district" varchar(100),
	"province" varchar(100) DEFAULT 'Arequipa',
	"department" varchar(100) DEFAULT 'Arequipa',
	"location_source" varchar(100),
	"location_confidence" "confidence_level" DEFAULT 'unknown',
	"location_verification" "verification_status" DEFAULT 'reported',
	"latitude" numeric(12, 8),
	"longitude" numeric(12, 8),
	"geom_point" geometry(Point, 4326),
	"geom_polygon" geometry(Polygon, 4326),
	"listing_count" integer DEFAULT 0,
	"primary_listing_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"alert_type" varchar(100) NOT NULL,
	"severity" "alert_severity" DEFAULT 'info',
	"status" "alert_status" DEFAULT 'active',
	"title" varchar(300) NOT NULL,
	"description" text,
	"source" varchar(100),
	"data" jsonb,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_geometries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"geom_point" geometry(Point, 4326),
	"geom_polygon" geometry(Polygon, 4326),
	"geom_type" varchar(30),
	"source" varchar(100) NOT NULL,
	"source_url" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"retrieved_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"source_type" "source_type" NOT NULL,
	"external_id" varchar(255),
	"source_url" text,
	"title" varchar(500),
	"description" text,
	"price" numeric(15, 2),
	"currency" "currency" DEFAULT 'unknown',
	"area_m2" numeric(12, 2),
	"address" varchar(500),
	"district" varchar(100),
	"latitude" numeric(12, 8),
	"longitude" numeric(12, 8),
	"phone" varchar(20),
	"image_url" text,
	"published_at" timestamp with time zone,
	"scraped_at" timestamp with time zone DEFAULT now(),
	"status" "listing_status" DEFAULT 'active',
	"content_hash" varchar(64),
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"address" varchar(500),
	"district" varchar(100),
	"province" varchar(100),
	"department" varchar(100),
	"postal_code" varchar(10),
	"reference" text,
	"latitude" numeric(12, 8),
	"longitude" numeric(12, 8),
	"source" varchar(100) NOT NULL,
	"source_url" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"retrieved_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"score_type" varchar(100) NOT NULL,
	"score_value" numeric(8, 4),
	"max_value" numeric(8, 4) DEFAULT '100',
	"label" varchar(100),
	"description" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"factors" jsonb,
	"calculated_at" timestamp with time zone DEFAULT now(),
	"algorithm" varchar(50),
	"version" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"base_url" text,
	"status" "connector_status" DEFAULT 'unavailable',
	"is_enabled" boolean DEFAULT false,
	"requires_auth" boolean DEFAULT false,
	"requires_manual_action" boolean DEFAULT false,
	"config" jsonb,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_sources_source_type_unique" UNIQUE("source_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registry_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_property_id" uuid NOT NULL,
	"charge_type" varchar(100),
	"description" text,
	"amount" numeric(15, 2),
	"currency" varchar(3),
	"creditor" varchar(300),
	"registered_date" date,
	"is_active" varchar(10) DEFAULT 'unknown',
	"source" varchar(100) DEFAULT 'sunarp' NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registry_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_property_id" uuid NOT NULL,
	"owner_name" varchar(300),
	"owner_type" varchar(50),
	"document_type" varchar(20),
	"document_number" varchar(20),
	"ownership_percentage" numeric(5, 2),
	"registered_date" date,
	"source" varchar(100) DEFAULT 'sunarp' NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registry_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"registry_number" varchar(50),
	"registry_office" varchar(100),
	"registry_zone" varchar(100),
	"registered_area" numeric(12, 2),
	"registered_address" text,
	"registered_district" varchar(100),
	"source" varchar(100) DEFAULT 'sunarp' NOT NULL,
	"source_url" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registry_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_property_id" uuid NOT NULL,
	"title_number" varchar(50),
	"title_date" date,
	"title_type" varchar(100),
	"notary" varchar(200),
	"description" text,
	"source" varchar(100) DEFAULT 'sunarp' NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "research_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"error_count" integer DEFAULT 0,
	"warning_count" integer DEFAULT 0,
	"completed_task_count" integer DEFAULT 0,
	"total_task_count" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_task_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"source" varchar(100) NOT NULL,
	"source_url" text,
	"retrieved_at" timestamp with time zone DEFAULT now(),
	"data_type" varchar(100),
	"data" jsonb,
	"raw_data" jsonb,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"parser_version" varchar(20),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_case_id" uuid NOT NULL,
	"task_type" "task_type" NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium',
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"result_reference" uuid,
	"requires_manual_action" boolean DEFAULT false,
	"manual_action_description" text,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scraping_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"source_type" "source_type" NOT NULL,
	"error_type" varchar(100),
	"message" text,
	"url" text,
	"stack_trace" text,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scraping_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" NOT NULL,
	"job_name" varchar(200),
	"config" jsonb,
	"cron_expression" varchar(50),
	"status" "scraping_job_status" DEFAULT 'pending',
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scraping_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"source_type" "source_type" NOT NULL,
	"status" "scraping_job_status" DEFAULT 'running',
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"items_found" integer DEFAULT 0,
	"items_inserted" integer DEFAULT 0,
	"items_updated" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"summary" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "urban_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"max_height" numeric(8, 2),
	"max_floors" varchar(20),
	"max_buildable_area" numeric(5, 2),
	"min_free_area" numeric(5, 2),
	"setback_front" numeric(8, 2),
	"setback_side" numeric(8, 2),
	"setback_rear" numeric(8, 2),
	"density" varchar(100),
	"compatible_uses" text,
	"observations" text,
	"source" varchar(100) NOT NULL,
	"source_url" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "urban_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"zone_name" varchar(200),
	"zone_code" varchar(50),
	"zone_type" varchar(100),
	"land_use" varchar(200),
	"description" text,
	"source" varchar(100) NOT NULL,
	"source_url" text,
	"confidence" "confidence_level" DEFAULT 'unknown',
	"verification" "verification_status" DEFAULT 'reported',
	"retrieved_at" timestamp with time zone,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"display_name" varchar(200),
	"email" varchar(255),
	"role" varchar(50) DEFAULT 'user',
	"is_active" varchar(5) DEFAULT 'true',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_links" ADD CONSTRAINT "external_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "judicial_cases" ADD CONSTRAINT "judicial_cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "judicial_events" ADD CONSTRAINT "judicial_events_judicial_case_id_judicial_cases_id_fk" FOREIGN KEY ("judicial_case_id") REFERENCES "public"."judicial_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_comparables" ADD CONSTRAINT "market_comparables_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_alerts" ADD CONSTRAINT "property_alerts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_geometries" ADD CONSTRAINT "property_geometries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_locations" ADD CONSTRAINT "property_locations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_scores" ADD CONSTRAINT "property_scores_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registry_charges" ADD CONSTRAINT "registry_charges_registry_property_id_registry_properties_id_fk" FOREIGN KEY ("registry_property_id") REFERENCES "public"."registry_properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registry_owners" ADD CONSTRAINT "registry_owners_registry_property_id_registry_properties_id_fk" FOREIGN KEY ("registry_property_id") REFERENCES "public"."registry_properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registry_properties" ADD CONSTRAINT "registry_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registry_titles" ADD CONSTRAINT "registry_titles_registry_property_id_registry_properties_id_fk" FOREIGN KEY ("registry_property_id") REFERENCES "public"."registry_properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_cases" ADD CONSTRAINT "research_cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_results" ADD CONSTRAINT "research_results_research_task_id_research_tasks_id_fk" FOREIGN KEY ("research_task_id") REFERENCES "public"."research_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_results" ADD CONSTRAINT "research_results_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_research_case_id_research_cases_id_fk" FOREIGN KEY ("research_case_id") REFERENCES "public"."research_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scraping_errors" ADD CONSTRAINT "scraping_errors_run_id_scraping_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scraping_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scraping_runs" ADD CONSTRAINT "scraping_runs_job_id_scraping_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "urban_parameters" ADD CONSTRAINT "urban_parameters_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "urban_zones" ADD CONSTRAINT "urban_zones_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_property" ON "audit_logs" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_property" ON "documents" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_type" ON "documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ext_links_property" ON "external_links" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_judicial_property" ON "judicial_cases" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_judicial_case_number" ON "judicial_cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_judicial_events_case" ON "judicial_events" USING btree ("judicial_case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_comp_property" ON "market_comparables" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_prices_property" ON "market_prices" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_public_id" ON "properties" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_district" ON "properties" USING btree ("district");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_type" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_status" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_created" ON "properties" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alerts_property" ON "property_alerts" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alerts_severity" ON "property_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alerts_status" ON "property_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_geometries_property" ON "property_geometries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_property" ON "property_listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_source" ON "property_listings" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_external" ON "property_listings" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_hash" ON "property_listings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_scraped" ON "property_listings" USING btree ("scraped_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_locations_property" ON "property_locations" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scores_property" ON "property_scores" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scores_type" ON "property_scores" USING btree ("score_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_charges_registry" ON "registry_charges" USING btree ("registry_property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_owners_registry" ON "registry_owners" USING btree ("registry_property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_registry_property" ON "registry_properties" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_registry_number" ON "registry_properties" USING btree ("registry_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_titles_registry" ON "registry_titles" USING btree ("registry_property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_research_property" ON "research_cases" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_research_status" ON "research_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_results_task" ON "research_results" USING btree ("research_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_results_property" ON "research_results" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_results_source" ON "research_results" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_research" ON "research_tasks" USING btree ("research_case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_type" ON "research_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "research_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_errors_run" ON "scraping_errors" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_jobs_source" ON "scraping_jobs" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_jobs_status" ON "scraping_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_runs_job" ON "scraping_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_runs_source" ON "scraping_runs" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scraping_runs_started" ON "scraping_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_urban_params_property" ON "urban_parameters" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_urban_zones_property" ON "urban_zones" USING btree ("property_id");