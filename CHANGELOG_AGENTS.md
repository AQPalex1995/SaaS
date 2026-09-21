# AGENT CHANGELOG

## 2026-09-21 — OpenCode — Fase 5.5 / RP.4 (Property dossier — expediente `/investigaciones/:id`) — DONE

Aprobado por el usuario ("okey continua con el RP 4"). Implementado el
**expediente propio del predio** descrito en `docs/UX_ARCHITECTURE.md` §2–§3
(la vista RESULTADO del producto, en lugar del drawer), íntegramente server-side
sin tocar el Scout Legacy `src/` (modificar `src/panel.html` para enlazar el
drawer → expediente queda como Decision Gate pendiente y se documenta).

- **DTOs** (`server/src/dto/index.ts`): `PropertyDossierDTO` (property + runs
  + risks + registry + urbanism + gis + infrastructure + history + judicial +
  market + evidence + report + generatedAt) y los 16 DTO de sección
  (`DossierRegistry*DTO`, `DossierUrban*DTO`, `DossierGis*DTO`,
  `DossierJudicial*DTO`, `DossierMarket*DTO`, `DossierEvidenceResultDTO`,
  `DossierDocumentDTO`, `DossierExternalLinkDTO`, `DossierReportEntryDTO` con
  `kind`: fact | signal | requiere_verificacion | unavailable).
- **Servicio** `server/src/domain/dossier/service.ts`: `DossierService.
  getPropertyDossier(propertyId)` → `null` si el predio no existe. Agrega las 11
  secciones de datos persistidos con queries `eq` (compatibles con el patrón
  in-memory de tests): PropertyService (resumen) + ResearchHistoryService
  (Histórico reutiliza RP.3) + consultas directas a `registry_*`, `urban_*`,
  `property_locations`/`property_geometries`, `judicial_*`, `market_*`,
  `property_scores`/`property_alerts`, `documents`, `external_links` y
  `research_results` (evidencias con taskType/estado/runNumber vía join en
  memoria con tasks/cases). Secciones sin fuentes → vacías o `unavailable` en
  el informe (nunca datos inventados). `report` deriva hallazgos por regla
  HECHO/SEÑAL/REQUIERE VERIFICACIÓN/NO DISPONIBLE (cargas activas evalúan
  `is_active='si'`, alertas `critical/high` → requiere verificación).
- **API** (`server/src/domain/dossier/routes.ts`, registrado en `app.ts`):
  `GET /api/v1/properties/:id/dossier` (UUID o id legacy; 404 honesto) y
  `GET /investigaciones/:id` que sirve `server/src/domain/dossier/expediente.html`
  (HTML estático vanilla, self-contained, sin dependencias nuevas; consume el
  endpoint agregado). El build copia el asset a `dist/`: `"build": "tsc -p
  tsconfig.build.json && node scripts/copy-assets.mjs"`
  (`scripts/copy-assets.mjs`).
- **Tests** `server/tests/property-dossier.test.ts` (6, offline, ASCII puro,
  patrón in-memory): null si el predio no existe; agregación completa (las 11
  secciones con datos reales seedeados, incluida `mapLink` derivada de las
  coordenadas, cargas activas y `report` con kinds correctos); predio nuevo →
  secciones vacías honestas + `unavailable` en el informe; API 200/404; página
  `/investigaciones/:id` sirve HTML.
- Verificación: suite server **239/239 (33 files)** ✅ (antes 233/233);
  typecheck server ✅; build server ✅ (incluye copia del asset);
  typecheck raíz ✅.
- Decisiones: sin migración de DB; la sección Infraestructura queda `{}`
  + `unavailable` (PLANNED); el expediente no entra a `src/` (drawer sin
  enlace aún — Decision Gate); fechas `date()` de Drizzle se serializan como
  string (no `toISOString`).

Siguiente: **RP.5 — Authentication** (cuentas, sesiones, email, recuperación —
Decision Gate, `docs/SECURITY.md`).

## 2026-09-21 — OpenCode — Fase 5.5 / RP.3 (Research history — historial PROPERTY / RESEARCH_CASE / RESEARCH_RUN) — DONE

Aprobado por el usuario ("okey continua"). Implementado el **historial de
predios** descrito en `docs/RESEARCH_GOVERNANCE.md` §4, respetando ADR-007
(**no se creó la tabla `research_runs`** — DECISION REQUIRED sigue vigente;
las ejecuciones se derivan de `research_cases.run_number`).

- **DTOs** (`server/src/dto/index.ts`): `ResearchRunDTO` (una ejecución),
  `ResearchChangeDTO` (cambio material por taskType+source: `added` /
  `removed` / `edited` / `unchanged` + `fieldsChanged` + `changedAt`),
  `ResearchHistoryTaskDTO`, `ResearchHistoryResultDTO` (con provenance),
  `ResearchCaseHistoryDTO` (caso + tasks/results/changes/`updated`),
  `ResearchHistoryDTO` (`property` + `runs` ordenados + `cases`).
- **Servicio** `server/src/domain/research/history.ts`: `ResearchHistoryService.
  getPropertyHistory(propertyId)` → `null` si el predio no existe; agrupa todos
  los casos del predio ordenados por `runNumber`, por ejecución expone tareas
  (taskType/status/manual), resultados (fuente, retrievedAt, confidence,
  verification, parserVersion vía join con la task) y el diff vs. la ejecución
  anterior del mismo predio. Helpers puros exportados: `serializeResultData`
  (comparación estable ignorando orden de claves), `diffDataFields`,
  `diffResults` (added/removed/edited/unchanged con `changedAt` =
  retrievedAt de la versión nueva). El DTO distingue los 3 niveles del
  historial (Property / ResearchCase / ResearchRun) y permite comparar,
  detectar cambios, conservar ejecuciones anteriores y datar cuándo cambió la
  información (requisitos §4).
- **API** (`server/src/domain/research/routes.ts`): `GET /api/v1/properties/:id/
  history` (UUID pregón; id legacy se resuelve como el resto de rutas de
  research; 404 honesto si no hay predio). Inyectable `historyService` en
  `ResearchRoutesDeps`.
- **Tests** `server/tests/research-history.test.ts` (10, offline, ASCII puro):
  helpers puros (estabilidad de serialización, fields diff, clasificación
  added/removed/edited/unchanged incl. `removed`); servicio (null si inexistente,
  history vacía para predio nuevo, orden por runNumber incluso si el seed entra
  desordenado, detección de cambios entre runs con fieldsChanged/changedAt);
  API (200 con runs ordenados + cambios, 404 para predio inexistente).
- Verificación: suite server **233/233 (32 files)** ✅ (antes 223/223);
  typecheck server ✅; build server ✅; typecheck raíz ✅.
- Decisiones: sin migración de DB; `ResearchHistoryDTO.property` es no-nulo
  (el 404 ya cubre predios inexistentes); el diff compara `data` normalizado
  (no `rawData`).

Siguiente: **RP.4 — Property dossier** (expediente `/investigaciones/:id` en
lugar del drawer; secciones Resumen/Registral/Urbanismo/GIS/Infraestructura/
Riesgos/Histórico/Judicial/Mercado/Evidencias/Informe). Requiere aprobación
explícita (Decision Gates).

## 2026-09-21 — OpenCode — Fase 5.5 / RP.2 (Search Property flow — entrada B) — DONE

Completado el delta pendiente de RP.2: **acceptance/spec test explícito** de la
entrada B (crear un `ResearchCase` **sin `Listing`** — predio no publicado que el
usuario registra directamente en "Buscar Predio").

- Nuevo spec `server/tests/research-entry-b.test.ts` (5 tests, offline, sin red ni
  Redis; patrón in-memory de `research-flows.test.ts` + Fastify inject de
  `research-api.test.ts`):
  1. **Contrato de esquema**: `research_cases` referencia SOLO `properties`
     (`propertyId` definido, **no existe `listingId`**).
  2. **Servicio entrada B**: dada una property sin Listing, `createResearch` crea
     el caso (status `created`, `runNumber` 1, `createdBy`), con las 8 tareas
     default (`pending`) y `getCaseById` lo devuelve; el DTO no lleva referencia
     a Listing.
  3. **Convergencia A/B**: dos ejecuciones sobre el mismo predio → run 1 y run 2
     (misma forma para entrada A y entrada B; ya afirmado en RP.1).
  4. **Servicio valida solo la property**: `createResearch` con property
     inexistente rechaza con "not found" (no hay dependencia de Listing).
  5. **Contrato API**: `POST /api/v1/properties/:id/research` acepta un UUID de
     property "pelado" (payload `{}`, sin identificador de publicación) → 201,
     `data.propertyId` correcto, sin campo `listingId`.
