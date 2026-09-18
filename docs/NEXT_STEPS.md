# Próximos Pasos de Implementación (NEXT_STEPS.md)

> **Instrucciones para el Siguiente Agente o Desarrollador**:  
> El estado del repositorio refleja la **Fase 3 (Research Engine Hardening)** en curso.
> Las fases 0–2.5 están implementadas en `main`; la Fase 3 (T3.1 ResearchCase lifecycle → T3.9 Research documentation) quedó completada el 2026-09-17.
> Este documento mantiene el detalle de cada tarea, marcando lo ya construido y lo que queda para el siguiente bloque de trabajo.
> Lee atentamente este documento antes de escribir código.

---

## 1. Estado del Proyecto al Recibirlo

- **Servidor Fastify**: Implementado en `server/src/app.ts` e `index.ts` (puerto `3001`).
- **Base de Datos**: Esquema completo en `server/src/db/schema/` (28 tablas, 19 enums, tipos PostGIS).
- **Migraciones**: Archivos `server/drizzle/0000_military_salo.sql`, `0001_research_lifecycle_enums.sql`, `0002_research_lifecycle_default.sql` y `0003_natural_mysterio.sql` (manual_actions) generados (0003 sin aplicar aún a un Postgres vivo).
- **Conectores**: 14 stubs + **conector OSM/Nominatim real** registrado sobre el stub en `index.ts`.
- **Colas**: 6 colas BullMQ definidas en `server/src/workers/queue.ts`, con consumidores reales para `geocoding` y `research`.
- **Ingesta**: Motor de sincronización `server/src/domain/ingestion/sync.ts` + CLI `server/src/scripts/sync-sqlite.ts`.
- **UI**: Panel Scout intacto en puerto `8787` con botón `[INVESTIGAR]`, `Property Intelligence Drawer`, badges en tiempo real y lista dinámica de fuentes.
- **Pruebas**: 85 tests automatizados pasando en Vitest (`cd server && npm.cmd test`).

> **Bugs conocidos y divergencias**: la base SQLite real es `data/scout.db` (no `data/terrenos.db` como cita la doc);
> `node:sqlite` requiere import dinámico en Docker `node:22` (ya resuelto en `sync.ts`).

---

## 2. Plan de Trabajo Detallado para la Fase 2

La Fase 2 conecta el flujo de datos del Scout legacy hacia PostgreSQL y comienza la resolución de ubicaciones reales.

### Tarea 2.1: Sincronizador SQLite ➔ PostgreSQL (`Ingestion Pipeline`) — ✅ IMPLEMENTADA
- Servicio en `server/src/domain/ingestion/sync.ts`:
  - `contentHash` (SHA-256 de título + precio + descripción normalizada).
  - Dedup de listings por `source_type + external_id`; unificación de properties por `content_hash`.
  - Provenance `scout-legacy` (confidence `low`, verification `reported`), property con `publicId = LI-<nanoid8>`.
  - `audit_logs` con acciones `property_created` / `listing_created`.
  - Encolado de geolocalización cuando la fila tiene distrito.
- CLI `server/src/scripts/sync-sqlite.ts` + script npm `"sync:sqlite"`.

### Tarea 2.2: Conector OpenStreetMap / Nominatim Real — ✅ IMPLEMENTADA
- `server/src/connectors/implementations/osm.ts` extiende `PropertyDataSource` (`sourceId='openstreetmap'`).
- Rate limiting estricto (mín. 1,1 s entre llamadas), User-Agent identificado desde `OSM_USER_AGENT`, timeout 15 s, retry en 429 con `Retry-After`, `countrycodes=pe`, `addressdetails=1`, `accept-language=es`.
- `reverseGeocode` maneja la respuesta de objeto único de `/reverse` (bug corregido).
- Registrado en `index.ts` **después** de `allStubConnectors` (el stub queda por debajo; no se rompe el contrato de 14 fuentes).

### Tarea 2.3: Worker de Geolocalización (BullMQ) — ✅ IMPLEMENTADA
- `server/src/workers/consumers/geocoding.worker.ts`:
  - Toma `propertyId`; si ya tiene `verified` coord., marca la tarea `skipped`.
  - Construye la query `"<distrito>, Arequipa, Perú"`, geolocaliza vía OSM.
  - Actualiza `properties` (lat/lon, `geom_point` como `SRID=4326;POINT(lng lat)`, distrito normalizado, source `openstreetmap`, `verified`).
  - Inserta `property_locations` + `property_geometries`, audita `task_completed`, marca la tarea `geolocation` como `completed` y refresca el avance del caso.
