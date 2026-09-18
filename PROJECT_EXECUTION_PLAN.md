# LAND INTELLIGENCE
# PROJECT EXECUTION PLAN

VERSION: 1.0
STATUS: ACTIVE

Este documento es la fuente principal para determinar qué debe
implementarse después.

Un agente debe:

1. leer este documento
2. localizar CURRENT PHASE
3. encontrar la primera tarea TODO/BLOCKED
4. verificar dependencias
5. implementar únicamente esa tarea
6. marcarla como DONE
7. documentar el resultado
8. continuar con la siguiente tarea solamente si está permitido

============================================================
PROJECT STATE
============================================================

Current Phase:
PHASE 3 — RESEARCH ENGINE HARDENING

Previous Completed:
PHASE 0 — LOCAL INFRASTRUCTURE
PHASE 1 — FOUNDATION / ARCHITECTURE
PHASE 2 — PROPERTY IDENTITY / INGESTION
PHASE 2.5 — END-TO-END VALIDATION

Current Objective:

Construir un motor de investigación inmobiliaria sólido,
idempotente, observable y preparado para incorporar fuentes
externas progresivamente.

============================================================
GLOBAL ARCHITECTURE
============================================================

Frontend
    ↓
Fastify API
    ↓
Domain Services
    ↓
Research Engine
    ↓
BullMQ
    ↓
Workers
    ↓
Connectors
    ↓
PostgreSQL + PostGIS
    ↓
Storage

============================================================
PHASE 0 — LOCAL INFRASTRUCTURE
============================================================

STATUS: DONE

Docker:
DONE

PostgreSQL + PostGIS:
DONE

Redis:
DONE

Isolation from CAST ERP:
DONE

Tests:
DONE


============================================================
PHASE 1 — FOUNDATION
============================================================

STATUS: DONE

Architecture:
DONE

Database:
DONE

PostGIS:
DONE

Connector architecture:
DONE

Research architecture:
DONE

Documentation:
DONE


============================================================
PHASE 2 — PROPERTY IDENTITY
============================================================

STATUS: DONE

SQLite ingestion:
DONE

Deduplication:
DONE

Property unification:
DONE

OSM connector:
DONE

Geocoding worker:
DONE

Research worker:
DONE

Property Intelligence Drawer:
DONE


============================================================
PHASE 2.5 — END-TO-END VALIDATION
============================================================

STATUS: DONE

Docker validation:
DONE

PostgreSQL validation:
DONE

Redis validation:
DONE

SQLite ingestion:
DONE

4,152 listings processed

4,025 properties

Idempotency:
VERIFIED

Geocoding:
VERIFIED

PostGIS:
VERIFIED

Error handling:
VERIFIED

Observability:
VERIFIED

Tests:
40/40

============================================================
PHASE 3 — RESEARCH ENGINE
============================================================

STATUS: CURRENT

OBJECTIVE:

Crear un motor de investigación estable que pueda ejecutar
múltiples tareas sobre una PROPERTY sin duplicaciones,
manteniendo estado, provenance, errores y resultados.

------------------------------------------------------------
T3.1 — ResearchCase lifecycle
------------------------------------------------------------

STATUS: DONE

Objetivo:

Verificar y endurecer el lifecycle:

created
queued
running
completed
partial
failed

Criterios:

- transiciones válidas
- timestamps
- errores
- warnings
- retry
- idempotencia

Resultado (2026-09-17):

- `research_status` extendido (no destructivo, ADD VALUE) con
  `created`, `queued`, `partial`; default de nuevas cases: `created`;
  `pending` conservado para filas legacy.
- Nuevo módulo `server/src/domain/research/lifecycle.ts`: tabla de
  transiciones válidas, `assertCaseTransition()`, `transitionCase()`
  (UPDATE condicional race-safe) y `updateCaseProgress()`.