- Verificación: suite server **223/223 (31 files)** ✅ (antes 218/218); typecheck
  server ✅; build server ✅; typecheck raíz (Scout Legacy) ✅. Sin cambios
  productivos en `server/src` (solo se añadió el test de aceptación).
- Decisiones: no se tocó `server/src` (el dominio ya soportaba entrada B — ver
  sesión 2026-09-20 RP.2 BLOCKED); RP.2 se cierra con el test de aceptación.

Siguiente: **RP.3 — Research history** (historial PROPERTY / RESEARCH_CASE /
RESEARCH_RUN). Requiere aprobación explícita (Decision Gates).

## 2026-09-21 — OpenCode — Scout Legacy (aprobado): captura real de posts de grupos + permalinks

El usuario reportó que los grupos publican ~15 terrenos/hora pero el scraping solo
detecta ~5 (4 repetidos + 1 nuevo) y los enlaces abren el grupo en lugar de la
publicación. Diagnóstico (lectura de `src/searchers.ts`/`src/extract.ts`/
`src/store.ts` y `data/scout.db`):
- **Scroll fijo corto** (`config.maxScrolls: 4` → 4 pasadas) + virtualización del
  feed de Facebook → solo los ~5 tiles superiores en el DOM (4 pinned/destacados
  repetidos por ciclo); las 10–11 publicaciones nuevas de la hora quedan fuera.
- **Claves sintéticas inestables**: `fullText.slice(0,120)+imageUrl.slice(-30)`
  colisiona entre publicaciones distintas y choca entre grupos (ej.
  `957114593294351_p_hyt3pm` = `440710938703517_p_hyt3pm`), y cuando Facebook
  hidrata el permalink tardíamente se inserta una segunda fila.
- **Sin permalink real**: la mayoría de posts de grupo quedan con URL de
  búsqueda interna (`search`) o raíz del grupo; solo 58 permalinks en la base.

Implementado (Solución A+B+C aprobada):
- **`src/searchers.ts`**: `searchGroup` ahora abre `?sort=RECENT_POSTS` (fallback
  a URL plana si no hay `[role="feed"]`) y usa `collectGroupCardsExhaust`
  (scroll hasta agotar: min 8 / max 24 pasadas, corte por 3 pasadas sin tarjetas
  nuevas, actualiza en caliente el href cuando una pasada posterior hidrata el
  permalink). `recoverGroupLinks` reescrito: mismo scroll exhaustivo, patch por
  clave exacta + matching por solapamiento de tokens (≥0.5, palabras >3 chars)
  para filas sintéticas `p_` y consolidación de duplicados cross-key.
- **`src/extract.ts`**: id real vía `postIdFromDataFt` **o JSON embebido**
  (`story_fbid`/`top_level_post_id`/`stableID`, `fb://post/`); firma sintética
  ESTABLE (400 primeros caracteres normalizados + longitud + imagen completa)
  para colisiones deterministas sin falsos repetidos entre grupos.
- **`src/store.ts`**: `findByHref(href, idPrefix?)` y `listByPrefix(prefix)`
  (SQLite `json_extract` sobre `listings.data`) para consolidar duplicados
  cross-key (`storeRows` borra la fila sintética que comparte href canónico;
  `recoverGroupLinks` idem).
- NO se tocó OCR async (opción D no aprobada); `analyzeImage` sigue bloqueante.

Verificación: `npm.cmd run typecheck` (raíz Scout Legacy) ✅. Suite server
218/218 no afectada (sin cambios en `server/`). **Validación en vivo pendiente**
(correr `iniciar-scout.bat`, revisar un ciclo en el panel 8787: nº de posts por
grupo y `link_status` de la última hora; luego `npm.cmd run recover:links` para
el backfill).

## 2026-09-20 — OpenCode — RP.2 (Buscar Predio / entrada B) — BLOCKED & REVERTED

Estado: intento de acceptance test para RP.2 (entrada B: crear ResearchCase sin
Listing) sobre `server/tests/research-flows.test.ts`. La edicion produjo bytes
corruptos (tokens no-ASCII invalidos para TS/Vitest). Se revirtio con
`git checkout -- server/tests/research-flows.test.ts` para preservar la suite
218/218 verde de RP.1. NO commit / NO push de RP.2 (arbol limpio, salvo
`server/tmp/` scratch). Hallazgo util para la proxima sesion: el dominio YA
soporta entrada B (research-cases solo FK `property_id` sin `listing_id`;
`ResearchService.createResearch` valida SOLO `properties`). Delta restante de
RP.2 = acceptance/spec test explicito de esa entrada. Seguir en sesion nueva.

## 2026-09-20 — OpenCode — Fase 5.5 / RP.1 (Domain model — Case/Run separation) — DONE

Completado:
- **RP.1 Domain model**: separe Listing (publicación) / Property (predio) /
  ResearchCase (expediente) / ResearchRun (ejecución). **Decisión del Stakeholder
  (2026-09-19)**: NO crear tabla `research_runs` (queda PLANNED); la separación se
  modela con la columna aditiva `run_number` sobre `research_cases` + índice único
  `(property_id, run_number)` (ADR-007 + ADR-008 en `docs/DECISIONS.md`).
- Migración drizzle **0004** (aditiva, no destructiva): ALTER ADD COLUMN
  `run_number INTEGER DEFAULT 0 NOT NULL` → **backfill** `UPDATE ... SET run_number
  = ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at, id)` (numerar
  histórico existente por predio, garantiza unicidad de la indexación sobre datos
  viejos con N casos por predio) → CREATE UNIQUE INDEX `idx_research_property_run`.
  Aplicada a DB viva (5433) + tests actualizados.
- Service `research.ts`: `createResearch` computa `run_number` por property_id (+1)
  y el DTO ganó `runNumber` (aditivo).
- Tests: `research-flows.test.ts:400-404` — run 1 → 2 independientes (aserciones de
  Case/Run separation, casos NO deduplicados implícitamente).
- DDR Migration 0004 con backfill ROW_NUMBER antes del índice único → la DB viva
  queda con 0º duplicados.
- Suite **218/218 (30 files)**; typecheck server+root y build OK. Docker
  auto-arrancado + Postgres/Redis healthy + `db:migrate` aplicado a 5433.

Hallazgo:
- Backfill con ROW_NUMBER (en lugar de valores manuales) evita violación del índice
  único por histórico duplicado (mismos property_id con N run previos todos en 0).

Siguiente: RP.2 — módulo Buscar Predio (flow de entrada B, ResearchCase sin
Listing). Requiere aprobación (Decision Gates).

## 2026-09-20 — OpenCode — RP.1 Domain model (Case/Run separation) — Fase 5.5

Completed:
- **RP.1 Domain model — separación Listing/Property/ResearchCase/ResearchRun** (Fase 5.5, primera subfase de la transversal RP.1–RP.11). Decisión explícita del Stakeholder (2026‑09‑19): **NO tabla `research_runs` en RP.1** (queda PLANNED). Se añade la columna aditiva `run_number` (INTEGER NOT NULL DEFAULT 0) sobre `research_cases` con **índice único (property_id, run_number)**. ADR-007 + ADR-008 en `docs/DECISIONS.md`; `docs/RESEARCH_GOVERNANCE.md` §3 y `docs/DOMAIN_MODEL.md` actualizados.
- `server/src/db/schema/research.ts`: columna `run_number` + `uniqueIndex` aditivo `idx_research_property_run`.
- `server/src/domain/research/service.ts`: `createResearch` computa `run_number = max(run_number por property_id) + 1` dentro de la misma transacción/servicio → unicidad por predio garantizada.
- `server/src/dto/index.ts`: `ResearchCaseDTO` gana el campo `runNumber`.
- Migración **0004 (drizzle)**: (1) añade columna aditiva, (2) **backfill** `UPDATE research_cases SET run_number = ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at, id)` para numerar el histórico existente por predio, (3) crea índice único `idx_research_property_run`. Aplicada a DB viva `land_intel` (5433).
- Tests: `tests/research-flows.test.ts:403-404` (case 1 → run 1->2 independientes; no hay dedup implícito) + helper `tests/helpers/in-memory-db.ts` (run_number: 1).
- Verificación: suite **218/218 (30 archivos)**, typecheck server+root y build server OK.

