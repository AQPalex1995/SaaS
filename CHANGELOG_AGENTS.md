# AGENT CHANGELOG

## 2026-09-16 — OpenCode

Completed:
- Phase 2.5
- End-to-end validation

Important finding:
- BullMQ worker must not use commandTimeout because blocking
  commands caused polling issues.

Important rule:
- Do not enqueue geocoding for properties that already have
  valid coordinates.

Next:
- Phase 3 / T3.1

## 2026-09-16 — OpenCode — Governance Baseline

Completed:
- Added CHECKPOINT RULES + governance sections to AGENTS.md
  (milestone tracking, decision gates, autonomous execution
  rules, project state tracking, docs synchronization).
- Created PROJECT_EXECUTION_PLAN.md (16-phase roadmap, VERSION 1.0).
- Created PROJECT_STATUS.md (live project state).
- Created CHANGELOG_AGENTS.md (agent session log).
- Updated docs/CLOUD.md, docs/CI-CD.md, docs/COST_CONTROL.md
  with decision-gate references.

Verified:
- Tests 40/40
- Typecheck server + root
- Server build

Blockers:
- GIT NOT INSTALLED on this machine and no .git repo exists:
  the checkpoint git commit could not be created. Required to
  enable the autonomous workflow's commit step.

Next:
- Phase 3 / T3.1 (ResearchCase lifecycle)

## 2026-09-17 — OpenCode — Phase 3 / T3.1 (ResearchCase lifecycle)

Completed:
- Extended `research_status` enum non-destructively (ADD VALUE) with
  `created`, `queued`, `partial`; new cases default to `created`;
  legacy `pending` kept for old rows.
- Added `server/src/domain/research/lifecycle.ts`: valid transition
  table, `assertCaseTransition()`, race-safe `transitionCase()`
  (conditional UPDATE + terminal immutability) and moved
  `updateCaseProgress()` here.
- Lifecycle wired end-to-end: `created` (service) → `queued` (routes
  after enqueue) → `running`+startedAt (worker) →
  `completed | partial | failed` with completedAt + summary.
- Idempotency: research worker skips cases already in a terminal
  state (safe under BullMQ re-delivery).
- Counters: `errorCount` = failed tasks; `warningCount` =
  requires_manual_action + blocked + unavailable.
- DTO `ResearchCase` now exposes `updatedAt`.
- Migrations: `0001_research_lifecycle_enums.sql` +
  `0002_research_lifecycle_default.sql`.

Important finding:
- PostgreSQL 16 forbids USING a new enum value in the same
  transaction that added it, and drizzle's `migrate()` runs ALL
  pending migration files in ONE transaction. The enum ADD VALUE and
  the `SET DEFAULT 'created'` had to be applied as two separate
  migrations in two separate `db:migrate` runs.
- `drizzle-kit generate` is currently broken on this machine under
  Node v26.4.0 (jiti cannot resolve `./x.js` → `x.ts`); the two
  migrations + snapshots + journal entries were authored manually in
  the existing v7 format.

Verified:
- Tests 44/44 (4 new lifecycle transition tests; +4).
- Typecheck server + root; server build.
- Migration applied and verified in PostgreSQL (enum range, default,
  legacy rows intact, 3 rows in `drizzle.__drizzle_migrations`).
- Live smoke test: POST research → `queued` with `updatedAt`, then
  `completed` (identity completed, geolocation requires_manual_action,
  6 stubs unavailable, errorCount 0, warningCount 7, 8/8 tasks).

Toolchain fix:
- `drizzle-kit` upgraded `^0.28.0` → `^0.31.10` (its embedded loader
  `@esbuild-kit/esm-loader` is broken under Node v26.4.0; 0.31.x ships
  `tsx` and loads the TS schema fine). `npm run db:generate` verified
  with "No schema changes, nothing to migrate".
- Migration snapshot chain (`prevId`/`id`) aligned for the two hand-made
  migrations (0000 → 0001 → 0002) and validated by drizzle-kit 0.31.10.