- Caso: `created → queued (al encolar) → running (startedAt) →
  completed | partial | failed`; estados terminales inmutables;
  `completedAt` + `summary` al terminar.
- Idempotencia: el worker omite cases terminales re-entregadas.
- `errorCount` = tareas failed; `warningCount` = tareas
  requires_manual_action + blocked + unavailable.
- DTO `ResearchCase` expone `updatedAt`.
- Migraciones `0001_research_lifecycle_enums.sql` y
  `0002_research_lifecycle_default.sql` (aplicadas en transacciones
  separadas por el límite ADD-VALUE de PostgreSQL 16).

------------------------------------------------------------
T3.2 — ResearchTask lifecycle
------------------------------------------------------------

STATUS: DONE

Objetivo:

Verificar:

pending
running
completed
failed
requires_manual_action
unavailable
blocked

Agregar constraints si son necesarios.

Resultado (2026-09-17):

- Nuevo módulo `server/src/domain/research/task-lifecycle.ts`: tabla
  `TASK_TRANSITIONS` (8 estados), `assertTaskTransition()` y
  `transitionTask()` (UPDATE condicional race-safe, estados inmutables
  protegidos). Conjuntos `TASK_TERMINAL`, `TASK_SETTLED`, `TASK_DONE` y
  `TASK_WARNING`.
- Inmutables: `completed`, `skipped`. Reintentables: `failed`, `blocked`,
  `unavailable`, `requires_manual_action` (vuelven a pending/running,
  limpian completedAt y suman 1 a `retryCount` hasta `maxRetries`).
- Automación: `startedAt` (running o final sin pasar por running),
  `completedAt` (trabajo automatizado terminado; nunca en
  requires_manual_action), `completed` limpia error/requiresManualAction,
  requires_manual_action activa el flag.
- `lifecycle.ts`: `updateCaseProgress()` usa `isTaskSettled()` /
  `TASK_WARNING` desde task-lifecycle.ts (fuente única de verdad).
- Workers: research.worker.ts (identity→completed con resultReference;
  stubs→unavailable) y geocoding.worker.ts (markGeolocationTask)
  migrados a `transitionTask()`.
- DTO `ResearchTaskDTO` expone `retryCount`, `maxRetries` y `updatedAt`.
- Sin migración: el enum `task_status` ya cubría los 8 estados.
- Tests 50/50 (6 nuevos en task-lifecycle.test.ts); typecheck server+root,
  build OK. Sin smoke test en vivo (Postgres 5433/Redis 6380 detenidos).

------------------------------------------------------------
T3.3 — Research orchestration
------------------------------------------------------------

STATUS: DONE

Objetivo:

Crear flujo:

PROPERTY
↓
ResearchCase
↓
ResearchTasks
↓
BullMQ
↓
Workers
↓
ResearchResults

Debe soportar ejecución parcial.
Una fuente caída NO debe detener toda la investigación.

Resultado (2026-09-17):

- Flujo end-to-end implementado: `PROPERTY → ResearchCase → ResearchTasks → BullMQ → Workers → ResearchResults`.
- Nuevo módulo `server/src/domain/research/orchestrator.ts`:
  - `ResearchOrchestrator` y `orchestrateResearchCase()`.
  - **Aislamiento de fallos (Fault Isolation)**: ejecución individual de tareas con `try/catch` aislado. Si un conector o fuente externa cae (timeout, error HTTP, `ECONNREFUSED`), la tarea pasa a `failed` y el orquestador continúa con las demás sin abortar el caso.
  - **Ejecución parcial (Partial Execution)**: `updateCaseProgress()` detecta cuando todas las tareas están settled; si `errorCount > 0`, el caso transiciona automáticamente a `partial` con resumen honesto (`Caso con ejecución parcial: X tarea(s) con error`).
  - **Proveniencia de Resultados**: tareas completadas registran filas en `research_results` (`source`, `dataType`, `data`, `confidence`, `verification`, `parserVersion`) y vinculan `resultReference` en la tarea.
  - **Idempotencia**: casos terminales y tareas ya asentadas (`settled`) se omiten ante re-entregas de BullMQ.