Important rule (RP.1):
- Cada `createResearch` disparado por el usuario es una **ejecución independiente** (ResearchRun implícito via run_number); **no** hay deduplicación automática de consultas repetidas. El histórico del predio se ordena por run_number (1ª, 2ª, 3ª…).

Important finding:
- Separación Case/Run documentada en `docs/RESEARCH_GOVERNANCE.md` §3; la tabla `research_runs` queda **PLANNED** para cuando el modelo de ejecución lo exija (ver `PROJECT_EXECUTION_PLAN.md` RP.x).

Next:
- **RP.2 Search Property flow** — módulo Buscar Predio independiente de las publicaciones (entrada B); crear ResearchCase sin Listing. Requiere aprobación explícita (Decision Gate).

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

## 2026-09-17 — OpenCode — Phase 4 / T4.3 (REM@JU normalization)

Normalized the raw carousel fields into a canonical, typed shape reusable as
`research_results.data` (provenance T3.5) and by dedup (T4.4) / linking (T4.5).

Code:
- New pure module `server/src/connectors/implementations/remaju-normalize.ts`:
  - `normalizeRemateSlide(slide, montoRaw?)` → `NormalizedRemate`
    (`source`, `parserVersion`, `remateId`/`convocatoriaId` as numbers,
    `tipo`, `tipoRaw`, `ubicacion` display + `ubicacionKey` accent-free,
    `fechaISO`, `esUltimoDiaInscripcion`, `info`, `moneda`/`monto`).
  - `normalizeTipoConvocatoria(codigo, label)`: canonical
    `remate_simple | segunda_convocatoria | tercera_convocatoria | subasta |
    desconocido` (label wins, then code 1..4).
  - `normalizeUbicacion()`: Title Case display + accent-stripped uppercase key.
  - `parseFechaRemaju()` moved here (basic day/month validation, `null` on
    invalid) and re-exported from `remaju.ts` for compatibility.
  - `parseMontoPEN()`: "S/ 1,234.56", "S/. 900", "1 234,56" (rejects
    US$/EUR/€/$), groundwork for the T4.5 detail.
- `remaju.ts`: `slideToItem` now maps via the normalizer (`district` = display
  ubicacion; `rawData` = `{ ...slide, normalized }`); `fechaISO` typed
  `string | null`.
- Tests: new `server/tests/remaju-normalize.test.ts` (8 cases); adjusted two
  T4.2 assertions (`parseFechaRemaju` returns `null`, district Title Case).
  Suite **104/104 (15 files)**; server+root typecheck and build OK.

Notes:
- Kept the connector's public contract unchanged for consumers: `rawData` still
  carries the raw slide fields (spread) plus `normalized`.

Next:
- **T4.4 — deduplication** (ids `remate`/`convocatoria` + content hash).

## 2026-09-17 — OpenCode — Phase 4 / T4.4 (REM@JU deduplication)

Deduplicated the public carousel so a remate repeated across panels (or as
several convocatorias of the same remate) yields a single item, reusing the
`contentHash` pattern from ingestion.

Code:
- New pure module `server/src/connectors/implementations/remaju-dedup.ts`:
  - `remajuContentHash(normalized)`: SHA-256 hex of the canonical content
    (case/space-insensitive) — mirrors `domain/ingestion/sync.ts` `contentHash`.
  - `remajuDedupKey()` (primary identity) + `remajuDedupKeys()` (all keys of a
    row): strong `remate:<id>` > `convocatoria:<id>`, fallback `hash:<sha256>`
    when both ids are missing.
  - `dedupeEntries()` indexes by **all** aliases, so a row with both ids matches
    a partial row (single id) or an id-less row with identical content; merges
    empty fields (`mergeRemate`) without overwriting present ones and keeps the
    first-seen `raw`.
  - `dedupeRemates()` convenience wrapper + `REMAJU_DEDUP_VERSION='v1'`.
- `remaju.ts`: `search()` now normalizes → filters → **dedupes** → maps;
  dropped duplicates logged via `logger.debug`.
- Tests: `server/tests/remaju-dedup.test.ts` (9 cases). Suite **113/113
  (16 files)**; server+root typecheck and build OK.

Notes:
- Alias indexing fixes the edge case where the same auction appears once with
  `remate` and once with only `convocatoria`.

Next:
- **T4.5 — property linking** (partida registral strong key; district+address
  weak; candidates without hard-match).

## 2026-09-17 — OpenCode — Phase 4 / T4.5 (REM@JU linking + manual intake)

Completed the human-in-the-loop path for REM@JU: pure linking module, manual
intake planner/service, HTTP routes and a minimal operator UI served by the API
(no changes to the Scout Legacy).

Code:
- New pure module `server/src/connectors/implementations/remaju-link.ts`:
  `normalizePartida()`, `addressTokens()` (accent/stopword aware),
  `overlapRatio()`, `linkRemateToProperties()` (exact partida → `high`/score 1;
  address fuzzy → `medium`/`low`; district-only → `0.3`/`low`) and
  `pickHardLink()` (only exact partida; never auto-links weak matches).
- New pure module `server/src/domain/research/remate-manual.ts`
  (`planRemateIntake`, `composeDireccion`): normalizes the human payload and
  plans the `registry_properties` row, the `properties` location update and the
  geocoding fallback — no DB/network effects.
- New `server/src/domain/research/remate-intake.service.ts`
  (`RemateIntakeService`, injectable db/manualActions/storage/geocode): completes
  a `manual_action`, persists partida, applies location (manual or OSM/Nominatim
  fallback at `confidence:'low'`), stores the aviso PDF and records
  `external_links` (`linkType:'remate_pdf'`), delegating closure to
  `ManualActionService`.
- New `server/src/domain/research/remate-intake.routes.ts`, registered in
  `app.ts` with an injectable service: `GET /api/v1/manual-actions` (+`/:id`),
  `POST /api/v1/manual-actions/:id/complete` (JSON + base64 PDF, 12 MB
  `bodyLimit`, no new deps) and the minimal HTML UI at `GET /manual-actions`.
- Privacy: only partida, address, coordinates and public auction data; never
  personal data (Ley 29733 / D.S. 003-2013-JUS).
- Tests: `remaju-link.test.ts` (6), `remate-manual.test.ts` (7),
  `remate-intake.service.test.ts` (6), `remate-intake.routes.test.ts` (4).
  Suite **136/136 (20 files)**; server+root typecheck and build OK.

Notes:
- PDF upload uses base64 JSON instead of `@fastify/multipart` to avoid new
  dependencies/network in tests; `bodyLimit` raised only on the complete route.
- The UI is served by the Land Intelligence API (`/manual-actions`) because
  modifying the Scout Legacy `src/` requires explicit approval (T3.7 precedent).

Next:
- **T4.6 — research connector**: wire `RemajuConnector` + `RemateIntakeService`
  into the Research Engine (`TASK_SOURCE_MAP`, `recordResearchResult`,
  `requestManualAction` when the CAPTCHA-gated detail is required).

## 2026-09-17 — OpenCode — Phase 4 / T4.6 (REM@JU research connector)

Wired REM@JU into the Research Engine: the `judicial` task is now backed by the
real public-surface connector instead of a stub.

Code:
- `server/src/connectors/implementations/remaju.ts`: unchanged connector, now
  registered as **real** in `server/src/index.ts` (replaces the stub).
- `server/src/domain/research/remaju-research.ts` (pure): `toRemateEntry()` +
  `planRemajuMatches()` — matches public carousel remates against a property by
  partida (strong) or district/address (weak) via `remaju-link.ts`; returns
  ordered matches, `hardMatch`, confidence and warnings.
