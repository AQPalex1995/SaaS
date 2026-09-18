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

## 2026-09-17 — OpenCode — Phase 3 / T3.5 (Research Result provenance)

Completed:
- Added `server/src/domain/research/result-provenance.ts`
  (`recordResearchResult`): the single code path for ALL research_results
  producers. It guarantees the 8 provenance fields on every insert — source,
  source_url, retrieved_at (defaults to now), confidence (default 'unknown'),
  verification (default 'reported'), raw_data (default null), normalized data
  (default {}), parser_version (default 'v1') — so no producer can forget them.
- Refactored all 6 insertion points to use it:
  - orchestrator.executeIdentityTask: now persists rawData (snapshot of the
    property: status / price + currency / priceSource).
  - orchestrator.executeGeolocationTask (verified path): rawData carries
    locationSource + locationVerification.
  - orchestrator.executeGeolocationTask (live OSM): rawData carries
    displayName + sourceUrl; retrieved_at set explicitly at fetch time.
  - orchestrator.executeConnectorTask: unchanged behaviour, uses helper.
  - geocoding.worker markGeolocationTask: rawData carries sourceUrl.
  - ManualActionService.completeManualAction: rawData is the analyst-entered
    result; provenance verification 'verified' / confidence 'high';
    metadata {manualActionId, externalSource}.
- DTO: `ResearchResultDTO` now exposes `rawData` and `metadata` (alongside
  source, sourceUrl, retrievedAt, data, confidence, verification,
  parserVersion); `ResearchService.toResultDTO` maps them.
- No migration needed: research_results already had all provenance columns.

Verified:
- Tests 69/69 (2 new in `server/tests/provenance.test.ts`; provenance
  assertions added to orchestrator.test / manual-action.test /
  schema.test.ts — rawData, retrievedAt, sourceUrl, metadata).
- Typecheck server + root; server build OK.
- Live smoke test NOT repeated (PostgreSQL 5433 / Redis 6380 / Docker down).

Next:
- Phase 3 / T3.6 (Research API)

## 2026-09-17 — OpenCode — Phase 3 / T3.6 (Research API)

Completed:
- Verified the 5 research endpoints exist and hardened them in
  `server/src/domain/research/routes.ts`:
  - GET/POST `/api/v1/properties/:id/research` (UUID or legacy SQLite id;
    POST 201, case → `queued` only when at least one job was enqueued).
  - GET `/api/v1/research/:id`, `/tasks`, `/results` now validate that `:id`
    is a UUID → **400** for malformed ids (previously a Postgres
    "invalid input syntax for type uuid" surfaced as 500) and **404** for
    unknown cases (previously `/tasks` and `/results` returned `[]`).
- `researchRoutes(app, deps)` now accepts injectable `service` and `db`
  (defaults: real `ResearchService` + `getDb()`), enabling HTTP tests with no
  database.
- Added `server/tests/research-api.test.ts` (7 tests): all 5 endpoints plus the
  400/404 contracts; Redis enqueues mocked.

Verified:
- Tests 76/76 (12 files). Typecheck server + root; server build OK.
- Live smoke test NOT repeated (PostgreSQL 5433 / Redis 6380 / Docker down).

Next:
- Phase 3 / T3.7 (Research Drawer)

## 2026-09-17 — OpenCode — Phase 3 / T3.7 (Research Drawer)

