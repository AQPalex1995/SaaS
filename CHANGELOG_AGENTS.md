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