- `server/src/domain/research/orchestrator.ts`:
  - `TASK_SOURCE_MAP.judicial = 'remaju'`.
  - Constructor accepts `OrchestratorDeps.remajuSearch` (injectable; defaults to
    `remajuConnector.search`).
  - New `executeRemajuTask()`: queries `properties` + `registry_properties`,
    searches the public carousel by district, plans matches and either records a
    `judicial` result (`source:'remaju'`, `verification:'reported'`,
    `parserVersion:'remaju-research-v1'`) and completes, or — when only weak
    candidates exist — lands on `requires_manual_action` and requests a
    `captcha`-kind manual action pointing at the REM@JU home.
- Tests: `remaju-research.test.ts` (6 pure) + 3 `judicial` orchestrator tests
  (fake `remajuSearch`, in-memory DB). `research-flows` full 8-task scenario now
  injects an empty `remajuSearch` (no live network in the suite) and asserts
  `judicial → completed`. Suite **145/145 (21 files)**; server+root typecheck and
  build OK.

Notes:
- A hard partida match is impossible from the public carousel alone (the detail
  with the partida is CAPTCHA-gated); the honest state for weak matches is
  `requires_manual_action`, completed later through the T4.5 intake API.

Next:
- **T4.7 — manual action handling**: refine the end-to-end manual cycle
  (pending → completed/`cancelled` from the API, DTOs, states).

## 2026-09-17 — OpenCode — Phase 4 / T4.7 (manual action handling)

Completed the human-in-the-loop lifecycle over HTTP.

Code:
- `RemateIntakeService.cancel(id, cancelledBy?)` delegating to
  `ManualActionService.cancelManualAction`.
- New route `POST /api/v1/manual-actions/:id/cancel` (body `{ cancelledBy }`);
  404/409 error mapping.
- Cycle verified by tests: `requested` (idempotent per task) → `completed`
  (settles the `requires_manual_action` task, records result with provenance
  `manual-v1`) | `cancelled` (idempotent, task untouched).
- `docs/API.md` documents the new endpoint.
- Tests: `remate-intake.routes.test.ts` (+1). Suite **146/146 (21 files)**;
  server+root typecheck and build OK.

Next:
- **T4.8 — tests**: Fase 4 acceptance suite (offline E2E manual→complete cycle,
  payload fixtures, edge cases for `planRemajuMatches` and intake).

## 2026-09-17 — OpenCode — Phase 4 / T4.8 (acceptance tests)

- New `server/tests/phase4-acceptance.test.ts` (5 tests, all offline):
  - E2E REM@JU cycle without network using a minimal in-memory Drizzle db:
    judicial task → weak carousel candidate → `requires_manual_action` + manual
    action (kind captcha) → `completeManualAction` → task `completed` and
    manual result persisted with provenance `manual-v1` (high/verified).
  - Fixture `server/tests/fixtures/remate-manual-payload.json` driven through
    `planRemateIntake` (partida normalization, numeric amounts, composed
    direction, partida-origin coords, `needsGeocoding:false`).
  - `planRemajuMatches` multi-partida hard match; `linkRemateToProperties`
    partida-over-address priority; no-address intake edge (alert, no geocode).
- Suite **151/151 (22 files)**; server+root typecheck and build OK.

Next:
- **T4.9 — monitoring**: queue/worker healthchecks, alerts for stuck
  `requires_manual_action` tasks, manual-cycle and REM@JU consumption metrics.

## 2026-09-17 — OpenCode — Phase 4 / T4.9 (operations monitoring)

- New `server/src/domain/monitoring/`:
  - `monitoring.service.ts` — `MonitoringService` read-side aggregates over
    `manual_actions`/`research_tasks`/`research_results` (offline-safe):
    - `getOperationsSummary()`: manual cycle (total/requested/completed/
      cancelled, `stalePending` beyond 7 days, `avgCompletionHours`), judicial/
      REM@JU pipeline (task statuses, `dataType:'judicial'` results per source
      and parser), and stuck work: `stale_pending_action` + `orphan_task`
      (requires_manual_action tasks with no pending resolution) by age.
    - `getQueueStatus(report?)`: BullMQ queue depths per queue, graceful
      degradation (`connected:false`) when Redis is unavailable; injectable
      reporter.
  - `routes.ts`: `GET /api/v1/monitoring/operations` and
    `GET /api/v1/monitoring/queues`; wired in `app.ts`
    (`AppOptions.monitoringService`).
- Shared test helper `server/tests/helpers/in-memory-db.ts` extracted from
  `phase4-acceptance.test.ts` and reused by the new suites.
- Tests: `monitoring.service.test.ts` (4) + `monitoring.routes.test.ts` (2).
- Suite **157/157 (24 files)**; server+root typecheck and build OK.

Next:
- **Fase 5 — SUNARP**: **T5.1 (Conoce Aquí)** — discovery público sin CAPTCHA,
  parser + conector stub→real si es accesible; aplicar el mismo patrón
  REM@JU (parser puro + linking + manual_actions cuando haya CAPTCHA).
## 2026-09-18 - OpenCode - Fase 5 / T5.1 (SUNARP Conoce Aqui - discovery y postura honesta)

- Discovery completo de SUNARP (docs/SUNARP.md, web oficial gob.pe 2026):
  - **Conoce Aqui** (conoce-aqui.sunarp.gob.pe): login DNI + fecha de emision + CAPTCHA, 3-5 consultas/dia por DNI, vista 30 min con tramado "no constituye publicidad registral", no imprimible.
  - **Consulta de Propiedad** (www2.sunarp.gob.pe/consulta-propiedad): busqueda de partidas por nombre del titular; exige DNI/carnet + fecha de emision + CAPTCHA + validacion de correo OTP.
  - **SPRL** (sprl.sunarp.gob.pe): de pago (copias literales ~S/14, certificados); suscripcion gratuita.
  - **Visor BGR** y **Consulta Verificadores**: DNI + CAPTCHA obligatorio.
  - **Veredicto**: SUNARP NO ofrece superficie consultable sin identidad personal + CAPTCHA (a diferencia del home publico de REM@JU). Ninguna consulta automatizable: Ley 29733 (minimizacion de datos: DNI + fecha de emision no se almacenan) + politica dura no-bypass CAPTCHA.
- Conector real de POSTURA `server/src/connectors/implementations/sunarp.ts`:
  - `SunarpConnector` (sourceId 'sunarp'): `getStatus()` -> requires_auth + requiresManualAction con instrucciones del operador; `search()`/`getDetails()` devuelven vacio/not-found; **NO realiza peticiones de red** (nunca datos simulados).
  - Constantes de URLs publicas + helper `sunarpManualActionDescription()`.
  - Registrado en `index.ts` (bloque 1d, tras OSM y REM@JU; contrato de 14 fuentes intacto).
- Efecto en Research Engine: `executeConnectorTask` ya traduciera requires_auth -> `requires_manual_action` (kind 'login'); las tareas registry/bgr ahora terminan en requires_manual_action con manual action (antes 'unavailable').
- Tests `server/tests/sunarp.test.ts` (5): status requires_auth, search vacio, getDetails not-found, descripcion con URL oficial, E2E offline registry -> requires_manual_action + manual action kind login.
- Suite **162/162 (25 files)**; typecheck server+root y build OK.
- Docs: AGENTS.md (estado, excepciones 3.4, arbol, counts 162), PROJECT_EXECUTION_PLAN (PHASE 5 STATUS IN PROGRESS, T5.1 DONE), PROJECT_STATUS (Current Task T5.2, 162/162), CONNECTORS.md (sunarp real de postura), RESEARCH_ENGINE.md (T3 nota), API.md (ejemplo requires_auth), ROADMAP.md, NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.2 - SUNARP Consulta de Propiedad**: aplicar misma postura requires_auth/manual sobre la segunda superficie publica (busqueda por nombre de propietario); decidir integracion en `sunarp` existente; actualizar docs/SUNARP.md + tests.

## 2026-09-18 - OpenCode - Fase 5 / T5.2 (SUNARP Consulta de Propiedad)