Completed:
- Frontend-only task in `src/panel.html` (Scout Legacy). **Decision Gate 2.3**:
  the user explicitly authorized editing `src/` for this task (option "solo
  panel.html, sin endpoint manual").
- Extended the Property Intelligence Drawer to show the full research state:
  - `resumePropertyResearch()`: on drawer open, loads the latest case via
    `GET /api/v1/properties/:id/research` and resumes polling.
  - Polling now fetches `/research/:id/tasks` and `/research/:id/results` in
    parallel and stops once tasks are terminal AND results were loaded.
  - New "Resultados y Evidencia" section (`renderDrawerResults`): groups results
    by `dataType` and shows source/link, confidence, verification, retrievedAt,
    parserVersion and a preview of `data`.
  - New "Avisos y Acciones Manuales" section (`renderDrawerAlerts`): lists
    `failed` (error), `requires_manual_action` (read-only description) and
    `unavailable` (stub) tasks.
  - Added `escAttr()` to safely escape URLs in HTML attributes.
- No server changes: manual actions remain read-only (no resolution HTTP route
  exists yet). No new tests (UI in the legacy panel, not covered by Vitest).

Verified:
- Root typecheck OK; both inline `<script>` blocks pass `node --check`.
- Server suite unchanged at 76/76 (not re-run as no server code changed).

Next:
- Phase 3 / T3.8 (Research tests)

## 2026-09-17 — OpenCode — Phase 3 / T3.8 (Research tests)

Completed:
- Added `server/tests/research-flows.test.ts` (9 tests) running the real
  orchestrator / lifecycle / service against an in-memory drizzle-like DB that
  evaluates WHERE predicates, covering the 8 planned scenarios: full research,
  partial research, failed task, unavailable source, retry, duplicate research,
  manual action and timeout — plus an edge case where every task failed.
- Key assertions: a full case ends `completed` (8/8, 6 warnings); a failing or
  timed-out source leaves the case `partial` while other tasks still complete;
  stub connectors land as `unavailable` (warning, not error); `failed → running`
  bumps `retryCount` and clears `completedAt`; two `createResearch` calls create
  two independent cases with 8 tasks each.

Findings (documented, intentionally NOT fixed in a tests-only task):
- `createResearch` has no dedup for active cases of the same property.
- `transitionTask` does not enforce `maxRetries`.
- There is no active timeout in the orchestrator (a timeout surfaces as a task
  failure).
- `updateCaseProgress` never marks a case `failed` (it uses `partial`).

Verified:
- Tests 85/85 (13 files). Typecheck server + root; server build OK.
- Live smoke test NOT repeated (PostgreSQL 5433 / Redis 6380 / Docker down).

Next:
- Phase 4 / T4.1 (REM@JU discovery) — requires Decision Gate approval

## 2026-09-17 — OpenCode — Phase 3 / T3.9 (Research documentation)

Completed:
- `docs/RESEARCH_ENGINE.md`:
  - New **§8 Cobertura de Pruebas (T3.8)** with the scenario table and the known
    limitations.
  - §2 now states the priority actually persisted by `createResearch`
    (`identity='high'`, rest `'medium'`) vs. the intended criticality.
  - §4 clarifies that `updateCaseProgress()` never produces `failed` today.
  - §5 fixes "reintentos agotados" and `maxRetries` (exposed but not enforced)
    and documents the timeout behaviour.
- `docs/API.md` §4: corrected the `maxRetries` wording and linked to
  `RESEARCH_ENGINE.md` §5/§8.
- `docs/NEXT_STEPS.md`: added §2.13 (Phase 3 close-out), refreshed the header and
  pointed the next iteration at Phase 4 (subject to approval).

Verified:
- Documentation-only change; no code touched. Suite remains 85/85.

Next:
- Phase 4 / T4.1 (REM@JU discovery) — **requires explicit approval** (Decision
  Gate 2.1/2.3: adding a new external data provider).

## 2026-09-17 — OpenCode — Operations (apply migration 0003)

Context:
- The user requested applying the pending `0003_natural_mysterio.sql` migration.

What was needed / done:
- PostgreSQL 5433 was down. Local Windows PostgreSQL runs on 5432 (CAST ERP,
  must NOT be touched). Started Docker Desktop and ran
  `docker compose up -d postgres redis` (containers `land-intel-postgres` on
  5433 and `land-intel-redis` on 6380; both healthy).
- Ran `npm.cmd run db:migrate` in `server/` → extensions ensured, migrations
  completed successfully.
- Verified against the live DB:
  - `drizzle.__drizzle_migrations` = 4 entries (0000–0003 applied).
  - `manual_actions` table exists with 15 columns; enums `manual_action_kind`
    (captcha|login|payment|user_action|other) and `manual_action_status`
    (requested|completed|cancelled) exist.
  - Existing data intact: 4025 properties, table is `property_listings`.
- Live smoke test (built `dist/`, `node dist/index.js`): `GET /health` →
  status `healthy` (database connected, postgis true, redis connected);
  `GET /api/v1/sources` → 14 connectors. Server stopped afterwards.

Verified:
- Suite remains 85/85 (no code changed). Typecheck server + root.
- Docs updated: `PROJECT_STATUS.md` (runtime up, migration no longer pending),
  `docs/DATABASE.md` §5 (migrations applied note).

Next:
- Phase 4 / T4.1 (REM@JU discovery) — **requires explicit approval** (Decision
  Gate: new external data provider).

## 2026-09-17 — OpenCode — Governance (auto-infra + auto-push rules)

Requested by the user:
1. Auto-start Docker and PostgreSQL automatically when the agent needs the DBs.
2. Copy/push the project to GitHub automatically on each advance, with the
   corresponding `.md` updates.

Implemented:
- `AGENTS.md`:
  - New **§2.8 "Autoarranque automático de Docker y PostgreSQL"**: when a task
    needs PostgreSQL 5433 / Redis 6380 the agent starts Docker Desktop,
    `docker compose up -d postgres redis`, waits for `healthy` and applies
    pending migrations (`npm.cmd run db:migrate`). Guardrails: never touch
    5432/6379 (CAST ERP), never `docker compose down -v`, never the `full`
    profile unless requested; if the engine can't start, stop and report.
  - New **§2.9 "Sincronización automática con GitHub"**: every checkpoint ends
    with `git push origin main` (no `--force`); credentials via Git Credential
    Manager; on divergence fetch+merge/rebase informing the user; on auth
    failure stop and request login.
  - §2.1 checkpoint list now includes step 9 (auto Git push); §2.4 rules make
    the push mandatory; §2.7 notes GCM and the stop-and-ask-auth rule;
    §3 added rules 7 (auto-infra) and 8 (auto-sync).
- `docs/DEVELOPMENT.md` §3: auto-start note + `docker compose stop` + never
  `down -v`; fixed the stale "40 tests" counter → 85.
- `docs/CI-CD.md`: header updated (local CI + auto-push) and git-state note
  documents the auto-push rule.
- `docs/NEXT_STEPS.md`: header references §2.8/§2.9; migration 0003 now listed
  as applied to the live DB.

Verified:
- `git push --dry-run origin main` → auth OK (`06768a8..904af81` fast-forward).

Next:
- Push pending local work to GitHub (autopush) and continue per plan: Phase 4 /
  T4.1 (REM@JU discovery) still requires explicit approval.

## 2026-09-17 — OpenCode — Phase 4 / T4.1 (REM@JU discovery)

Approved by the user ("aprobado, continua con la fase 4"). T4.1 was a research
+ documentation task (no code, no scraping).

Investigated (live, only public pages):
- **REM@JU** = Remate Electrónico Judicial, `https://remaju.pj.gob.pe/`
  (Poder Judicial del Perú), v3.7.1, **JSF + PrimeFaces 8.0**, WebLogic,
  contexto `/remaju`, **detrás de Akamai** (`stormcaster.js`,
  `validate.perfdrive.com`).
- **Public surface (no login)**: home `/` y `/remaju/index.xhtml` render
  servidor-side — carrusel "REMATE SIMPLE" con ubicación, fecha y ids
  `convocatoria` / `tipoConvocatoria` / `remate` para el botón "Detalle"
  (AJAX); `/remaju/pages/publico/informativo.xhtml` (info).
- Listado/detalle público = AJAX PrimeFaces con `ViewState` (no hay URL GET
  estable; una URL candidata devolvió 404). Sin JSON/API pública.
- **Log-in con CAPTCHA**: `/remaju/pages/seguridad/login.xhtml` —
  `frmLogin:imgCaptcha` (base64, max 5), "Con Casilla"/"Sin Casilla" (SINOE),
  "Términos y Condiciones" (dialogs). `faces/page/remaju.xhtml` =
  "No Autorizado". Participación = login + pago Banco de la Nación.
- Marco legal: RA Nº 211-2016-CE-PJ + Directiva 008-2016-CE-PJ (REM@JU),
  arts. 729–740 CPC (publicidad obligatoria del aviso de remate), Ley 29733 /
  D.S. 003-2013-JUS (minimización de datos personales).

Deliverables/policy:
- New **`docs/REMATE_JUDICIAL.md`**: reporte completo + viabilidad por tarea
  T4.2–T4.9 + restricciones (sin bypass CAPTCHA, sin automatizar login,
  frecuencia baja y sesión única frente a Akamai, `manual_actions` para pasos
  autenticados) + mapeo a provenance/dataModel (linking fuerte por partida
  registral, débil por distrito+dirección) + fuente complementaria oficial
  (El Peruano "Remates Judiciales").
- **Veredicto**: Fase 4 viable en modo "solo público"; T4.2 parser arranca por
  el home/carrusel y evalúa el AJAX público sin auth.
- Docs actualizados: `PROJECT_EXECUTION_PLAN.md` (Phase 4 → CURRENT, T4.1
  DONE), `PROJECT_STATUS.md` (Current Phase/Task), `docs/CONNECTORS.md`
  (fila `remaju`), `docs/RESEARCH_ENGINE.md` §6 (nota REM@JU),
  `docs/NEXT_STEPS.md` (§5 → Fase 4 en curso), `AGENTS.md` (Estado Actual).

Next:
- **T4.2 — parser** (zona pública; fixtures offline + fetch stubbed como
  `osm.test.ts`).

## 2026-09-17 — OpenCode — Phase 4 / T4.2 (REM@JU public parser)

Implemented the REM@JU public-surface parser (no login, no CAPTCHA) per the
T4.1 discovery report.

Code:
- New `server/src/connectors/implementations/remaju.ts`:
  - Pure, testable `parseRemajuHome(html)` + `parseFechaRemaju()` extracting
    the home carousel: `convocatoria`, `tipoConvocatoria`, `remate` (from the
    PrimeFaces `pa:` array, accepting both `&quot;` and plain `"`), `tipoLabel`,
    `ubicacion`, `fecha` (dd/MM/yyyy → `fechaISO`), `info`,
    `esUltimoDiaInscripcion`.
  - `RemajuConnector extends PropertyDataSource` (`sourceId: 'remaju'`):
    `search()` (district/query filter, accent-insensitive, `limit`,
    externalId `remaju:remate:<id>`), `getStatus()` (real availability) and
    `getDetails()` (returns found:false; AJAX detail deferred to T4.5).
  - Responsible-access design: 6 s throttle (disabled under NODE_ENV=test),
    single-session cookie jar (`jsessionid`), identifying User-Agent, and
    403/412 → `unavailable` / 429 → `rate_limited`; `search()` returns
    `items: []` on failure — never fabricated data.
- Config: `REMAJU_HOME_URL` / `REMAJU_USER_AGENT` in `server/src/config.ts`,
  `server/.env` and all `.env*.example` templates.
  (Note: in test/prod `env()` throws on missing values, so `server/.env` had to
  be updated — same pattern as `NOMINATIM_URL`.)
- Tests: new `server/tests/remaju.test.ts` (11 cases) with stubbed `fetch` and
  new offline fixture `server/tests/fixtures/remaju-home.html`.
  Two real bugs caught by tests: `\b` word-boundaries fail on accented text
  (now accent-normalized `includes`), and `totalFound` counted unmappable
  panels (now counts only items with an id).

Verified:
- `npm.cmd test` → **96/96 (14 files)**; `npm.cmd run typecheck` (server and
  root) and `npm.cmd run build` all OK.
- Live smoke (public home, a handful of requests): **276 remates** parsed
  (first: MIRAFLORES/40451/25296), district `cusco` → 2 hits, `getStatus` =
  `available`. No login/CAPTCHA interaction.

Docs:
- `PROJECT_EXECUTION_PLAN.md` (T4.2 DONE + result), `PROJECT_STATUS.md`
  (Current Task → T4.3; test counts 96/96), `docs/CONNECTORS.md` (real remaju
  note; registry wiring stays in T4.6), `docs/DEVELOPMENT.md`, `AGENTS.md`
  (test counts 96; tree includes remaju tests/fixture), `docs/NEXT_STEPS.md`.

Next:
- **T4.3 — normalization** (typed fields, S/ values, districts; evaluate the
  public AJAX listing/detail reachable without auth).