- `server/src/workers/consumers/research.worker.ts`: pone el caso en `running`; encola geolocalización; completa `identity` con resultado (hash/provenance `inferred`, sin datos inventados); las tareas con conector stub (registry/bgr/urbanism/judicial/market/risk) → `unavailable` con mensaje honesto.
- `server/src/worker.ts`: ahora construye handlers por cola (`geocoding`, `research`); las demás colas ack+log sin deadlock. Reutilizable vía `WORKER_QUEUES`.

### Tarea 2.4: Integración del Drawer con el Endpoint Real de Investigación — ✅ IMPLEMENTADA
- `server/src/domain/research/routes.ts`:
  - `GET /api/v1/properties/:id/research` y `POST …`: si `:id` **no es UUID**, se resuelve on-the-fly contra `data/scout.db` (`resolveSqliteListing`) creando la property si falta; 404 honesto si no existe.
  - Tras crear el caso, encola geocoding + research (best-effort, `Promise.allSettled`).
  - Expone `GET /api/v1/research/:id`, `/tasks`, `/results`.
- `src/panel.html`:
  - `startResearchPolling(caseId)` consulta `/api/v1/research/:id/tasks` cada 4 s y actualiza badges: `PREPARADA→CORRIENDO→COMPLETADA/FALLIDA/MANUAL/NO DISPONIBLE/OMITIDA` (nuevas clases `.b-running/.b-failed/.b-muted`).
  - `refreshDrawerSources()` renderiza dinámicamente `/api/v1/sources` en el Drawer (el conector OSM sale como `Activo`).

---

## 2.5. Validación End-to-End — ✅ COMPLETADA (2026‑09‑16)

Validación contra el ambiente real (API :3001, worker local, Scout legacy :8787, Postgres 5433, Redis 6380).

### Resultados medidos
- **Ingesta**: 4.152 listings sincronizados → 4.025 properties únicas en PostgreSQL (49,9 MB; 8.187 filas en `audit_logs`).
- **Geocoding real (Nominatim)**: 11 properties con `location_verification='verified'`, 1 `property_locations` + 1 `property_geometries` por property (0 duplicados). Muestras en Miraflores, La Joya y Yura (SRID 4326).
- **Research**: 18 cases; 8 tareas por case (identity + geolocation + 6 stubs). Cases completos 8/8, errors 0. Tareas stub terminan como `unavailable` (NUNCA `completed`).
- **Idempotencia**: re-ejecutar el research sobre la misma property **no** duplica locations/geometries; la task de geolocalización se marca `skipped` ("Ya geolocalizada por otra ejecución").
- **Performance**: `POST /research` → 201 en ~115 ms (Redis sano); case 100% local (sin distrito geocodificable) → work done en <40 ms (identity + 6 stubs, geolocation honesta `requires_manual_action`). Case con Nominatim real: ~2–3 s.
- **Frontend Drawer**: apertura, 14 fuentes, polling → `✅ INVESTIGACIÓN COMPLETA` (badge general + notice, polling se detiene).
- **Prefiltros**: `/health` degradado responde en ~48 ms (antes colgaba >20 s); tipos 404 y 400 resueltos; secretos redactados en logs; `x-request-id` correlacionado.

### Correcciones introducidas durante la validación
1. **Resiliencia Redis (API)** — `server/src/workers/queue.ts` y `jobs.ts`:
   - `retryStrategy` infinita con backoff `min(t·200, 5000)` (antes abandonaba tras 2 reintentos y nunca se recuperaba).
   - `commandTimeout: 5000` + helper `withRedisTimeout()` (1,5 s) y `testRedis()` con timeouts; enqueue acotado a 2 s. Redis caído → API operativa y cada request degradada responde en ~48 ms.
2. **Resiliencia Redis (worker)** — `server/src/workers/runner.ts`:
   - `startWorker()` ya NO bloquea en `waitUntilReady()`; race de 15 s y arranque asíncrono (la retryStrategy infinita reintenta mientras Redis vuelve).
   - ⚠️ **NO añadir `commandTimeout` a la conexión del worker**: el polling de BullMQ usa comandos BLOQUEANTES (`BLMOVE`/`BRPOPLPUSH`) que bloquean durante segundos → un `commandTimeout` corto produce falsos `Command timed out` en cada poll y congela el consumo (bug observado y revertido).