Next:
- Phase 3 / T3.2 (ResearchTask lifecycle)

## 2026-09-17 — OpenCode — Phase 3 / T3.2 (ResearchTask lifecycle)

Completed:
- Added `server/src/domain/research/task-lifecycle.ts`: `TASK_TRANSITIONS`
  table (8 states), `assertTaskTransition()`, race-safe `transitionTask()`
  (conditional UPDATE + immutable-state protection), and TASK_TERMINAL /
  TASK_SETTLED / TASK_DONE / TASK_WARNING sets.
- Semantics verified/hardened: `completed` and `skipped` are **immutable**;
  `failed`, `blocked`, `unavailable`, `requires_manual_action` are
  **retryable** (back to pending/running → clears completedAt, re-opens
  startedAt when applicable, +1 `retryCount` up to `maxRetries`).
- Automation centralized: `startedAt` on `running` (or on reaching a final
  state without passing `running`); `completedAt` when automated work ends
  (NEVER on `requires_manual_action`); `completed` clears error +
  requiresManualAction; `requires_manual_action` auto-sets the flag.
- Refactored `lifecycle.ts`: `updateCaseProgress()` now uses
  `isTaskSettled()`/`TASK_WARNING` from task-lifecycle.ts (single source of
  truth; case behavior unchanged).
- Migrated workers off hand-written status writes:
  - `research.worker.ts`: identity → `completed` via transitionTask with
    `resultReference`; connector stubs → `unavailable`.
  - `geocoding.worker.ts`: `markGeolocationTask` → transitionTask
    (completed/failed/requires_manual_action/skipped).
- DTO `ResearchTaskDTO` now exposes `maxRetries` and `updatedAt`
  (`server/src/dto/index.ts`, `service.ts` `toTaskDTO`).
- No DB migration needed: task_status enum already covered all 8 states.
- Bumped stale test counts in docs (44 → 50).

Important finding (environment):
- PostgreSQL (5433), Redis (6380), API (3001) and Scout (8787) were ALL
  stopped during this session and the Docker daemon was not running, so the
  live smoke test was NOT repeated. Behavior equivalence with the previous
  direct updates was validated by inspection + unit coverage (6 new tests).
  This is NOT a code blocker: no schema change was introduced.

Verified:
- Tests 50/50 (6 new in `server/tests/task-lifecycle.test.ts`).
- Typecheck server + root; server build.

Next:
- Phase 3 / T3.3 (Research orchestration)

## 2026-09-17 — Antigravity — Phase 3 / T3.3 (Research orchestration)

Completed:
- Built full research orchestration flow: `PROPERTY → ResearchCase → ResearchTasks → BullMQ → Workers → ResearchResults`.
- Added `server/src/domain/research/orchestrator.ts` (`ResearchOrchestrator` and `orchestrateResearchCase`):
  - Fault isolation: each task is executed in an isolated `try/catch` block. If an external source or connector fails, times out, or throws (`ECONNREFUSED`, 500 error), only that task transitions to `failed` and the orchestrator continues with remaining tasks without crashing.
  - Partial execution: `updateCaseProgress()` detects when all tasks are settled; if `errorCount > 0`, the case transiciona to `partial` with descriptive summary (`Caso con ejecución parcial: X tarea(s) con error`). Cases without errors transition to `completed`.
  - Provenance & Results: completed tasks record rows in `research_results` (`source`, `dataType`, `data`, `confidence`, `verification`, `parserVersion`) and link `resultReference` on the task.
  - Idempotency: terminal cases and settled tasks are safely skipped without re-running or duplicating data under BullMQ job re-deliveries.