- `ResearchService`:
  - `getResults()` corregido para consultar `inArray(researchResults.researchTaskId, taskIds)` devolviendo resultados multi-tarea (antes sólo tomaba la primera tarea `taskIds[0]`).
  - `executeResearch()` expone orquestación a nivel de dominio.
- `research.worker.ts`: refactorizado para delegar en `ResearchOrchestrator` (`skipGeolocation: true`).
- `geocoding.worker.ts`: registra resultados en `research_results` con `resultReference` y boundary resiliente ante excepciones inesperadas.
- Tests 57/57 (7 nuevos tests en `server/tests/orchestrator.test.ts`); typecheck server+root y build OK.

------------------------------------------------------------
T3.4 — Manual Action
------------------------------------------------------------

STATUS: DONE

Crear mecanismo genérico para fuentes que requieren:

CAPTCHA
LOGIN
PAYMENT
USER ACTION

Debe existir:

requires_manual_action

y datos como:

instructions
url
requested_at
completed_at
completed_by
result

Resultado (2026-09-17):

- Tabla `manual_actions` (28.ª tabla del esquema) con 2 enums nuevos:
  `manual_action_kind` (`captcha`, `login`, `payment`, `user_action`, `other`)
  y `manual_action_status` (`requested`, `completed`, `cancelled`) → 19 enums
  en total.
- Migration `server/drizzle/0003_natural_mysterio.sql` generada con
  `npm run db:generate` (crea enums + tabla + 2 FKs + 3 índices).
- Nuevo servicio `server/src/domain/research/manual-action.service.ts`
  (`ManualActionService`): `requestManualAction` (idempotente por tarea),
  `getManualAction`, `listManualActions` (filtros status/propertyId/task),
  `completeManualAction` (registra `research_results` con source `manual`,
  `verification='verified'`, `confidence='high'`, audita
  `manual_result_entered`, transiciona la tarea
  `requires_manual_action → completed` con `resultReference` y refresca el
  caso) y `cancelManualAction`.
- Wiring: `ResearchOrchestrator.executeConnectorTask` solicita acción manual
  para fuentes con `requires_manual_action`/`requires_auth` (login → `login`,
  resto → `user_action`, source = sourceId) y para geolocalización sin
  dirección geocodificable (source `system`); `geocoding.worker.ts` solicita
  acción manual cuando la tarea queda en `requires_manual_action`.
- `task-lifecycle.ts`: nuevo borde directo `requires_manual_action → completed`
  (resultado ingresado por humano).
- DTO `ManualActionDTO` expuesto en `server/src/dto/index.ts`.
- Tests 67/67 (9 nuevos en `server/tests/manual-action.test.ts`); typecheck
  server + root y build del server OK.

------------------------------------------------------------
T3.5 — Research Result provenance
------------------------------------------------------------

STATUS: DONE

Asegurar:

source
source_url
retrieved_at
confidence
verification_status
raw_data
normalized_data
parser_version

Resultado (2026-09-17):

- Nuevo módulo `server/src/domain/research/result-provenance.ts`
  (`recordResearchResult`): única ruta de código para TODOS los productores de
  `research_results`. Normaliza/garantiza los 8 campos de provenance en cada
  insert: `source`, `source_url`, `retrieved_at` (default now), `confidence`
  (default `unknown`), `verification` (default `reported`), `raw_data` (default
  null), `data` normalizado (default `{}`) y `parser_version` (default `v1`).
