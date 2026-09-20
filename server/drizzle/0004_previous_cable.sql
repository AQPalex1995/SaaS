ALTER TABLE "research_cases" ADD COLUMN "run_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill (RP.1 — Case/Run separation): existing cases predate the run
-- notion, so assign each a run_number per property in creation order
-- (run 1 = first investigation, run 2 = next, etc.). This must run BEFORE
-- the unique index below, otherwise (property_id, run_number)=(_,0) would
-- collide for properties with multiple historical cases.
WITH numbered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY property_id
      ORDER BY created_at, id
    ) AS rn
  FROM research_cases
)
UPDATE research_cases AS rc
SET run_number = numbered.rn
FROM numbered
WHERE rc.id = numbered.id;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_research_property_run" ON "research_cases" USING btree ("property_id","run_number");