3. **Guard de geocoding en sync** — `server/src/domain/ingestion/sync.ts`:
   - El encolado solo ocurre si la property **no** está ubicada (`latitude+longitude+location_verification='verified'`). Sin este guard, re-ejecutar `sync:sqlite` encolaba ~4.000 jobs de geocoding contra el Nominatim público aunque la property ya estuviera ubicada.
4. **Drawer / frontend** — `src/panel.html`:
   - `#intel-drawer-overlay` salió de dentro de `#edit-modal` (un `display:none` lo ocultaba).
   - `triggerPropertyResearch` envía `body: '{}'` (Fastify rechazaba JSON vacío); `app.ts` agrega parser tolerant para Content-Type JSON con body vacío.
   - `renderResearchBadges` actualiza el badge general/notice reales; `startResearchPolling` se detiene al terminar; clase corregida `b-done`.

### Nota operativa
- Para el worker en validación usa **`npm run worker`** (sin watcher). `tsx watch` reinicia el worker en cada save y puede dejarlo en estados erráticos (wedged) durante fallos de Redis.
- Ejecutar `sync:sqlite` completo vuelve a encolar geocoding para ~4.000 properties **aún no ubicadas**: es el comportamiento deseado, pero equivale a un geocoding masivo contra Nominatim (NO hacerlo salvo que se requiera explícitamente).
- `geolocation` puede terminar como `requires_manual_action` cuando la property no tiene distrito/address geocodificable — comportamiento honesto e intencional.

---

## 2.6. Fase 3 — T3.1 ResearchCase lifecycle — ✅ COMPLETADA (2026‑09‑17)

Endurecimiento del ciclo de vida del caso de investigación, con transiciones validadas,
idempotencia y contadores honestos. Ver `docs/RESEARCH_ENGINE.md` §4.

### Cambios
- **Enum `research_status`** (`server/src/db/schema/enums.ts`): se agregaron `created`,
  `queued`, `partial` (no destructivo, `ALTER TYPE ADD VALUE`). Las nuevas cases nacen en
  `created`; `pending` se conserva para filas legacy.
- **`server/src/domain/research/lifecycle.ts`** (nuevo): tabla `CASE_TRANSITIONS`,
  `assertCaseTransition()`, `transitionCase()` (UPDATE condicional `WHERE status = <from>`,
  race-safe, estados terminales inmutables) y `updateCaseProgress()` (movido desde
  `geocoding.worker.ts`).
- **Ciclo**: `created` (service) → `queued` (routes, solo si se encoló algo) → `running`
  (+`startedAt`, worker) → `completed | partial | failed` (+`completedAt`, `summary`).
  `partial` = todas las tareas terminaron pero al menos una falló; `failed` = error no
  recuperable del caso.
- **Idempotencia**: `processResearchJob` omite cases ya terminales (seguro ante re-entregas
  de BullMQ); `transitionCase` es no-op si el estado ya es el destino.
- **Contadores**: `errorCount` = tareas `failed`; `warningCount` = tareas
  `requires_manual_action` + `blocked` + `unavailable`.
- **DTO**: `ResearchCaseDTO` ahora expone `updatedAt` (`server/src/dto/index.ts`).
- **Migraciones**: `server/drizzle/0001_research_lifecycle_enums.sql` y
  `0002_research_lifecycle_default.sql`.

### Hallazgo importante (migraciones)
- PostgreSQL 16 **no permite usar** un valor de enum recién agregado dentro de la **misma
  transacción**. El migrador de Drizzle ejecuta **todas** las migraciones pendientes en una
  sola transacción, por lo que `ADD VALUE` y `SET DEFAULT 'created'` debieron separarse en
  **dos archivos** y aplicarse en **dos ejecuciones** de `npm run db:migrate`.
- `drizzle-kit generate` fallaba con **Node v26.4.0** (el loader `@esbuild-kit/esm-loader`
  de kit ≤0.28 no resuelve `./x.js` → `x.ts`). **Resuelto el 2026-09-17**: `drizzle-kit`
  actualizado de `^0.28.0` a `^0.31.10` (usa `tsx` como loader, compatible con las bases
  modernas de Node). `npm run db:generate` vuelve a funcionar y verifica
  "No schema changes, nothing to migrate" con el schema actual.
- Las migraciones de T3.1 (`0001`/`0002`), sus snapshots y el journal se escribieron a
  mano en el formato v7; al `generate` siguiente la cadena `prevId`/`id` se alineó
  (`0000 → 0001 → 0002`) y quedó validada por drizzle-kit 0.31.10.