- Refactorizado los 6 puntos de inserción para usar el helper:
  1. `ResearchOrchestrator.executeIdentityTask` (source `system`, rawData ahora
     con snapshot del property: status/prices/reportedSource).
  2. `executeGeolocationTask` verificado (rawData con locationSource/
     locationVerification).
  3. `executeGeolocationTask` vía OSM real (rawData displayName + sourceUrl).
  4. `executeConnectorTask` (ya usaba rawData).
  5. `geocoding.worker.markGeolocationTask` (rawData sourceUrl).
  6. `ManualActionService.completeManualAction` (rawData = resultado ingresado,
     provenance `verified`/`high`, metadata manualActionId + externalSource).
- DTO `ResearchResultDTO` ahora expone `rawData` y `metadata` (además de
  `source`, `sourceUrl`, `retrievedAt`, `data`, `confidence`, `verification`,
  `parserVersion`), y `service.toResultDTO` los mapea.
- Sin migración: la tabla ya contenía todas las columnas de provenance
  (`source_url`, `retrieved_at`, `raw_data`, `data`, `confidence`,
  `verification`, `parser_version`).
- Tests 69/69 (2 nuevos en `server/tests/provenance.test.ts` + aserciones de
  provenance añadidas a orchestrator/manual-action/schema tests); typecheck
  server + root y build del server OK.

------------------------------------------------------------
T3.6 — Research API
------------------------------------------------------------

STATUS: DONE

Verificar:

POST /properties/:id/research
GET /properties/:id/research
GET /research/:id
GET /research/:id/tasks
GET /research/:id/results

Resultado (2026-09-17):

- Los 5 endpoints existen en `server/src/domain/research/routes.ts` y quedaron
  endurecidos:
  - `GET/POST /api/v1/properties/:id/research`: aceptan UUID o ID legacy de
    SQLite (resolución on-the-fly); POST responde 201 y pasa el caso a `queued`
    sólo si se encoló al menos un job (si no, queda `created`).
  - `GET /api/v1/research/:id`, `/tasks` y `/results`: validan que el `:id` sea
    UUID (si no, **400** con `{ error: 'Invalid research case id (expected UUID)' }`)
    y devuelven **404** `{ error: 'Research case not found' }` para casos
    inexistentes (antes `/tasks` y `/results` devolvían `[]` y un id malformado
    provocaba un error 500 de PostgreSQL).
- `researchRoutes(app, deps)` acepta `service` y `db` inyectables (default:
  `ResearchService` real y `getDb()`), habilitando tests HTTP sin base de datos.
- Tests 76/76 (7 nuevos en `server/tests/research-api.test.ts` cubriendo los 5
  endpoints + 400/404); typecheck server + root y build del server OK.

------------------------------------------------------------
T3.7 — Research Drawer
------------------------------------------------------------

STATUS: DONE

Mostrar:

ResearchCase
Tasks
Progress
Errors
Warnings
Sources
Manual actions
Results

Resultado (2026-09-17):

- `src/panel.html` (Scout Legacy, cambio autorizado explícitamente por el
  usuario — Decision Gate 2.3): el Property Intelligence Drawer ahora muestra:
  - **ResearchCase**: badge del caso con progreso `done/total`, y al abrir el
    drawer se reanuda el caso más reciente vía
    `GET /properties/:id/research` (`resumePropertyResearch`).
  - **Tasks / Progress**: badges por tarea (ya existentes) actualizados por
    polling de `GET /research/:id/tasks`.
  - **Errors / Warnings / Manual actions**: nueva sección "Avisos y Acciones
    Manuales" (`renderDrawerAlerts`) que lista tareas `failed` (error),
    `requires_manual_action` (descripción de la acción, sólo lectura — no hay
    ruta HTTP de resolución todavía) y `unavailable` (fuente stub).
  - **Results**: nueva sección "Resultados y Evidencia" (`renderDrawerResults`)
    agrupada por `dataType`, con `source`/`sourceUrl`, `confidence`,
    `verification`, `retrievedAt`, `parserVersion` y vista previa de `data`.
  - **Sources**: se mantiene el panel de conectores (`GET /sources`).