- Fixed `ResearchService.getResults`: changed from single-task `taskIds[0]` query to `inArray(researchResults.researchTaskId, taskIds)` to properly return all results across all tasks in a case.
- Added `ResearchService.executeResearch` domain method.
- Refactored `research.worker.ts` to delegate to `ResearchOrchestrator` (`skipGeolocation: true`).
- Updated `geocoding.worker.ts`: records `research_results` on successful geocoding, links `resultReference`, and wraps `processGeocodingJob` with a top-level error boundary that marks the geolocation task `failed` on unexpected exceptions so the case doesn't hang.
- Documentation synchronized: `docs/RESEARCH_ENGINE.md` §6, `docs/NEXT_STEPS.md`, `PROJECT_STATUS.md`, `PROJECT_EXECUTION_PLAN.md`.

Verified:
- Tests 57/57 (+7 new in `server/tests/orchestrator.test.ts`).
- Typecheck server + root; server build OK.

Next:
- Phase 3 / T3.4 (Manual Action)

## 2026-09-17 — OpenCode — Phase 3 / T3.4 (Manual Action)

Completed:
- Schema: 2 new enums `manual_action_kind` (captcha, login, payment,
  user_action, other) and `manual_action_status` (requested, completed,
  cancelled) in `server/src/db/schema/enums.ts`; new table `manual_actions`
  in `research.ts` (id, researchTaskId FK cascade, propertyId FK cascade,
  actionKind, status, instructions, url, source, requestedAt, completedAt,
  completedBy, result jsonb, metadata, createdAt, updatedAt) with 3 indexes.
- Migration `server/drizzle/0003_natural_mysterio.sql` generated with
  `npm run db:generate` (drizzle-kit 0.31.10, offline, no Postgres needed);
  no manual SQL editing required this time.
- `server/src/domain/research/manual-action.service.ts` (`ManualActionService`):
  requestManualAction (idempotent per task — an open `requested` action is
  returned instead of duplicating), getManualAction, listManualActions
  (status/propertyId/researchTaskId filters, ordered by requestedAt desc),
  completeManualAction (updates the action, inserts a `research_results` row
  with source 'manual', sourceUrl from the action, verification 'verified',
  confidence 'high', parserVersion 'manual-v1', metadata {manualActionId,
  externalSource}; writes audit_logs 'manual_result_entered'; transitions the
  task `requires_manual_action → completed` with resultReference;
  updateCaseProgress), cancelManualAction.
- Wiring: `ResearchOrchestrator.executeConnectorTask` → requestManualAction for
  `requires_manual_action`/`requires_auth` connectors (login → 'login', else
  'user_action', source = sourceId) and for geolocation without a
  geocodifiable address (source 'system'); `geocoding.worker.ts`
  `markGeolocationTask` → requestManualAction (source 'system') when the task
  lands in `requires_manual_action`. Both wrapped in try/catch (manual action
  creation must never crash the pipeline).
- `task-lifecycle.ts`: new direct edge `requires_manual_action → completed`
  for analyst-entered results.
- DTO `ManualActionDTO` exposed in `server/src/dto/index.ts`.

Important finding (tests):
- The in-memory mock DB in `tests/manual-action.test.ts` needed to emulate
  drizzle predicate ASTs. Drizzle `PgColumn.name` is the **snake_case DB name**
  (`research_task_id`), NOT the camelCase JS key — the mock resolves the column
  key from the owning table (`Object.keys(col.table).find(k => t[k] === col)`).
  Also `and()` produces one extra nested `SQL` wrapper, and `PgUUID` columns
  are ignored by a constructor-name `includes('column')` check.
- Full suite emits environmental noise when local services are down
  (osm.test.ts real Nominatim 500, app.test.ts pg-pool ECONNREFUSED :5433) but
  every test file passes (10/10 files, 67/67 tests).

Verified:
- Tests 67/67 (9 new in `server/tests/manual-action.test.ts`; schema.test →
  28 tables / 19 enums; task-lifecycle.test + new edge assertion).
- Typecheck server + root; server build OK.
- Live smoke test NOT repeated: PostgreSQL (5433), Redis (6380) and Docker
  were down; migration 0003 not yet applied to a running database.

Next:
- Phase 3 / T3.5 (Research Result provenance)