- Discovery adicional (docs/SUNARP.md): "Consulta de Propiedad" (www2.sunarp.gob.pe/consulta-propiedad) localiza partidas a NOMBRE del propietario; formulario DNI/carnet + numero + fecha de emision + correo + verificaci�n de seguridad (CAPTCHA), validaci�n por correo OTP; resultados con homonimia; Vista Simple = titular/partida/cargas vigentes. Igual que Conoce Aqui: NO automatizable (identidad + CAPTCHA + OTP; Ley 29733).
- Conector sunarp ampliado (T5.2):
  - `SearchResult` (base.ts) gano campos opcionales `requiresManualAction`/`manualActionDescription` (aditivo, contrato de conectores intacto).
  - `search()` ahora devuelve vacio + `requiresManualAction: true` con instrucciones orientadas a Consulta de Propiedad (busqueda por propietario), via helper `sunarpOwnerSearchManualActionDescription()`.
  - `getStatus()` usa `sunarpRegistryManualActionDescription()` (guia combinada: localizar partida -> Consulta de Propiedad; ver contenido -> Conoce Aqui) que alimenta la manual action de las tareas registry/bgr.
  - `getDetails()` mantiene orientacion a Conoce Aqui.
- Tests `sunarp.test.ts` actualizados (5): search se�ala Consulta de Propiedad; getStatus incluye ambas URLs; guia combinada; E2E offline registry->requires_manual_action con instructions que contienen ambas superficies.
- Suite **162/162 (25 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (detalle Consulta de Propiedad + secciones T5.1/T5.2 DONE), PROJECT_EXECUTION_PLAN (T5.2 DONE, next T5.3), PROJECT_STATUS (Current Task T5.3, 162/162), NEXT_STEPS.md, AGENTS.md, CONNECTORS.md, RESEARCH_ENGINE.md (T3 nota).

Next:
- **T5.3 - SUNARP SPRL** (sprl.sunarp.gob.pe, de pago): decidir postura (previsiblemente requires_auth + kind payment sin automatizar compras); documentar + tests si aplica.

## 2026-09-18 - OpenCode - Fase 5 / T5.3 (SUNARP SPRL - postura de pago con valor legal)

- Discovery (docs/SUNARP.md): SPRL (sprl.sunarp.gob.pe) = Servicio de Publicidad Registral en Linea con VALOR LEGAL (unico camino a copias literales / certificados oficiales). Suscripcion gratuita (usuario/clave) pero CADA consulta de pago: visualizacion de partida ~S/ 6.90/pagina; copia literal ~S/ 14.00 (2 primeras hojas) + S/ 7.00 por hoja adicional.
- Conector real de postura `server/src/connectors/implementations/sunarp-sprl.ts`:
  - `SunarpSprlConnector` (sourceId 'sunarp_sprl'): getStatus() -> requires_auth + requiresManualAction con guia que documenta suscripcion gratuita + pago por servicio; search()/getDetails() vacios + requiresManualAction; NO hace peticiones de red; no se automatiza la compra ni se almacenan credenciales.
  - Constante `SUNARP_SPRL_URL` + helper `sunarpSprlManualActionDescription()`.
  - Registrado en index.ts (bloque 1e, tras sunarp; contrato de 14 fuentes intacto -> 4 reales: openstreetmap/remaju/sunarp/sunarp_sprl).
- Tests `server/tests/sunarp-sprl.test.ts` (5): getStatus requires_auth + pago, search vacio + manual action, getDetails found=false + copia literal, guia con montos, instancia singleton.
- Suite **167/167 (26 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (detalle SPRL + T5.3 DONE), PROJECT_EXECUTION_PLAN (T5.3 DONE, next T5.4), PROJECT_STATUS (Current Task T5.4, 167/167/26), NEXT_STEPS.md, AGENTS.md (estado, excepciones 3.4, arbol, counts 167), CONNECTORS.md.

Next:
- **T5.4 - Registry normalization**: normalizar formato de partida de la Zona Registral XII (Arequipa, P-XXXXXXXX) y campos del registro capturados manualmente (titular, cargas) antes de persistir en registry_properties/registry_owners/registry_charges; parser puro + fixtures + tests offline.

## 2026-09-19 - OpenCode - Fase 5 / T5.4 (Registry normalization)

- Completado `server/src/connectors/implementations/sunarp-normalize.ts` (estaba como WIP sin commitear y sin tests) y añadido al flujo de intake:
  - `normalizeRegistryPartida()` / `registryLookupKey()` -> clave canónica `P-XXXXXXXX` (Zona Registral XII — Arequipa, prefijo de oficina `110`: acepta `P-12345678`, `p12345678`, `P 1234 5678`, `12345678` y `11012345678`). Es lo que se persiste en `registry_properties.registry_number` para **deduplicar el cache de pagos de SPRL** (primera consulta pagada -> almacenada; siguientes por clave canónica sin volver a pagar).
  - `normalizeRegistryCapture()` -> shape canónico tipado para `registry_properties`/`registry_owners`/`registry_charges`: titular (Title Case con acrónimos `S.A.C.`, tipo DNI/RUC/CE/PASAPORTE, natural/jurídica/desconocido, porcentaje 0–100), cargas (hipoteca/embargo/medida_cautelar/anotación/prohibición/servidumbre/usufructo, monto S//US$ vía `parseAmount`, estado si/no/unknown), fechas dd/MM/yyyy->ISO, m². Nunca inventa valores (null/desconocido + warnings).
  - Helprs `toText` (valores `unknown` no rompen), `titleCase`, `parseAmount`, `normalizeAreaM2`, `parseRegistralDate`.
- Integración "antes de persistir": `server/src/domain/research/remate-manual.ts` ahora usa `registryLookupKey` (import desde `sunarp-normalize.js`) para el `registry_properties.registry_number` del intake manual (T4.5). `remaju-link.normalizePartida` se mantiene para matching (quita guiones -> ambos formatos coinciden).
- Bugs reales detectados y corregidos por la batería de tests:
  - `normalizeAreaM2("380 m2")` devolvía **3802** (el dígito de la unidad "m2" sobrevivía al strip). Ahora la unidad (`m2/mt2/m²/metros2/cuadrados`) se quita antes de extraer dígitos -> 380; "550.75 m2" -> 550.75.
  - `normalizeCarga`/amount: `Number("1,234.56")` = NaN con separadores de miles -> se parsea vía `parseAmount` (S/ 1,234.56 -> 1234.56).
- Tests `server/tests/sunarp-normalize.test.ts` (20): claves canónicas (8 variantes), inválidos -> null, tolva, campos null-safe, cargas con miles/desconocidos, fixture E2E `normalizeRegistryCapture`; fixture `server/tests/fixtures/registry-capture.json`.
- Aserciones actualizadas a `P-12345678`: `remate-manual.test.ts` (+ `registry.registryNumber`) y `phase4-acceptance.test.ts` (línea aserción partida/intake).
- Suite **187/187 (27 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.4 DONE + sección detallada), PROJECT_EXECUTION_PLAN (T5.4 DONE, next T5.5, STATUS T5.1–T5.4), PROJECT_STATUS (Current Task T5.5, 187/187/27), NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.5 - Owners**: persistir titulares normalizados de la captura manual en `registry_owners` (seed desde la captura; vincular por `propertyId` + `registryId`).

## 2026-09-19 - OpenCode - Fase 5 / T5.5 (Owners - persistir titulares SUNARP)

- `sunarp-normalize.ts`: nuevo export `normalizePropietarios(raw)` (acepta array o un único objeto; reutiliza `normalizePropietario`/`PropietarioNormalizado` de T5.4).
- `remate-manual.ts` (`planRemateIntake`):
  - `RemateManualInput` gana `propietarios?` (Array<Record> | Record | null) — captura manual SUNARP.
  - Los titulares se normalizan y solo se persisten los aprovechables (`meaningfulOwners`: nombre y/o documento); si la captura no deja ninguno, warning `captura SUNARP sin propietarios normalizables`.
  - `RegistryPlanRow.owners` y `RemateManualNormalized.propietarios` exponen el lote normalizado.
- `remate-intake.service.ts`:
  - `saveOwners(registryId, owners)`: un solo INSERT en `registry_owners` (FK `registry_property_id` = registryId, `source: 'sunarp'`, porcentaje `numeric(5,2)` en texto, `rawData: { parserVersion }`).
  - `RemateIntakeResult.ownersPersisted` + `ownersPersisted` en el payload/log del intake.
- Tests (+4): `sunarp-normalize.test.ts` (1 normalizePropietarios: array/objeto único/vacío/no-objeto), `remate-manual.test.ts` (2: lote normalizado al shape canónico + warning para captura sin titulares), `remate-intake.service.test.ts` (1: complete() con propietarios → 2 INSERTs registry+owners con shape correcto y ownersPersisted=2).
- Suite **191/191 (27 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.5 DONE + sección), PROJECT_EXECUTION_PLAN (T5.5 DONE, next T5.6, STATUS T5.1–T5.5), PROJECT_STATUS (Current Task T5.6, 191/191/27), NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.6 - Charges**: persistir cargas/gravámenes normalizados de la captura manual en `registry_charges` (igual patrón: `planRemateIntake` → `saveCharges`, FK `registry_property_id`).

## 2026-09-19 - OpenCode - Fase 5 / T5.6 (Charges - persistir cargas SUNARP)

- `sunarp-normalize.ts`: nuevo export `normalizeCargas(raw)` (acepta array o un único objeto; reutiliza `normalizeCarga`/`CargaNormalizada` de T5.4).
- `remate-manual.ts` (`planRemateIntake`):
  - `RemateManualInput` gana `cargas?` (Array<Record> | Record | null) — captura manual SUNARP.
  - Las cargas se normalizan y solo se persisten las aprovechables (`meaningfulCharges`: tipo/descripción/monto/acreedor); si la captura no deja ninguna, warning `captura SUNARP sin cargas normalizables`.
  - `RegistryPlanRow.charges` y `RemateManualNormalized.cargas` exponen el lote normalizado.
- `remate-intake.service.ts`:
  - `saveCharges(registryId, cargas)`: un solo INSERT en `registry_charges` (FK `registry_property_id` = registryId, `source: 'sunarp'`, monto `numeric(15,2)` en texto, moneda PEN/USD, estado si/no/unknown, `rawData: { parserVersion }`).
  - `RemateIntakeResult.chargesPersisted` + `chargesPersisted` en el payload/log del intake.
- Tests (+4): `sunarp-normalize.test.ts` (1 normalizeCargas: array/objeto único/vacío/no-objeto + tipos/monto/moneda/estado), `remate-manual.test.ts` (2: lote normalizado al shape canónico + warning para captura sin cargas), `remate-intake.service.test.ts` (1: complete() con cargas → 2 INSERTs registry+charges con shape correcto y chargesPersisted=2).
- Suite **195/195 (27 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.6 DONE + sección), PROJECT_EXECUTION_PLAN (T5.6 DONE, next T5.7, STATUS T5.1–T5.6), PROJECT_STATUS (Current Task T5.7, 195/195/27), NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.7 - Titles**: persistir historial de títulos/asientos de la captura manual en `registry_titles` (normalizar `registry_titles`: titleNumber/titleDate/titleType/notary/description).

## 2026-09-19 - OpenCode - Fase 5 / T5.7 (Titles - persistir historial de títulos SUNARP)

- `sunarp-normalize.ts`: nuevo export `normalizeTitulos(raw)` (acepta array o un único objeto; shape `TituloNormalizado`: titleNumber/titleDate/titleType/notary/description; fechas ISO vía `parseFechaISO`, notario title-case via `normalizeOwnerName`).
- `remate-manual.ts` (`planRemateIntake`):
  - `RemateManualInput` gana `titulos?` (Array<Record> | Record | null) — historial de asientos de la captura manual SUNARP.
  - Los títulos se normalizan y solo se persisten los aprovechables (`meaningfulTitles`: cualquier dato real); si la captura no deja ninguno, warning `captura SUNARP sin títulos normalizables`.
  - `RegistryPlanRow.titles` y `RemateManualNormalized.titulos` exponen el lote normalizado.
- `remate-intake.service.ts`:
  - `saveTitles(registryId, titulos)`: un solo INSERT en `registry_titles` (FK `registry_property_id` = registryId, `source: 'sunarp'`, fechas ISO, `rawData: { parserVersion }`).
  - `RemateIntakeResult.titlesPersisted` + `titlesPersisted` en el payload/log del intake.
- Tests (+4): `sunarp-normalize.test.ts` (1 normalizeTitulos: array/objeto único/vacío/no-objeto + fechas/notary/tipos), `remate-manual.test.ts` (2: lote normalizado al shape canónico + warning para captura sin títulos), `remate-intake.service.test.ts` (1: complete() con títulos → 2 INSERTs registry+titles con shape correcto y titlesPersisted=2).
- Suite **199/199 (27 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.7 DONE + sección), PROJECT_EXECUTION_PLAN (T5.7 DONE, next T5.8, STATUS T5.1–T5.7), PROJECT_STATUS (Current Task T5.8, 199/199/27), NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.8 - Historical data**: derivar el estado registral de la partida desde los datos históricos de asientos (leer `registry_titles` + `registry_charges` del mismo registry row) en vez de duplicar cargas.

## 2026-09-19 - OpenCode - Fase 5 / T5.8 (Historical data - estado registral derivado)

- Alcance acotado con el usuario (T5.8 sin definir en el plan): derivación PURA, sin migración ni DB.
- Nuevo módulo `server/src/connectors/implementations/sunarp-historical.ts`:
  - `deriveHistoricalState(titles: TituloNormalizado[], charges: CargaNormalizada[])` → `RegistryHistoricalState`
    `{ titleCount, chargeCount, activeCharges, inactiveCharges, totalActiveDebtPen,
    totalActiveDebtUsd, lastTitleDate, registryState }`.
  - `registryState`: `'cargado'` (hay cargas con `isActive: 'si'`), `'sano'` (solo
    vencidas/canceladas) o `'desconocido'` (sin cargas capturadas). Deuda activa
    solo por moneda (PEN/USD), redondeada a 2 decimales; `lastTitleDate` =
    máximo de fechas ISO de los títulos (null si no hay).
- `remate-manual.ts` (`planRemateIntake`): `RemateManualNormalized.historical` y
  `RegistryPlanRow.historical` exponen la derivación (queda en `rawData` del
  registry row). Sin cambios en el servicio de intake ni en la BD.
- Tests (+6): nuevo `server/tests/sunarp-historical.test.ts` (5: desconocido,
  sano, cargado con deuda por moneda, última fecha ISO, sin fechas) + 1 en
  `remate-manual.test.ts` (plan expone la derivación con hipoteca vigente).
- Suite **205/205 (28 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.8 DONE + sección), PROJECT_EXECUTION_PLAN (T5.8 DONE, next T5.9, STATUS T5.1–T5.8), PROJECT_STATUS (Current Task T5.9, 205/205/28), NEXT_STEPS.md, CHANGELOG.

Next:
- **T5.9 - Provenance**: garantizar que el resultado del intake manual y el estado registral derivado expongan full provenance (`source/source_url/retrieved_at/confidence/verification/parser_version`) en su superficie. Acotar alcance al iniciar (T5.9 sin definir en el plan).

## 2026-09-19 - OpenCode - Gobernanza y producto (definición Land Intelligence)

- Tarea SOLO documental (sin implementación) aprobada por el usuario:
  formalizar la nueva definición de producto y la gobernanza de seguridad/datos.
- Nuevos docs:
  - `docs/PRODUCT.md` — producto **Land Intelligence** (plataforma de
    investigación y due diligence de predios); entradas A (publicaciones) y B
    (predio solicitado sin Listing); **no asumir Listing = Property =
    ResearchCase**; flujos; módulo Buscar Predio; expediente `/investigaciones/:id`;
    Due Diligence PRO (dimensiones A–I); planes FREE/BASIC/PRO/PROFESSIONAL
    (conceptuales, DECISION REQUIRED precios); regla de riesgos
    HECHO/SEÑAL/INTERPRETACIÓN/REQUIERE VERIFICACIÓN/OPINIÓN PROFESIONAL.
  - `docs/RESEARCH_GOVERNANCE.md` — entidades separadas, regla de riesgos,
    provenance obligatoria, historial PROPERTY/RESEARCH_CASE/RESEARCH_RUN.
  - `docs/UX_ARCHITECTURE.md` — navegación (Dashboard/Buscar predio/Mis
    investigaciones/Predios guardados/Mercado/Cuenta/Administración) y
    expediente (11 secciones).
  - `docs/DATA_GOVERNANCE.md` — ciclo de vida del dato, provenance/cumplimiento,
    retención DECISION REQUIRED.
  - `docs/SECURITY.md` — auth, RBAC server-side (roles
    USER/CUSTOMER/PROFESSIONAL/STAFF/ADMIN/SUPER_ADMIN), anti-IDOR/BOLA,
    entitlements sin hardcodear planes, ASVS L2, eventos de auditoría nuevos
    (LOGIN/DOCUMENT_ACCESSED/AUTHORIZATION_DENIED/etc.), protección del know-how,
    Decision Gates.
- AGENTS.md: producto definido en §1, reglas de know-how/riesgos en §3 (item 6),
  Decision Gates de producto/seguridad en §2.3-bis (auth, pagos, acceso
  comercial, automatización SUNARP/SPRL/BGR/CEJ, documentos, datos personales,
  identidad, APIs públicas, cloud/costos), árbol §4 e índice §7 con los 5 docs.
- PROJECT_EXECUTION_PLAN.md (VERSION 1.0 → 1.1): cabecera corregida a
  PHASE 5 (T5.1–T5.8 DONE) + Previous Completed incluye PHASE 3 y PHASE 4;
  nueva etapa transversal **PHASE 5.5 — Research Platform UX + Identity**
  (RP.1 Domain model … RP.11 End-to-end testing), STATUS: PLANNED, ninguna
  subfase implementada.
- PROJECT_STATUS.md (2026-09-19): sección "Gobernanza y producto" +
  DECISION REQUIRED (research_runs, auth provider, pagos, retención, acceso
  comercial, documentos) + Known Issues (producto documentado, no implementado
  en UI; `users` solo auditoría).
- NEXT_STEPS.md y ROADMAP.md actualizados (etapa transversal PLANNED).
- No se tocó código de producción: la suite de tests sigue **205/205 (28 files)**;
  typecheck server+root y build sin cambios (no se ejecutó build porque no hay
  cambios de código).

Next:
- **T5.9 - Provenance** (Fase 5): ver arriba. Tras ella, T5.10 y T5.11; luego
  las subfases RP.1–RP.11 de la etapa transversal requieren aprobación
  explícita (Decision Gates de AGENTS.md §2.3-bis).

## 2026-09-19 - OpenCode - Fase 5 / T5.9 (Provenance - superficie del intake)

- Alcance acotado con el usuario (T5.9 sin definir en el plan): **bloque de
  provenance en la superficie**, sin migración ni DB.
- `sunarp-historical.ts`: nuevo tipo `IntakeProvenance`
  (`{ source, sourceUrl, retrievedAt, confidence, verification, parserVersion }`)
  y `RegistryHistoricalState.provenance` — la derivación del estado registral se
  marca **`source: 'sunarp'`, `verification: 'inferred'`** (derivación del
  sistema, nunca un HECHO verificado; regla de `docs/RESEARCH_GOVERNANCE.md` §2).
  `deriveHistoricalState(titles, charges, provenance?)` acepta overrides
  parciales de provenance.
- `remate-manual.ts` (`planRemateIntake`):
  - `RemateManualNormalized.provenance` — intake tal como lo ingresó el humano:
    `source: 'manual'`, `sourceUrl` = `sourceUrlPdf` del aviso (o null),
    `confidence: 'medium'`, `verification: 'reported'`,
    `parserVersion: 'manual-v1'`.
  - `RegistryPlanRow.provenance` — fila registral a persistir: `source: 'remaju'`,
    `parserVersion: SUNARP_PARSER_VERSION` (clave canónica/captura SUNARP v1),
    mismo `sourceUrl`/`retrievedAt`.
  - `planRemateIntake(input, retrievedAt? = new Date())`: un único `retrievedAt`
    ISO se propaga a los tres bloques (normalized, registry, historical).
- El provenance viaja en **la superficie** del resultado: `RemateIntakeService.complete()`
  lo incluye en `plan` (respuesta de `POST /manual-actions/:id/complete`), en el
  payload de `completeManualAction` (`manual_actions.result` →
  `research_results.data` vía `recordResearchResult`, persistencia existente) y
  en `registry_properties.raw_data`.
- Tests (+5): `remate-manual.test.ts` (+2: superficie normalized/registry/
  historical con `retrievedAt` fijo y `sourceUrl`; sin PDF → `sourceUrl null`),
  `sunarp-historical.test.ts` (+2: bloque completo con `retrievedAt` fijo +
  override parcial), `remate-intake.service.test.ts` (+1: provenance en
  `result.plan` y en el payload de `completeManualAction` + raw_data del
  registry). Se ajustó el `toEqual` del test histórico de T5.8 para incluir el
  nuevo bloque.
- Suite **210/210 (28 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.9 DONE + sección), PROJECT_EXECUTION_PLAN (T5.9 DONE,
  next T5.10, STATUS T5.1–T5.9), PROJECT_STATUS (Current Task T5.10,
  210/210/28), NEXT_STEPS.md, AGENTS.md (Estado Actual), CHANGELOG.

Next:
- **T5.10 - Manual actions** (Fase 5): cerrar el ciclo de acciones manuales de
  SUNARP en la plataforma. Aún sin definir en el plan → acotar alcance al
  iniciar (candidato: guía/URL del analista en la UI `/manual-actions` y
  verificación de la acción tras el intake).

## 2026-09-19 - OpenCode - Fase 5 / T5.10 (Manual actions - Intake SUNARP end-to-end)

- Alcance acotado con el usuario (T5.10 sin definir en el plan): **"Intake
  SUNARP end-to-end"** — cerrar el ciclo de acciones manuales de SUNARP dentro
  de la plataforma, sin nueva infraestructura (reutiliza intake y persistencia
  existentes).
- `connectors/base.ts`: nuevo campo opcional `ConnectorStatus.url` — la
  superficie oficial que el operador debe abrir cuando la fuente exige acción
  manual. `sunarp.ts` → `SUNARP_CONOCE_AQUI_URL`; `sunarp-sprl.ts` →
  `SUNARP_SPRL_URL`.
- `orchestrator.ts` (`executeConnectorTask`): la `manual_action` creada al caer
  en `requires_manual_action` ahora lleva `url: status.url` (kind `login`,
  `source` sunarp/sunarp_sprl). Antes la acción no tenía URL y el operador debía
  buscar el servicio a mano.
- UI `/manual-actions` (`remate-intake.routes.ts`): tarjetas de acción con badge
  de `actionKind`, link "abrir servicio" (URL) e instrucciones; al seleccionar
  una acción SUNARP se habilita el panel **Captura registral SUNARP** con
  titulares/cargas/títulos (JSON) + URL consultada. Los JSON se validan
  (`parseJsonList`) y se envían en `payload` (mismo shape que la captura T5.4);
  el resultado muestra `owners/charges/titlesPersisted`. Antes el formulario era
  solo REM@JU.
- **Atribución real de la captura** (regla de trazabilidad AGENTS §3.5): antes
  toda captura manual se registraba como `manual`/`remaju` aunque viniera de
  SUNARP. Ahora `planRemateIntake(input, retrievedAt?, context)` acepta un
  `IntakeContext { source, url }`; `RemateIntakeService.complete` lo deriva del
  `source` de la manual action (`resolveCaptureSource`). Para capturas SUNARP
  fija `source: 'sunarp'/'sunarp_sprl'/'sunarp_bgr'` con `parserVersion: 'v1'`
  (SUNARP_PARSER_VERSION) en `RemateManualNormalized.provenance` y en
  `RegistryPlanRow.source/provenance`; `sourceUrl` = `sourceUrlPdf` del operador
  o la URL del contexto. REM@JU conserva provenance `manual`/`remaju` y el
  estado derivado sigue marcándose `sunarp` + `verification: 'inferred'`.
- Tests (+3 netos, 1 archivo nuevo): nuevo `sunarp-intake.test.ts` (E2E offline:
  tarea `registry` → manual action con URL → operador completa captura →
  `registry_properties` + titulares/cargas/títulos persistidos → task settled →
  provenance de la captura en `research_results.data`), +2 `remate-manual.test.ts`
  (contexto SUNARP; precedencia `sourceUrlPdf` sobre la URL del contexto),
  `sunarp.test.ts`/`sunarp-sprl.test.ts` (url en `getStatus`/manual action),
  `remate-intake.routes.test.ts` (header de la UI).
- Suite **213/213 (29 files)**; typecheck server+root y build OK.
- Docs: SUNARP.md (T5.10 DONE + sección), PROJECT_EXECUTION_PLAN (T5.10 DONE,
  next T5.11, STATUS T5.1–T5.10), PROJECT_STATUS (Current Task T5.11,
  213/213/29 + bullet T5.10), NEXT_STEPS.md, AGENTS.md (Estado Actual + conteo),
  CHANGELOG.

Next:
- **T5.11 - Tests** (Fase 5): pasada de pruebas integral de SUNARP (regresión
  del ciclo T5.1–T5.10). Aún sin definir en el plan → acotar alcance al iniciar;
  tras ella quedan las subfases RP.1–RP.11 de PHASE 5.5 (PLANNED, requieren
  aprobación explícita + Decision Gates AGENTS.md §2.3-bis).

## 2026-09-19 - OpenCode - Fase 5 / T5.11 (Tests - acceptance integral SUNARP) — Fase 5 COMPLETED

Completed:
- Nuevo `server/tests/sunarp-acceptance.test.ts` (5 tests) — acceptance/regresión
  integral de la fase SUNARP (T5.1–T5.10), **offline y sin red**. Consolida las
  garantías de la fase en un solo lugar:
  1. **Postura honesta + cero red**: `sunarp` y `sunarp_sprl` →
     `requires_auth` + `requiresManualAction` + `url`
     (`SUNARP_CONOCE_AQUI_URL`/`SUNARP_SPRL_URL`), `search()`/`getDetails()`
     vacíos (anti-datos-inventados) y un spy de `fetch` que lanza si alguien
     intenta red → `expect(fetchSpy).not.toHaveBeenCalled()`.
  2. **Pipeline del fixture real** `registry-capture.json`: partida canónica
     `P-01234567`, 2 titulares, 2 cargas, estado derivado `cargado`
     (`activeCharges` 1, `totalActiveDebtPen` 1234567.89,
     `totalActiveDebtUsd` 0) y provenance de superficie
     `sunarp`/`reported`/`v1` con el estado derivado en `inferred`.
  3. **Atribución de la fuente de captura**: por defecto `manual`/`remaju`;
     explícita `sunarp`/`sunarp_sprl`/`sunarp_bgr` (nunca `manual` en la
     superficie del intake SUNARP).
  4. **Ciclo manual completo de la variante SPRL (de pago)**: manual action
     `source: 'sunarp_sprl'` + URL SPRL → captura (titular + hipoteca) →
     `registry`/provenance `sunarp_sprl` y task `completed`.
  5. El singleton `sunarpConnector` expone la misma URL de Conoce Aquí.
- Sin cambios de código productivo (solo test nuevo).
- Suite **218/218 (30 files)**; typecheck server+root y build OK. **Fase 5
  cerrada.**
- Docs: SUNARP.md (T5.11 DONE + header Fase 5 COMPLETED),
  PROJECT_EXECUTION_PLAN (PHASE 5 COMPLETED, T5.11 DONE, siguiente PHASE 5.5),
  PROJECT_STATUS (218/218/30, Current Task T5.11 DONE, Next Task PHASE 5.5),
  NEXT_STEPS.md, AGENTS.md (Estado Actual + conteo 218 + inventario de test),
  ROADMAP.md, CHANGELOG.

Findings:
- La fase SUNARP queda con 11 subfases verificadas end-to-end sin red; la
  variante SPRL de pago reutiliza exactamente el mismo ciclo manual (la única
  diferencia es la fuente atribuida), lo que valida el diseño de T5.10.

Next:
- **PHASE 5.5 — Research Platform UX + Identity** (PLANNED): comenzar por RP.1
  requiere aprobación explícita y Decision Gates (AGENTS.md §2.3-bis:
  autenticación, pagos/planes, acceso comercial a fuentes, documentos, datos
  personales). Acotar alcance al iniciar. Decisiones pendientes: tabla
  `research_runs`, proveedor de autenticación, pagos/planes, acceso comercial a
  fuentes, almacenamiento de documentos, retención/borrado de datos.

## 2026-09-19 - OpenCode - Fix out-of-band (Scout Legacy): enlaces de publicaciones en búsqueda por GRUPOS

Contexto / Decision Gate:
- El usuario reportó que en el panel Scout (8787) los enlaces de publicaciones
  de **GRUPOS** abren el grupo o su búsqueda interna en lugar de la publicación.
- **Aprobación explícita del usuario** (AGENTS.md §2.3: tocar `src/` y
  `data/scout.db`) y elección del enfoque **híbrido 1+3 (+2 backfill)**:
  1) mejorar la extracción del permalink, 3) etiquetar honestamente los enlaces
  no-directos en la UI, 2) backfill de filas históricas.

