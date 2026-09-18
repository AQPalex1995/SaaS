CREATE TYPE "public"."manual_action_kind" AS ENUM('captcha', 'login', 'payment', 'user_action', 'other');--> statement-breakpoint
CREATE TYPE "public"."manual_action_status" AS ENUM('requested', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "manual_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_task_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"action_kind" "manual_action_kind" DEFAULT 'user_action' NOT NULL,
	"status" "manual_action_status" DEFAULT 'requested' NOT NULL,
	"instructions" text NOT NULL,
	"url" text,
	"source" varchar(100),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" varchar(100),
	"result" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_actions" ADD CONSTRAINT "manual_actions_research_task_id_research_tasks_id_fk" FOREIGN KEY ("research_task_id") REFERENCES "public"."research_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_actions" ADD CONSTRAINT "manual_actions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_manual_task" ON "manual_actions" USING btree ("research_task_id");--> statement-breakpoint
CREATE INDEX "idx_manual_property" ON "manual_actions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_manual_status" ON "manual_actions" USING btree ("status");