### Verificación
- Tests 44/44 (4 nuevos en `server/tests/lifecycle.test.ts`).
- Typecheck server + root, build del server.
- Migración aplicada y verificada en PostgreSQL (enum, default, filas legacy intactas).
- Smoke test en vivo: `POST /research` → `queued` (con `updatedAt`), luego `completed`
  (identity `completed`, geolocation `requires_manual_action`, 6 stubs `unavailable`,
  `errorCount 0`, `warningCount 7`, 8/8 tareas).

---

## 2.7. Fase 3 — T3.2 ResearchTask lifecycle — ✅ COMPLETADA (2026‑09‑17)

Endurecimiento del ciclo de vida de cada tarea de investigación, con transiciones
validadas, idempotencia, estados inmutables vs. reintentables y timestamps
consistentes. Ver `docs/RESEARCH_ENGINE.md` §5.

### Cambios
- **`server/src/domain/research/task-lifecycle.ts`** (nuevo): tabla
  `TASK_TRANSITIONS`, `assertTaskTransition()`, `transitionTask()` (UPDATE
  condicional `WHERE status = <from>`, race-safe, estados inmutables protegidos)
  y conjuntos `TASK_TERMINAL` / `TASK_SETTLED` / `TASK_DONE` / `TASK_WARNING`.
- **Semántica**: `completed` y `skipped` son **inmutables**; `failed`, `blocked`,
  `unavailable` y `requires_manual_action` son **reintentables** (vuelven a
  `pending`/`running`, limpian `completedAt`, re-abren `startedAt` y suman 1 a
  `retryCount` hasta `maxRetries`).
- **Automación de timestamps**: `startedAt` al entrar en `running` (o en un
  estado final sin pasar por `running`); `completedAt` al concluir el trabajo
  automatizado (NUNCA en `requires_manual_action`); `completed` limpia
  `error`/`requiresManualAction`; `requires_manual_action` activa el flag.
- **`server/src/domain/research/lifecycle.ts`**: `updateCaseProgress()` ahora
  usa `isTaskSettled()`/`TASK_WARNING` desde `task-lifecycle.ts` (fuente única
  de verdad; comportamiento del caso sin cambios).
- **Workers**: `research.worker.ts` (identity → `completed` con
  `resultReference`; stubs → `unavailable`) y `geocoding.worker.ts`
  (`markGeolocationTask` → `completed`/`failed`/`requires_manual_action`/`skipped`)
  ya no escriben `status` a mano: usan `transitionTask()`.
- **DTO**: `ResearchTaskDTO` ahora expone `maxRetries` y `updatedAt`
  (`server/src/dto/index.ts`, `server/src/domain/research/service.ts`).
- **Sin migración**: el enum `task_status` ya contenía los 8 estados; no se
  alteró el esquema.

### Verificación
- Tests 50/50 (+6 en `server/tests/task-lifecycle.test.ts`).
- Typecheck server + root, build del server.
- Nota de ambiente: el smoke test en vivo NO se repitió en esta sesión porque
  PostgreSQL (5433) y Redis (6380) estaban detenidos y el daemon de Docker no
  estaba corriendo. La equivalencia de comportamiento con los updates directos
  previos se validó por inspección + cobertura unitaria.

---

## 2.8. Fase 3 — T3.4 Manual Action — ✅ COMPLETADA (2026‑09‑17)

Mecanismo genérico para fuentes que requieren acción humana (CAPTCHA, LOGIN,
PAYMENT, USER ACTION) con datos concretos (`instructions`, `url`,
`requested_at`, `completed_at`, `completed_by`, `result`). Ver
`docs/RESEARCH_ENGINE.md` §3.

### Cambios
- **Enums**: `manual_action_kind` (`captcha`, `login`, `payment`,
  `user_action`, `other`) y `manual_action_status` (`requested`, `completed`,
  `cancelled`) en `server/src/db/schema/enums.ts`.
- **Tabla `manual_actions`** (`server/src/db/schema/research.ts`): FK a
  `research_tasks` y `properties` (cascade), `actionKind`, `status`,
  `instructions`, `url`, `source`, timestamps `requestedAt`/`completedAt`,
  `completedBy`, `result` (jsonb), `metadata`, `createdAt`, `updatedAt`;
  índices por task, property y status.
- **`server/src/domain/research/manual-action.service.ts`**:
  `requestManualAction` (idempotente por tarea), `getManualAction`,
  `listManualActions` (filtros), `completeManualAction` (registra
  `research_results` con source `manual` y verification `verified`, audita
  `manual_result_entered`, transiciona la tarea
  `requires_manual_action → completed` con `resultReference` y refresca el
  caso) y `cancelManualAction`.
