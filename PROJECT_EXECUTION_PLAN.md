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

STATUS: COMPLETED (2026-09-17)

OBJECTIVE:

Conectar información pública de remates judiciales de manera
legal y respetando mecanismos de acceso.

Tasks:

T4.1 discovery — ✅ DONE (2026-09-17)
T4.2 parser — ✅ DONE (2026-09-17)
T4.3 normalization — ✅ DONE (2026-09-17)
T4.4 deduplication — ✅ DONE (2026-09-17)
T4.5 Property linking + manual intake — ✅ DONE (2026-09-17)
T4.6 research connector — ✅ DONE (2026-09-17)
T4.7 manual action handling — ✅ DONE (2026-09-17)
T4.8 tests — ✅ DONE (2026-09-17)
T4.9 monitoring — ✅ DONE (2026-09-17)
T4.7 manual action handling
T4.8 tests
T4.9 monitoring

No bypass CAPTCHA.

T4.1 discovery — result:

- Portal **REM@JU** (`https://remaju.pj.gob.pe/`, "Remate Electrónico
  Judicial", Poder Judicial del Perú). Reporte completo en
  `docs/REMATE_JUDICIAL.md` (2026-09-17).
- Stack: JSF + PrimeFaces 8.0, app v3.7.1, contexto `/remaju`, WebLogic;
  **Akamai WAF**; sesión por `jsessionid` + `javax.faces.ViewState`.
- Superficie pública (sin login): home `/` y `/remaju/index.xhtml` (carrusel
  "REMATE SIMPLE" con ubicación, fecha, ids `convocatoria`/`remate` e
  `tipoConvocatoria`); `/remaju/pages/publico/informativo.xhtml`.
  Listado/detalle público = AJAX PrimeFaces (sin URL GET estable; una URL
  candidata devolvió 404). Zona autenticada (`faces/page/remaju.xhtml`) =
  "No Autorizado".
- **CAPTCHA en el login** (`/remaju/pages/seguridad/login.xhtml`,
  `frmLogin:imgCaptcha`, input max 5 + "Refrescar"); "Con/Sin Casilla"
  (SINOE); Términos y Condiciones en dialogs. Participación requiere login +
  pago BN → **nunca automatizar**.
- Marco legal: RA Nº 211-2016-CE-PJ / Directiva 008-2016-CE-PJ (REM@JU), arts.
  729–740 CPC (publicidad del remate). Ley 29733 / D.S. 003-2013-JUS →
  minimización de datos personales en lo que almacenemos.
- **Veredicto de viabilidad**: la Fase 4 es viable en modo **solo público**
  (sin CAPTCHA ni autenticación): parser del home + AJAX público con
  ViewState si es alcanzable sin auth/captcha; `manual_actions` para pasos
  autenticados; dedup por ids `remate`/`convocatoria`; linking fuerte por
  partida registral (detalle) y débil por distrito/dirección.
  Complemento oficial: El Peruano "Remates Judiciales" (nota).
- Sandbox/capturas reales necesarias para confirmar el shape exacto del
  detalle público antes de T4.5 (enlace por partida).

T4.2 parser — result:

- Implementado `server/src/connectors/implementations/remaju.ts` (T4.2):
  `RemajuConnector` (PropertyDataSource real, sourceId `remaju`) + parser puro
  exportable `parseRemajuHome()`/`parseFechaRemaju()` sobre la **superficie
  pública del home** (`/remaju/index.xhtml`). Sin login, sin CAPTCHA.
- Extrae del carrusel: `convocatoria`, `tipoConvocatoria`, `remate` (del array
  `pa:` PrimeFaces, aceptando `&quot;` y comillas planas), `tipoLabel`,
  `ubicacion`, `fecha` (dd/MM/yyyy → `fechaISO`), `info`,
  `esUltimoDiaInscripcion`.
- Comportamiento responsable/legal:
  - **Throttle 6 s** entre peticiones (una única sesión; desactivado en
    `NODE_ENV=test`), cookie jar mínimo (`jsessionid`) y UA de identificación.
  - 403/412 (Akamai) → degradación `unavailable`; 429 → `rate_limited`;
    `search()` nunca inventa datos: ante fallo devuelve `items: []`.
  - `search()` filtra por `district`/`query` (case/accent-insensitive) y aplica
    `limit`; externalId `remaju:remate:<id>`; `getDetails()` informa que el
    detalle AJAX queda para T4.5 (found:false).
- Config: `REMAJU_HOME_URL` / `REMAJU_USER_AGENT` en `config.ts` + plantillas
  `.env*.example` y `server/.env`.
- Tests offline **`server/tests/remaju.test.ts`** (11 casos) con `fetch`
  stubbed + **fixture** `server/tests/fixtures/remaju-home.html` (sin red).
  Suite completa: **96/96 (14 archivos)**; typecheck y build del server OK.
- Smoke test en vivo (1? consultas a la página pública): **276 remates**
  parseados del home real (MIRAFLORES/40451/25296), filtro "cusco" → 2 hits,
  `getStatus` → `available`. Ninguna interacción con login/CAPTCHA.

T4.3 normalization — result:

- Nuevo módulo puro `server/src/connectors/implementations/remaju-normalize.ts`:
  - `normalizeRemateSlide(slide, montoRaw?)` → `NormalizedRemate` con shape
    canónico y tipado (apto como `data` de `research_results`, T3.5):
    `remateId`/`convocatoriaId` (números), `tipo` (canónico), `tipoRaw`,
    `ubicacion` (display) + `ubicacionKey` (sin acentos), `fechaISO`,
    `esUltimoDiaInscripcion`, `info`, `moneda` (`PEN`|null), `monto`,
    `parserVersion` (`REMAJU_PARSER_VERSION = 'v1'`).
  - `normalizeTipoConvocatoria(codigo, label)`: canoniza a
    `remate_simple | segunda_convocatoria | tercera_convocatoria | subasta |
    desconocido`, priorizando la etiqueta visible y cayendo al código
    (`1..4`).
  - `normalizeUbicacion()`: Title Case para mostrar + clave sin acentos para
    comparar/dedup.
  - `parseFechaRemaju()` movido aquí con validación básica (día/mes) y `null`
    como “inválido”; re-exportado desde `remaju.ts` por compatibilidad.
  - `parseMontoPEN()`: "S/ 1,234.56", "S/. 900", "1 234,56", …
    (rechaza US$/EUR/€), listo para el detalle T4.5.
- `RemajuConnector.slideToItem` ahora usa el shape normalizado: `district` =
  `ubicacion` display, y `rawData` = `{ ...slide, normalized }`.
- Tests: nuevo `server/tests/remaju-normalize.test.ts` (8 casos). Suite
  completa **104/104 (15 archivos)**; typecheck server+root y build OK.

T4.4 deduplication — result:

- Nuevo módulo puro `server/src/connectors/implementations/remaju-dedup.ts`:
  - `remajuContentHash(normalized)` → SHA-256 hex del contenido canónico
    (reutiliza el patrón `contentHash` de `domain/ingestion/sync.ts`);
    normaliza mayúsculas/espacios para ser estable.
  - `remajuDedupKey()` (identidad principal) y `remajuDedupKeys()`
    (todas las claves de la fila).
  - Claves fuertes por ids del portal: `remate:<id>` > `convocatoria:<id>`;
    fallback `hash:<sha256>` cuando faltan ambos ids.
  - `dedupeEntries()` indexa por **todos** los alias, de modo que una fila con
    `remate`+`convocatoria` empareja con otra parcial (solo un id) o sin ids
    pero de contenido idéntico. Fusiona campos vacíos (`mergeRemate`) sin pisar
    valores presentes y conserva el `raw` de la primera aparición.
  - `dedupeRemates()` (conveniencia sobre `NormalizedRemate`) y
    `REMAJU_DEDUP_VERSION='v1'`.
- `RemajuConnector.search()` ahora normaliza → filtra → **deduplica** →
  mapea; los duplicados descartados se registran en `logger.debug`.
- Tests: `server/tests/remaju-dedup.test.ts` (9 casos: hash determinista y
  sensible, prioridad de claves, fusión, alias cruzados, conector deduplicado).
   Suite completa **113/113 (16 archivos)**; typecheck server+root y build OK.

T4.5 property linking + manual intake — result:

- **T4.5a linking puro**: nuevo
  `server/src/connectors/implementations/remaju-link.ts`:
  - `normalizePartida()` (mayúsculas, sin espacios/guiones/puntos),
    `addressTokens()` (sin acentos, sin stopwords), `overlapRatio()`.
  - `linkRemateToProperties(query, candidates)`: **partida exacta** →
    `matchType: 'partida'`, `confidence: 'high'`, `score: 1`; dirección fuzzy
    (distrito + ratio de tokens ≥ 0.6) → `medium`, si no `low`; solo distrito →
    `0.3`/`low`. Ordenado por score descendente.
  - `pickHardLink()`: solo devuelve enlace si hay partida exacta; **nunca**
    auto-enlaza coincidencias débiles (quedan como candidatos).
- **T4.5b intake manual**: nuevo módulo puro
  `server/src/domain/research/remate-manual.ts` (`planRemateIntake`,
  `composeDireccion`) que normaliza el payload humano (partida, dirección,
  montos, convocatoria, fecha, origen de ubicación y coordenadas) y planifica:
  fila de `registry_properties` (`source: 'remaju'`, `confidence: 'medium'`,
  `verification: 'reported'`), actualización de `properties`
  (`latitude`/`longitude`, `locationSource`/`Confidence`/`Verification`) y
  geocodificación pendiente si no hay coordenadas.
- **Servicio** `server/src/domain/research/remate-intake.service.ts`
  (`RemateIntakeService`, deps inyectables db/manualActions/storage/geocode):
  completa una `manual_action`, persiste partida, aplica ubicación (manual o
  fallback OSM/Nominatim con `confidence: 'low'`), guarda el PDF del aviso en
  storage y registra `external_links` (`linkType: 'remate_pdf'`), y delega el
  cierre en `ManualActionService.completeManualAction()`.
- **Rutas** `server/src/domain/research/remate-intake.routes.ts` + registro en
  `app.ts` (servicio inyectable para tests): `GET /api/v1/manual-actions`
  (+`/:id`), `POST /api/v1/manual-actions/:id/complete` (JSON con PDF base64,
  `bodyLimit` 12 MB, sin nuevas dependencias) y **UI mínima** en
  `GET /manual-actions` (servida por el API, no toca el Scout Legacy).
- **Privacidad**: solo partida, dirección, coordenadas y datos públicos del
  remate; **nunca** datos personales (Ley 29733 / D.S. 003-2013-JUS).
- Tests: `server/tests/remaju-link.test.ts` (6),
  `server/tests/remate-manual.test.ts` (7),
  `server/tests/remate-intake.service.test.ts` (6),
  `server/tests/remate-intake.routes.test.ts` (4). Suite completa
  **136/136 (20 archivos)**; typecheck server+root y build OK.

Siguiente: **T4.6 research connector** (integrar `RemajuConnector` +
`RemateIntakeService` al Research Engine: `TASK_SOURCE_MAP`, `recordResearchResult`,
`requestManualAction` cuando el detalle requiere CAPTCHA).

T4.6 research connector — result:

- La tarea de investigación `judicial` ahora la ejecuta el orquestador contra
  REM@JU (real): `TASK_SOURCE_MAP.judicial = 'remaju'`, nuevo constructor con
  `OrchestratorDeps.remajuSearch` (inyectable en tests; por defecto
  `remajuConnector.search`) y nuevo `executeRemajuTask()` en
  `server/src/domain/research/orchestrator.ts`.
- Nuevo módulo puro `server/src/domain/research/remaju-research.ts`:
  - `toRemateEntry(item)`: extrae los campos normalizados del `rawData` del
    carrusel (partida opcional, ubicación, `ubicacionKey`, fecha, tipo, ids).
  - `planRemajuMatches(property, remates)`: empareja el remate contra la property
    (partida registral fuerte → `partida`/`high`; distrito/dirección débil → `low`)
    usando `remaju-link.ts`; devuelve matches ordenados, `hardMatch`, confidence y
    warnings (p. ej. "la property no tiene partida registral").
- Comportamiento de la tarea:
  - Sin distrito/dirección → `requires_manual_action` (no se puede ubicar).
  - Carrusel sin remates → `completed` con "Sin remates públicos".
  - Match partida → `recordResearchResult` (`source:'remaju'`, `dataType:
    'judicial'`, `confidence` high/low, `verification:'reported'`,
    `parserVersion:'remaju-research-v1'`, matches en `data`) y la tarea se
    completa o pasa a `requires_manual_action` (kind `captcha`, url al home,
    `metadata.resultReference`) si solo hay candidatos débiles.
- `index.ts` registra el conector REM@JU **real** en el registry (reemplaza el
  stub), junto a OSM. El worker de research usa el orquestador (sin cambios).
- Tests: `server/tests/remaju-research.test.ts` (6 casos puros: extracción,
  distrito débil, hard match por partida, warnings, confianza unknown, orden) y
  `server/tests/orchestrator.test.ts` (+3 casos del flujo judicial con
  `remajuSearch` fake: candidatos + manual action, carrusel vacío, property sin
  datos). `research-flows.test.ts` (flujo completo 8 tareas) ahora inyecta un
  `remajuSearch` vacío (sin red en la suite) y verifica `judicial → completed`.
  Suite completa **145/145 (21 archivos)**; typecheck server+root y build OK.

Siguiente: **T4.7 manual action handling** (afinar el ciclo completo
manual: listado/UI ya expuestos en T4.5b, verificación de estados
`requires_manual_action` ↔ `completed`, cancelación desde la API).

T4.7 manual action handling — result:

- Ciclo manual completo expuesto vía API (rutas en
  `remate-intake.routes.ts`): listar `GET /api/v1/manual-actions` (+`/:id`),
  completar `POST /api/v1/manual-actions/:id/complete` (intake REM@JU payload +
  PDF base64) y **nuevo** `POST /api/v1/manual-actions/:id/cancel` que delega en
  `ManualActionService.cancelManualAction` (la tarea queda en
  `requires_manual_action`; un re-run puede pedir otra acción).
- `RemateIntakeService.cancel(id, cancelledBy?)` expuesto para rutas y tests.
- Ciclo de estados verificado por los tests existentes: `requested` (request,
  idempotente por tarea) → `completed` (settlea la tarea `requires_manual_action`
  con resultado en `research_results`, provenance `manual-v1`) | `cancelled`
  (idempotente; no toca la tarea).
- Tests: `remate-intake.routes.test.ts` (+1: cancel HTTP) y cobertura previa de
  `manual-action.test.ts` y `research-flows.test.ts` (flujo manual geolocation).
  Suite completa **146/146 (21 archivos)**; typecheck server+root y build OK.

Siguiente: **T4.8 tests** (batería de pruebas de aceptación de la Fase 4:
ciclo E2E manual→completo sin red, fixtures del payload, casos límite de
`planRemajuMatches` y del intake).

T4.8 tests — result:

- Nueva suite de aceptación `server/tests/phase4-acceptance.test.ts` (5 tests,
  todo offline):
  - Ciclo E2E REM@JU **sin red**: caso `judicial` → carrusel con candidato débil
    (sin partida) → tarea `requires_manual_action` + manual action kind captcha →
    `ManualActionService.completeManualAction` → tarea `completed` y resultado
    manual con provenance `manual-v1` (high/verified) persistido en
    `research_results` + auditoría. (usa un in-memory db de Drizzle mínimo,
    replicando `research-flows.test.ts`).
  - Fixture `server/tests/fixtures/remate-manual-payload.json` → `planRemateIntake`
    normaliza partida P12345678, montos numéricos, dirección compuesta, origen
    partida, coords high/verified y `needsGeocoding:false`.
  - `planRemajuMatches` con múltiples partidas: hard match con la 2ª.
  - `linkRemateToProperties` prioriza partida sobre dirección.
  - Intake sin direcciones: advierte y no geocodifica (location null).
- Suite completa **151/151 (22 archivos)**; typecheck server+root y build OK.

Siguiente: **T4.9 monitoring** (healthchecks de colas/workers, alerts de tareas
stuck en `requires_manual_action`, métricas del ciclo manual y del consumo
REM@JU).

T4.9 monitoring — result:

- Nuevo módulo `server/src/domain/monitoring/`:
  - `monitoring.service.ts` (`MonitoringService`, agregaciones read-side sobre
    `manual_actions`, `research_tasks` y `research_results`, puro/offline-safe):
    - `getOperationsSummary()` → ciclo manual (total/requested/completed/
      cancelled, `stalePending` > 7 días, `avgCompletionHours`), pipeline
      judicial/REM@JU (tareas por estado, resultados `dataType:'judicial'` por
      fuente y por parser) y **stuck work**: `stale_pending_action` +
      `orphan_task` (tareas `requires_manual_action` sin acción pendiente),
      ordenadas por antigüedad.
    - `getQueueStatus(report?)` → profundidades por cola BullMQ (waiting/active/
      delayed/completed/failed/paused) con degradación elegante
      (`connected:false`) cuando Redis no responde; reporter inyectable.
  - `routes.ts` → `GET /api/v1/monitoring/operations` y
    `GET /api/v1/monitoring/queues`; registradas en `app.ts`
    (`AppOptions.monitoringService`).
- Helper de tests compartido `server/tests/helpers/in-memory-db.ts` (extraído de
  `phase4-acceptance.test.ts` para reutilización).
- Tests: `monitoring.service.test.ts` (4: ciclo manual+stale+avg, pipeline
  judicial por fuente/parser, orphan tasks, queue status degradado) y
  `monitoring.routes.test.ts` (2: operations HTTP, queues HTTP con reporter
  inyectado). Suite completa **157/157 (24 archivos)**; typecheck server+root y
  build OK.

siguiente tarea del plan: **Fase 5 — SUNARP** (T5.8 Historical data).

============================================================
PHASE 5 — SUNARP
============================================================

STATUS: IN PROGRESS (T5.1–T5.7 DONE)

Dividir:

- T5.1 Conoce Aquí — DONE (2026-09-18). Discovery completo y postura honesta:
  SUNARP NO ofrece superficie consultable sin identidad personal (DNI + fecha
  de emisión) + CAPTCHA → ninguna consulta automatizable (Ley 29733, minimize
  datos, no bypass CAPTCHA). Conector real `SunarpConnector`
  (`server/src/connectors/implementations/sunarp.ts`) registrado en `index.ts`
  (1d): `getStatus()` → `requires_auth` + `requiresManualAction` con
  instrucciones; `search()`/`getDetails()` NO devuelven datos (nunca simulados)
  y NO hacen peticiones de red. Tareas `registry`/`bgr` transicionan a
  `requires_manual_action` (kind `login`) en vez de `unavailable`. Tests
  `server/tests/sunarp.test.ts` (5) — suite completa **162/162 (25 archivos)**;
  typecheck server+root y build OK. Ver `docs/SUNARP.md` (reporte completo).

- T5.2 Consulta de Propiedad — DONE (2026-09-18). Segunda superficie pública
  (localizar partidas por NOMBRE del propietario: DNI/carnet + fecha de emisión
  + CAPTCHA + validación de correo OTP; homonimia) anexada al conector con la
  misma postura: `search()` → `requiresManualAction` con instrucciones de
  Consulta de Propiedad; `getStatus()` → guía combinada (localizar partida →
  Consulta de Propiedad; ver contenido → Conoce Aquí). `SearchResult` ganó
  campos opcionales `requiresManualAction`/`manualActionDescription` (aditivo,
  sin romper el contrato). Tests actualizados (5) — suite **162/162**;
  typecheck server+root y build OK.

- T5.3 SPRL — DONE (2026-09-18). Conector real de postura `SunarpSprlConnector`
  (`server/src/connectors/implementations/sunarp-sprl.ts`, registrado en
  `index.ts` 1e): SPRL (sprl.sunarp.gob.pe) es el servicio con VALOR LEGAL —
  suscripción gratuita pero **pago por consulta** (visualización ~S/ 6.90/página;
  copia literal ~S/ 14 las 2 primeras hojas + S/ 7 adicionales). Postura
  `requires_auth` + `requiresManualAction` (guía documenta el pago; no se
  automatiza la compra ni se guardan credenciales). Tests
  `server/tests/sunarp-sprl.test.ts` (5) — suite completa **167/167
  (26 archivos)**; typecheck server+root y build OK.

- T5.4 Registry normalization — DONE (2026-09-18). Normalización pura del
  registro capturado manualmente en
  `server/src/connectors/implementations/sunarp-normalize.ts` (iniciada como WIP
  sin commitear y completada en esta tarea):
  - `normalizeRegistryPartida()` / `registryLookupKey()` → clave canónica
    `P-XXXXXXXX` (Zona Registral XII — Arequipa, prefijo de oficina `110`
    opcional; acepta `P-12345678`, `p12345678`, `P 1234 5678`, `12345678`,
    `11012345678`). Permite **deduplicar el cache de pagos de SPRL**.
  - `normalizeRegistryCapture()` → shape canónico tipado para
    `registry_properties` / `registry_owners` / `registry_charges`: titular
    (Title Case, tipo DNI/RUC/CE/PASAPORTE, natural/jurídica, porcentaje),
    cargas (hipoteca/embargo/medida_cautelar/anotación/prohibición/servidumbre/
    usufructo, monto S//US$, estado si/no/unknown), fechas dd/MM/yyyy→ISO,
    m² y área de la Zona XII. Nunca inventa valores (null/desconocido + warnings).
  - Integración "antes de persistir": `planRemateIntake` (intake manual T4.5)
    ahora persiste la clave canónica en `registry_properties.registry_number`.
  - Bugs reales corregidos por la batería: `normalizeAreaM2` ("380 m2" → 380, no
    3802) y `amount` con separadores de miles (vía `parseAmount`).
  - Tests `server/tests/sunarp-normalize.test.ts` (20) + fixture
    `server/tests/fixtures/registry-capture.json`. Suite **187/187 (27 archivos)**;
    typecheck server+root y build OK.

T5.5 Owners — DONE (2026-09-19). Titulares de la partida capturados por el
  operador persistidos en `registry_owners`, vinculados a la fila de
  `registry_properties` del intake manual:
  - `planRemateIntake` acepta `propietarios` (array o un único objeto) y los
    normaliza con `normalizePropietarios` (reutiliza `PropietarioNormalizado` de
    T5.4); solo se persisten titulares aprovechables (nombre y/o documento) y se
    advierte si la captura no deja ninguno.
  - `RemateIntakeService.saveOwners` inserta el lote en un solo INSERT con
    `source: 'sunarp'`, porcentaje en texto numérico `numeric(5,2)` y
    `rawData: { parserVersion }`; `RemateIntakeResult.ownersPersisted` expone el
    número de filas creadas.
  - Tests: +1 `sunarp-normalize.test.ts` (normalizePropietarios), +2
    `remate-manual.test.ts` (planner) y +1 `remate-intake.service.test.ts`
    (persistencia → 2 INSERTs: registry + owners). Suite **191/191 (27 archivos)**;
    typecheck server+root y build OK.

T5.6 Charges — DONE (2026-09-19). Cargas/gravámenes de la partida capturados
  por el operador persistidos en `registry_charges`, vinculados a la fila de
  `registry_properties` del intake manual:
  - `planRemateIntake` acepta `cargas` (array o un único objeto) y las normaliza
    con `normalizeCargas` (reutiliza `CargaNormalizada` de T5.4); solo se
    persisten cargas aprovechables (tipo/descripción/monto/acreedor) y se
    advierte si la captura no deja ninguna.
  - `RemateIntakeService.saveCharges` inserta el lote en un solo INSERT con
    `source: 'sunarp'`, monto en texto numérico `numeric(15,2)`, moneda
    (PEN/USD), estado si/no/unknown y `rawData: { parserVersion }`;
    `RemateIntakeResult.chargesPersisted` expone el número de filas creadas.
  - Tests: +1 `sunarp-normalize.test.ts` (normalizeCargas), +2
    `remate-manual.test.ts` (planner) y +1 `remate-intake.service.test.ts`
    (persistencia → 2 INSERTs: registry + charges). Suite **195/195 (27 archivos)**;
    typecheck server+root y build OK.

T5.7 Titles — DONE (2026-09-19). Historial de títulos/asientos de la partida
  capturados por el operador persistidos en `registry_titles`, vinculados a la
  fila de `registry_properties` del intake manual:
  - `planRemateIntake` acepta `titulos` (array o un único objeto) y los normaliza
    con `normalizeTitulos` (shape `TituloNormalizado`: titleNumber/titleDate/
    titleType/notary/description); solo se persisten títulos aprovechables
    (algún dato real) y se advierte si la captura no deja ninguno.
  - `RemateIntakeService.saveTitles` inserta el lote en un solo INSERT con
    `source: 'sunarp'`, fechas en ISO (YYYY-MM-DD) y
    `rawData: { parserVersion }`; `RemateIntakeResult.titlesPersisted` expone
    el número de filas creadas.
  - Tests: +1 `sunarp-normalize.test.ts` (normalizeTitulos), +2
    `remate-manual.test.ts` (planner) y +1 `remate-intake.service.test.ts`
    (persistencia → 2 INSERTs: registry + titles). Suite **199/199 (27 archivos)**;
    typecheck server+root y build OK.

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