Diagnóstico (solo lectura sobre `data/scout.db`, 6243 listings):
- 956 filas `fuente=grupo`: solo **50 (5.2%)** tenían permalink real
  `/groups/{gid}/posts/{pid}`; 409 a `/groups/{gid}/search/?q=…`; 497 a la raíz
  del grupo. Crónico por día.
- Causa raíz: en el feed de grupos Facebook ya no expone de forma fiable el
  anchor `<a href="/groups/…/posts/…">`; `readGroupCards` (`src/extract.ts`) caía
  a un **href sintético** (`/search/?q=` o raíz) y `src/panel.html` lo mostraba
  como si fuera la publicación ("👥 Solo grupo" para la raíz pero `Ver →` para
  la búsqueda).

Implementación:
- `src/links.ts` (nuevo, puro): `isCanonicalPermalink()` /
  `classifyPublicationUrl()` → `permalink | search | group_root | direct`.
- `src/extract.ts`: nuevo helper `postIdFromDataFt()` que lee el id real del post
  desde los atributos `data-ft` (`top_level_post_id` > `mf_story_key` >
  `story_fbid` > `post_id`) y construye el permalink aunque no exista anchor;
  se prefiere el permalink del anchor cuando su score es válido y se cae a
  `data-ft` cuando el anchor es de comentario o inexistente.