- **Wiring**: `ResearchOrchestrator` solicita acción manual para conectores con
  `requires_manual_action`/`requires_auth` (login → `login`, resto →
  `user_action`) y para geolocalización sin dirección geocodificable;
  `geocoding.worker.ts` la solicita cuando la tarea queda en
  `requires_manual_action`. Todo en try/catch (nunca rompe el pipeline).
- **`task-lifecycle.ts`**: borde directo `requires_manual_action → completed`.
- **DTO**: `ManualActionDTO` en `server/src/dto/index.ts`.
- **Migración**: `server/drizzle/0003_natural_mysterio.sql` (generada por
  drizzle-kit, sin edición manual).

### Verificación
- Tests 67/67 (9 nuevos en `server/tests/manual-action.test.ts`; `schema.test.ts`
  valida 28 tablas y los 2 enums nuevos; un test de mock DB que emula ASTs de
  drizzle: `and()` anida un wrapper SQL extra y `PgColumn.name` es **snake_case**,
  el key JS se resuelve desde `col.table`).
- Typecheck server + root, build del server.
- Nota de ambiente: PostgreSQL (5433) y Redis (6380) detenidos; la migración
  0003 no se aplicó a una base viva en esta sesión.

---

## 2.9. Fase 3 — T3.5 Research Result provenance — ✅ COMPLETADA (2026‑09‑17)

Garantiza los campos de provenance en **todos** los resultados de investigación:
`source`, `source_url`, `retrieved_at`, `confidence`, `verification_status`,
`raw_data`, `normalized_data` y `parser_version`.

### Cambios
- **`server/src/domain/research/result-provenance.ts`** (`recordResearchResult`):
  única ruta de inserción para todos los productores de `research_results`;
  normaliza los opcionales (`retrieved_at` → now, `confidence` →
  `unknown`, `verification` → `reported`, `raw_data` → null, `data` → {},
  `parser_version` → `v1`) para que ningún productor omita provenance.
- **6 productores refactorizados**: `executeIdentityTask` (rawData con snapshot
  del property), `executeGeolocationTask` (verificado y vía OSM real),
  `executeConnectorTask`, `geocoding.worker.markGeolocationTask`,
  `ManualActionService.completeManualAction` (rawData = resultado del analista).
- **DTO**: `ResearchResultDTO` expone ahora `rawData` y `metadata`.
- **Sin migración**: la tabla ya tenía todas las columnas de provenance.

### Verificación
- Tests 69/69 (2 nuevos en `server/tests/provenance.test.ts`; aserciones de
  provenance añadidas a orchestrator/manual-action/schema tests).
- Typecheck server + root, build del server.

---

## 2.10. Fase 3 — T3.6 Research API — ✅ COMPLETADA (2026‑09‑17)

Verificación y endurecimiento de los 5 endpoints de investigación.

### Cambios
- **`server/src/domain/research/routes.ts`**:
  - `GET/POST /api/v1/properties/:id/research` (uuid o ID legacy SQLite).
  - `GET /api/v1/research/:id`, `/tasks`, `/results`: validan `:id` como UUID
    (400 si es malformado) y devuelven 404 para casos inexistentes.
  - `researchRoutes(app, deps)` acepta `service` y `db` inyectables (default
    real), habilitando tests HTTP sin base de datos.
- **`server/tests/research-api.test.ts`** (7 tests): los 5 endpoints + 400/404,
  con `enqueueGeocoding`/`enqueueResearch` mockeados (sin Redis).

### Verificación
- Tests 76/76 (12 archivos); typecheck server + root; build del server.

---

## 2.11. Fase 3 — T3.7 Research Drawer — ✅ COMPLETADA (2026‑09‑17)

Frontend del panel Scout (cambio autorizado en `src/panel.html`).

### Cambios
- `resumePropertyResearch()`: al abrir el Drawer, carga el caso más reciente vía
  `GET /api/v1/properties/:id/research` y reanuda el polling.
- Polling extendido: `/research/:id/tasks` + `/research/:id/results` en paralelo;
  se detiene cuando las tareas son terminales y los resultados ya cargaron.
- Secciones nuevas: **Resultados y Evidencia** (agrupados por `dataType`, con
  source/enlace, confidence, verification, retrievedAt, parserVersion) y
  **Avisos y Acciones Manuales** (failed / requires_manual_action / unavailable).
