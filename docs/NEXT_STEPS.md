# Próximos Pasos de Implementación (NEXT_STEPS.md)

> **Instrucciones para el Siguiente Agente o Desarrollador**:  
> El estado del repositorio refleja la **Fase 3 (Research Engine Hardening)** en curso.
> Las fases 0–2.5 están implementadas en `main`; T3.1 (ResearchCase lifecycle) y T3.2 (ResearchTask lifecycle) completadas el 2026-09-17.
> Este documento mantiene el detalle de cada tarea, marcando lo ya construido y lo que queda para el siguiente bloque de trabajo.
> Lee atentamente este documento antes de escribir código.

---

## 1. Estado del Proyecto al Recibirlo

- **Servidor Fastify**: Implementado en `server/src/app.ts` e `index.ts` (puerto `3001`).
- **Base de Datos**: Esquema completo en `server/src/db/schema/` (27 tablas, 17 enums, tipos PostGIS).
- **Migraciones**: Archivo `server/drizzle/0000_military_salo.sql` generado y listo.
- **Conectores**: 14 stubs + **conector OSM/Nominatim real** registrado sobre el stub en `index.ts`.
- **Colas**: 6 colas BullMQ definidas en `server/src/workers/queue.ts`, con consumidores reales para `geocoding` y `research`.
- **Ingesta**: Motor de sincronización `server/src/domain/ingestion/sync.ts` + CLI `server/src/scripts/sync-sqlite.ts`.
- **UI**: Panel Scout intacto en puerto `8787` con botón `[INVESTIGAR]`, `Property Intelligence Drawer`, badges en tiempo real y lista dinámica de fuentes.
- **Pruebas**: 50 tests automatizados pasando en Vitest (`cd server && npm.cmd test`).

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

## 3. Checklist de Verificación para el Agente

Antes de dar por concluida cualquier sesión de trabajo, ejecuta siempre:

```bash
# 1. Typecheck en el servidor (cero errores permitidos)
cd server
npm.cmd run typecheck

# 2. Ejecutar toda la suite de tests (50 tests)
npm.cmd test

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

## 5. Siguientes Iteraciones (después de la Fase 2.5)

> **Siguiente tarea del plan**: **T3.3 — Research orchestration** (flujo
> PROPERTY → ResearchCase → Tasks → BullMQ → Workers → Results, con ejecución
> parcial y aislamiento de fuentes caídas). Ver `PROJECT_EXECUTION_PLAN.md`.

- Conectar fuentes reales por el motor de conectores (SUNARP/REM@JU/IMPLA/PDM…) **solo cuando el usuario lo apruebe**, respetando la política anti-stub: datos reales o `unavailable`, nunca simulados.
- Implementar la verificación a nivel de caso: confirmar manualmente la identidad del property y la coordenada geocodificada (hoy `verification='inferred'`).
- Probar escenarios de error restantes con Postgres caído (degradación sin crash) y OSM devolviendo 429/500 con retry+backoff.
- Fase 3: motor de scores y alertas (hay endpoints marcados `not_implemented`).
- Ajustar `getResults()` (hoy usa sólo el primer `taskId`) para resultados multi-tarea con `inArray`.