- `startResearchPolling` consulta en paralelo `/tasks` y `/results` y se detiene
  al terminar las tareas una vez cargados los resultados; se agregó `escAttr`
  para escapar URLs en atributos.
- Sin cambios en el servidor ni en tests (76/76 siguen pasando); typecheck de la
  raíz OK y sintaxis de ambos bloques `<script>` validada con `node --check`.

------------------------------------------------------------
T3.8 — Research tests
------------------------------------------------------------

STATUS: DONE

Tests:

- full research
- partial research
- failed task
- unavailable source
- retry
- duplicate research
- manual action
- timeout

Resultado (2026-09-17):

- Nuevo `server/tests/research-flows.test.ts` (9 tests) que ejecuta el código
  real (orchestrator, lifecycle, service) contra una base in-memory que evalúa
  los WHERE de Drizzle:
  - **full research**: 8 tareas → case `completed`, 8/8, warningCount 6
    (conectores stub + market + risk), 2 resultados con provenance.
  - **partial research**: una tarea falla y el resto completa → case `partial`,
    errorCount 1, el identity sigue `completed`.
  - **failed task**: el error de la fuente queda persistido en la tarea
    (`status=failed`, `error`, `completedAt`) y el caso no aborta.
  - **unavailable source**: conector stub → tarea `unavailable`, cuenta como
    warning, no como error.
  - **retry**: `failed → running` incrementa `retryCount`, limpia `completedAt`
    y fija `startedAt`.
  - **duplicate research**: dos `createResearch` producen dos casos
    independientes con 8 tareas cada uno (no hay dedup implícito).
  - **manual action**: geolocalización sin dirección/distrito → tarea
    `requires_manual_action` + fila en `manual_actions`; el caso igualmente
    termina `completed` con warning (una acción pendiente no lo deja colgado).
  - **timeout**: una fuente que expira (`ETIMEDOUT`) no detiene las demás
    tareas; el caso queda `partial`.
  - Extra: un caso con **todas** las tareas fallidas queda `partial` (no existe
    transición a `failed` desde `updateCaseProgress`).
- Suite 85/85 (13 archivos); typecheck server + root y build del server OK.

Hallazgos (documentados, NO corregidos para no inventar comportamiento en una
tarea de tests):
- `createResearch` no deduplica investigaciones activas del mismo inmueble.
- `transitionTask` no aplica `maxRetries` (el tope sólo se expone en el DTO).
- No hay timeout activo en el orquestador; un timeout llega como error del
  conector y se registra como tarea fallida.
- `updateCaseProgress` nunca marca un caso como `failed` (usa `partial`).

------------------------------------------------------------
T3.9 — Research documentation
------------------------------------------------------------

STATUS: DONE

Actualizar:

docs/RESEARCH_ENGINE.md
docs/API.md
docs/NEXT_STEPS.md

Resultado (2026-09-17):

- `docs/RESEARCH_ENGINE.md`: nueva **§8 Cobertura de Pruebas (T3.8)** con la
  tabla de escenarios y las limitaciones conocidas; §2 referencia la prioridad
  real asignada por `createResearch`; §4 aclara que `failed` no se produce hoy
  desde `updateCaseProgress`; §5 corrige "reintentos agotados" / `maxRetries`
  (no aplicado) y el caso de timeout.
- `docs/API.md`: §4 corrige el tope `maxRetries` (expuesto, no aplicado) y
  enlaza a `RESEARCH_ENGINE.md` §5/§8.
- `docs/NEXT_STEPS.md`: sección 2.13 con el cierre de Fase 3, header actualizado
  y próxima iteración apuntando a Fase 4 (sujeta a aprobación por Decision Gate
  de nuevo proveedor externo).

Fin de la Fase 3 (Research Engine Hardening). La Fase 4 requiere aprobación
explícita (Decision Gate: nuevo proveedor de datos externo).

============================================================
PHASE 4 — REM@JU
============================================================

STATUS: PLANNED

OBJECTIVE:

Conectar información pública de remates judiciales de manera
legal y respetando mecanismos de acceso.

Tasks:

T4.1 discovery
T4.2 parser
T4.3 normalization
T4.4 deduplication
T4.5 Property linking
T4.6 research connector
T4.7 manual action handling
T4.8 tests
T4.9 monitoring

No bypass CAPTCHA.

============================================================
PHASE 5 — SUNARP
============================================================

STATUS: PLANNED

Dividir:

T5.1 Conoce Aquí
T5.2 Consulta de Propiedad
T5.3 SPRL
T5.4 Registry normalization
T5.5 Owners
T5.6 Charges
T5.7 Titles
T5.8 Historical data
T5.9 Provenance
T5.10 Manual actions
T5.11 Tests

============================================================
PHASE 6 — BGR + GIS
============================================================

STATUS: PLANNED

T6.1 coordinates
T6.2 property point
T6.3 BGR integration
T6.4 polygon
T6.5 geometry validation
T6.6 spatial queries
T6.7 map UI
T6.8 tests

============================================================
PHASE 7 — PDM / IMPLA / PAT
============================================================

STATUS: PLANNED

T7.1 zoning datasets
T7.2 versioning
T7.3 geometry
T7.4 spatial intersection
T7.5 zoning normalization
T7.6 urban parameters
T7.7 UI

============================================================
PHASE 8 — JUDICIAL
============================================================

STATUS: PLANNED

T8.1 case model
T8.2 property association
T8.3 person association
T8.4 manual actions
T8.5 source provenance
T8.6 risk signals

IMPORTANT:

No assumption that a case involving a person affects a property.

============================================================
PHASE 9 — MUNICIPALITY / CATASTRO
============================================================

STATUS: PLANNED

T9.1 cadastral
T9.2 licenses
T9.3 urban parameters
T9.4 tax information where legally available
T9.5 normalization

============================================================
PHASE 10 — MARKET INTELLIGENCE
============================================================

STATUS: PLANNED

T10.1 comparables
T10.2 price/m2
T10.3 temporal history
T10.4 price changes
T10.5 listing age
T10.6 duplicate listings
T10.7 market statistics

============================================================
PHASE 11 — RISK ENGINE
============================================================

STATUS: PLANNED

Rule-based initially.

Categories:

registry
judicial
urban
geographic
market
data-quality

============================================================
PHASE 12 — OPPORTUNITY ENGINE
============================================================

STATUS: PLANNED

Metrics:

market gap
location
urban potential
registry status
data confidence
risk

Avoid opaque scoring initially.

============================================================
PHASE 13 — AI ANALYSIS
============================================================

STATUS: PLANNED

AI reads structured information.

AI does NOT become source of truth.

Possible providers:

Gemini
Claude
OpenAI
Ollama

Use provider abstraction.

============================================================
PHASE 14 — ALERTING
============================================================

STATUS: PLANNED

Alerts:

new listing
price reduction
new remate
registry change
new infrastructure
research complete
risk detected

============================================================
PHASE 15 — GOOGLE CLOUD
============================================================

STATUS: PLANNED

LOCAL
↓
GCP STAGING
↓
GCP PRODUCTION

Target:

Cloud Run
Cloud SQL PostgreSQL + PostGIS
Redis
Cloud Storage
Secret Manager
Cloudflare
CI/CD

============================================================
PHASE 16 — AI AGENT PLATFORM
============================================================

STATUS: FUTURE

Engineering Agent

Research Agent

DevOps Agent

AI Gateway

Permissions

Audit

Human approval

============================================================
PHASE RULES
============================================================

NEVER:

- skip acceptance criteria
- silently change architecture
- introduce future functionality early
- bypass security
- bypass CAPTCHA
- expose credentials
- destroy production data

ALWAYS:

- test
- document
- preserve provenance
- maintain idempotency
- maintain legacy functionality
- update this document
- create a checkpoint/commit