- `src/searchers.ts`: `cardToRow` persiste `link_status`; el patch de
  `storeRows` promueve a `permalink` cuando una pasada posterior sí trae el
  enlace; `hasPermalink` usa el helper canónico. Nuevo `recoverGroupLinks(page,
  group, url)` (backfill en vivo).
- `src/panel.html`: la etiqueta usa `row.link_status` (con respaldo por regex):
  permalink → `Ver →`; búsqueda → `🔎 Buscar en grupo`; raíz → `👥 Solo grupo`
  (atenuado, con tooltip de "sin enlace directo").
- `src/migrate-links.ts`: además de corregir URLs, etiqueta `link_status` en las
  filas de grupo (no destructivo).
- `src/exportCsv.ts`: columna `link_status`.
- `package.json`: scripts `migrate:links` y `recover:links`;
  `src/recover-links.ts` (nuevo) re-visita los grupos con la sesión existente y
  actualiza filas sin permalink (backfill en vivo, requiere login).

Verificado:
- Typecheck raíz (`tsc --noEmit`) OK.
- `migrate:links` ejecutado (respaldo previo de `scout.db` en temp):
  **956 filas etiquetadas**, 499 URLs raíz→búsqueda corregidas. Distribución
  final `link_status`: 906 `search` + 50 `permalink` (los permalinks reales no se
  tocaron).
- Suite server **218/218 (30 files)**; typecheck server+root; build OK (el fix
  no toca el servidor).

Findings / limitaciones:
- La mejora de extracción (`data-ft`) y el backfill en vivo **no son
  verificables offline**: requieren una corrida real con sesión de Facebook
  (`npm.cmd run recover:links`). Los permalinks históricos que ya no aparecen en
  el feed no se recuperan (quedan etiquetados como `search`, honestamente).

Next:
- **PHASE 5.5 — Research Platform UX + Identity** (PLANNED): requiere aprobación
  explícita y Decision Gates (AGENTS.md §2.3-bis).