- `escAttr()` para escapar URLs en atributos HTML.
- Las acciones manuales son de sólo lectura (no existe aún ruta HTTP de
  resolución).

### Verificación
- Typecheck de la raíz OK; ambos bloques `<script>` validados con `node --check`.
- Sin cambios en el servidor (76/76 sin cambios).

---

## 2.12. Fase 3 — T3.8 Research tests — ✅ COMPLETADA (2026‑09‑17)

Cobertura de los 8 escenarios de flujo del plan contra el código real
(orchestrator / lifecycle / service) con una base in-memory que evalúa los WHERE
de Drizzle.

### Cambios
- **`server/tests/research-flows.test.ts`** (9 tests): full, partial, failed
  task, unavailable source, retry, duplicate research, manual action, timeout y
  el caso "todas las tareas fallidas".
- Mock de DB in-memory con evaluación de predicados (mismo enfoque que T3.4),
  capaz de mutar filas de tareas/casos y soportar transiciones condicionales.

### Limitaciones conocidas (documentadas, no corregidas)
- `createResearch` no deduplica investigaciones activas del mismo inmueble.
- `transitionTask` no aplica `maxRetries`.
- No hay timeout activo en el orquestador.
- `updateCaseProgress` nunca marca un caso como `failed` (usa `partial`).

### Verificación
- Tests 85/85 (13 archivos); typecheck server + root; build del server.

---

## 2.13. Fase 3 — T3.9 Research documentation — ✅ COMPLETADA (2026‑09‑17)

Cierre documental de la Fase 3.

### Cambios
- `docs/RESEARCH_ENGINE.md`: **§8 Cobertura de Pruebas (T3.8)** con tabla de
  escenarios y limitaciones conocidas; correcciones en §2 (prioridad real),
  §4 (`failed` no producido por `updateCaseProgress`) y §5 (`maxRetries` no
  aplicado; comportamiento de timeout).
- `docs/API.md` §4: corrección del tope `maxRetries` y enlaces a §5/§8.
- `docs/NEXT_STEPS.md`: header, esta sección y próxima iteración.

### Verificación
- Cambio sólo de documentación; suite intacta (85/85).

---

## 3. Checklist de Verificación para el Agente

Antes de dar por concluida cualquier sesión de trabajo, ejecuta siempre:

```bash
# 1. Typecheck en el servidor (cero errores permitidos)
cd server
npm.cmd run typecheck

# 2. Ejecutar toda la suite de tests (85 tests)npm.cmd test

# 3. Build de producción del servidor
npm.cmd run build

# 4. Typecheck en la raíz (Scout Legacy debe permanecer intacto)
cd ..
npm.cmd run typecheck

# 5. (Opcional) Sincronizar el SQLite legacy hacia PostgreSQL
cd server && npm.cmd run sync:sqlite
```

---

## 4. Recordatorio de Seguridad de Infraestructura

- **NUNCA modifiques los puertos de `.env` a 5432 o 6379**.
- Siempre mantén los puertos:
  - Postgres: `5433`
  - Redis: `6380`
  - API Fastify: `3001`
  - Scout UI: `8787`
- Cualquier duda conceptual sobre el modelo de dominio, consulta primero `docs/DOMAIN_MODEL.md` y `docs/DATABASE.md`.

---

## 5. Siguientes Iteraciones (Fase 3 cerrada)

> **Fase 3 (Research Engine Hardening) COMPLETA** (T3.1–T3.9, 2026‑09‑17).
>
> **Siguiente tarea del plan**: **Fase 4 / T4.1 — REM@JU discovery**.
> ⏸️ **Requiere aprobación explícita**: conectar un nuevo proveedor de datos
> externo es un Decision Gate (AGENTS.md §2.1/§2.3). No iniciar sin autorización.
> Ver `PROJECT_EXECUTION_PLAN.md` (PHASE 4) y `docs/RESEARCH_ENGINE.md` §8.

- Conectar fuentes reales por el motor de conectores (SUNARP/REM@JU/IMPLA/PDM…) **solo cuando el usuario lo apruebe**, respetando la política anti-stub: datos reales o `unavailable`, nunca simulados.
- Implementar la verificación a nivel de caso: confirmar manualmente la identidad del property y la coordenada geocodificada (hoy `verification='inferred'`).
- Probar escenarios de error restantes con Postgres caído (degradación sin crash) y OSM devolviendo 429/500 con retry+backoff.
- Fase 3: motor de scores y alertas (hay endpoints marcados `not_implemented`).
