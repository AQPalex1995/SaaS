# AGENTS.md — Guía para Agentes de IA & Desarrolladores

> **Bienvenido a Land Intelligence (anteriormente FB Terreno Scout)**.  
> Este documento está diseñado para que cualquier agente de IA (OpenCode, Claude, Cursor, Copilot) o desarrollador que reciba este repositorio pueda entender inmediatamente la arquitectura, el estado actual, las restricciones críticas y cómo continuar el trabajo sin romper nada.

---

## 1. Visión General del Proyecto

- **Objetivo**: Plataforma de inteligencia territorial e inmobiliaria para terrenos en Arequipa, Perú (con expansión nacional).
- **Evolución**: De un scraper local básico de Facebook Marketplace/Grupos (`FB Terreno Scout`) hacia una plataforma modular de due diligence inmobiliario, valuación y análisis registral/urbano (`Land Intelligence`).
- **Estado Actual**: **Fase 5 — SUNARP EN PROGRESO (2026‑09‑19, T5.1 Conoce Aquí + T5.2 Consulta de Propiedad + T5.3 SPRL + T5.4 Registry normalization + T5.5 Owners + T5.6 Charges + T5.7 Titles + T5.8 Historical data DONE)**. Fase 4 — REM@JU COMPLETED (T4.1–T4.9: discovery, parser, normalization, dedup, linking + intake manual, research connector, manual action handling, tests, monitoring). Siguiente tarea **T5.9 (Provenance)**. SUNARP no tiene superficie consultable sin identidad + CAPTCHA → postura `requires_auth` (conectores reales de postura, ver §3.4). Ver `PROJECT_STATUS.md` (estado vivo) y `PROJECT_EXECUTION_PLAN.md` (plan maestro). Fases 0–3 completadas (infra local, arquitectura, ingesta SQLite→PostgreSQL, conector OSM/Nominatim real, workers BullMQ, Research Engine T3.x).
- **Gobernanza**: este documento contiene las **Checkpoint Rules**, **Decision Gates** y **reglas de ejecución autónoma** (sección 2). Todo agente DEBE leer `PROJECT_EXECUTION_PLAN.md`, `PROJECT_STATUS.md` y `CHANGELOG_AGENTS.md` antes de escribir código.
- **Enfoque**: Modular Monolith en TypeScript (Node.js ESM), Fastify, PostgreSQL 16 + PostGIS 3.4, Drizzle ORM, BullMQ, Vitest.

---

## 2. 🔄 Gobernanza del Proyecto — Checkpoint Rules, Decision Gates y Ejecución Autónoma

> **Fuente de verdad del plan**: `PROJECT_EXECUTION_PLAN.md`. **Estado vivo**: `PROJECT_STATUS.md`.
> **Historial de sesiones**: `CHANGELOG_AGENTS.md`. Un agente que reciba este repositorio **DEBE leer
> estos tres documentos ANTES de escribir código**.

### 2.1 CHECKPOINT RULES

The agent must create a project checkpoint after completing a meaningful task or milestone.

A checkpoint consists of:

1. Passing tests
2. Passing typecheck
3. Passing build when applicable
4. Updated documentation
5. Updated PROJECT_STATUS.md
6. Updated PROJECT_EXECUTION_PLAN.md
7. Updated CHANGELOG_AGENTS.md
8. Git commit
9. Git push automático a GitHub (`origin/main`, sin `--force`) — ver §2.9

The agent must stop and request approval before crossing a major architectural checkpoint.

Major checkpoints include:

- changing database architecture
- adding a new external data provider
- introducing a new cloud service
- changing authentication/authorization
- destructive database migrations
- production deployment
- introducing a new paid service
- changing the core domain model
- changing the AI provider architecture

### 2.2 Milestone Tracking

- Cada tarea concreta se representa como TODOs con estados `pending / in_progress / completed / blocked / cancelled`.
- Al completar una tarea: registrar en `CHANGELOG_AGENTS.md` (fecha, agente, qué se hizo, hallazgos, decisiones).
- Actualizar `PROJECT_STATUS.md` (phase, task, blockers, known issues) al **final de cada sesión**.
- En `PROJECT_EXECUTION_PLAN.md`, mover una tarea de `TODO` a `DONE` **solo** cuando se cumplan los criterios de aceptación (tests + typecheck + build + docs + commit).

### 2.3 Decision Gates

El agente **DEBE detenerse y pedir aprobación** cuando encuentre:

- un **major architectural checkpoint** (ver 2.1);
- una decisión arquitectónica (ADR): cambio en cómo interactúan los componentes, el modelo de datos o la topología de despliegue;
- una operación destructiva o irreversible (drop table, borrado de datos, eliminación de una fuente legacy, migración no reversible);
- un cambio sensible a seguridad (credenciales, autenticación, autorización, datos personales);
- acceso externo no autorizado o contra los términos del proveedor (p. ej. evadir CAPTCHA);
- cualquier **gasto de infraestructura** (recursos de nube, servicios de pago);
- tocar el entorno CAST ERP o los puertos estándar `5432` / `6379`;
- modificar o eliminar archivos del **Scout Legacy** (`src/`) o `data/scout.db`;
- **adelantarse a una fase futura** (front-running de `PROJECT_EXECUTION_PLAN.md`).

Cuando esté bloqueado, anotar en `CHANGELOG_AGENTS.md` y `PROJECT_STATUS.md`: la decisión requerida, las opciones y la recomendación. Luego **detenerse**.

### 2.4 Autonomous Execution Rules

- El agente **PUEDE** implementar, testear y commite esta **única** tarea identificada como `NEXT TASK` en `PROJECT_EXECUTION_PLAN.md` / `PROJECT_STATUS.md`.
- **DEBE** implementar solo esa tarea, inspeccionando primero la implementación real (lea el código, no asuma).
- **DEBE** ejecutar, antes de declarar éxito: `npm.cmd test` y `npm.cmd run typecheck` (en `server/`), `npm.cmd run build` cuando aplique, y el typecheck de la raíz (Scout Legacy).
- **DEBE** actualizar la documentación afectada por el cambio (`docs/*.md`, y los documentos raíz de gobernanza si aplica).
- **DEBE** crear el checkpoint (git commit) al terminar.
- **DEBE** empujar el checkpoint a GitHub automáticamente (`git push origin main`,
  sin `--force`) — ver §2.9. El push es parte del checkpoint, no opcional.
- Si una tarea **no puede completarse** (bloqueo, falta de información, servicio no disponible), **detenerse y reportar el bloqueo** — nunca improvisar un workaround no autorizado.

### 2.5 Project State Tracking

| Archivo | Propósito | Cuándo se actualiza |
|---|---|---|
| `PROJECT_EXECUTION_PLAN.md` | Roadmap de 16 fases; fuente de verdad de "qué sigue" | cada tarea pasada a DONE |
| `PROJECT_STATUS.md` | Snapshot vivo: runtime, DB, tests, fase/tarea actual, blockers | fin de cada sesión |
| `CHANGELOG_AGENTS.md` | Bitácora de agentes: qué, por qué, hallazgos, decisiones | fin de cada sesión |
| `AGENTS.md` | Reglas y restricciones (este archivo) | cuando cambian las reglas |
| `docs/` | Documentación viva de arquitectura/operación | por cada tarea afectada |

### 2.6 Documentation Synchronization Rules

- La documentación **nunca debe contradecir** el sistema en ejecución. Si código y docs divergen, corregir ambos.
- Tras cada tarea: refrescar los `docs/*.md` afectados, `PROJECT_STATUS.md`, marcar la tarea en `PROJECT_EXECUTION_PLAN.md` y agregar entrada en `CHANGELOG_AGENTS.md`.
- `docs/NEXT_STEPS.md` debe actualizarse siempre que cambie el siguiente trabajo concreto.
- El índice de documentación de este archivo (sección 7) debe listar todos los docs de gobernanza y archivos de estado raíz.
- Versiones: subir `VERSION` de `PROJECT_EXECUTION_PLAN.md` ante cambios estructurales; mantener `CHANGELOG_AGENTS.md` cronológico.

### 2.7 Git Safety Rules

Before making a major change:

1. Check `git status`.
2. Ensure there are no unexpected local changes.
3. Create a checkpoint commit when appropriate.

Agents MUST NOT use:

- `git reset --hard`
- `git clean -fd`
- `git push --force`

unless explicitly authorized by the user.

Prefer:

- `git revert` when undoing a committed change.

Never delete user work to make tests pass.

> Remote de referencia: `origin` → `https://github.com/AQPalex1995/SaaS.git` (push solo por `main`, sin `--force`).
> Git portable disponible en `D:\SaaS\PortableGit\cmd\git.exe` (no está en el PATH global).
> Credenciales: Git Credential Manager ya configurado. Si un push falla por autenticación, **detenerse y pedir login al usuario** — nunca intentar `--force` ni rebasar el remoto.

### 2.8 Autoarranque automático de Docker y PostgreSQL

Cuando una tarea requiera la **base de datos PostgreSQL (5433)** o las **colas Redis (6380)** (migraciones, seed, smoke tests en vivo, sync, verificación en DB, tests de integración), el agente **DEBE** asegurar el runtime automáticamente antes de seguir:

1. Comprobar el puerto de Postgres: `(Test-NetConnection -ComputerName localhost -Port 5433 -WarningAction SilentlyContinue).TcpTestSucceeded`.
   - Si escucha → continuar sin tocar Docker.
2. Si NO escucha → iniciar Docker Desktop y esperar el engine:
   - `Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe'`
   - Esperar (poll cada ~5 s, máx ~150 s) hasta que `docker info --format '{{.ServerVersion}}'` devuelva una versión.
   - Si el engine no arranca (servicio sin privilegios), **detenerse y reportar** que el usuario debe abrir Docker Desktop.
3. Levantar solo la infraestructura local:
   - `docker compose up -d postgres redis`
   - Esperar a que `land-intel-postgres` esté `healthy` (`docker inspect --format '{{.State.Health.Status}}' land-intel-postgres`).
   - **NUNCA** usar `docker compose up -d` con el profile `full` (api/worker) salvo petición explícita; **NUNCA** `docker compose down -v` ni borrar volúmenes (destruyen datos).
4. Aplicar migraciones pendientes: `cd server; npm.cmd run db:migrate` (idempotente).
5. Guardrails CAST ERP: todo el stack local usa **5433/6380**; jamás tocar `5432`/`6379`.

### 2.9 Sincronización automática con GitHub

- Tras **cada checkpoint** (§2.1), el agente **DEBE** empujar `main` a `origin` automáticamente:
  ```
  git push origin main
  ```
- El commit y el push forman un solo avance: los `.md` de estado/docs ya ida actualizados en ese mismo commit antes del push.
- Reglas de seguridad (ver §2.7): solo `main`, **nunca** `--force`, **nunca** borrar historial.
- Si el push es rechazado por divergencia: `git fetch` y resolver (merge/rebase) informando al usuario; no sobreescribir el remoto.
- Si el push falla por credenciales: **detenerse y pedir login** (abrir GCM / `git push` interactivo).

---

## 3. ⚠️ Reglas Críticas y Restricciones Operativas

Cualquier agente que modifique este repositorio **DEBE RESPETAR ESTRICTAMENTE** las siguientes restricciones:

1. **NO interferir con el ERP de la empresa (CAST ERP)**:
   - El usuario tiene un ERP en producción local todos los días.
   - **NUNCA usar puertos estándar 5432 ni 6379**.
   - PostgreSQL de Land Intelligence está configurado en el puerto **`5433`**.
   - Redis de Land Intelligence está configurado en el puerto **`6380`**.
2. **NO romper el scraper existente (Scout Legacy)**:
   - Los archivos en `src/` (ej. `src/main.ts`, `src/scout.ts`, `src/store.ts`, `src/panel.html`) corresponden al monitor de Facebook en funcionamiento.
   - La base de datos SQLite del Scout **NO DEBE SER ELIMINADA**. Nota: aunque la documentación menciona `data/terrenos.db`, la ruta real configurada es `data/scout.db` (véase `src/paths.ts`); el sync y el endpoint de investigación leen de `SCOUT_DB_PATH`.
   - El script `iniciar-scout.bat` corre en el puerto **`8787`** y debe seguir funcionando.
3. **Estrategia Dual-Port**:
   - `8787`: Panel web Legacy Scout (servidor HTTP nativo en `src/server.ts`).
   - `3001`: API REST Land Intelligence (Fastify en `server/src/index.ts`).
   - `worker.ts`: proceso separado consumiendo colas BullMQ (`geocoding`, `research` con handlers reales; el resto ack+log).
4. **NO inventar datos ni crear integraciones falsas**:
   - Los conectores externos (SUNARP, IMPLA, CEJ, etc.) son **stubs** que devuelven estado `'unavailable'`.
   - **Únicas excepciones** (se registran en `index.ts` DESPUÉS de los 14 stubs, manteniendo el contrato de 14 fuentes):
     - `openstreetmap` es real (Nominatim);
     - `remaju` es real pero SOLO consume la superficie pública (sin CAPTCHA);
     - `sunarp` es real SOLO como **postura honesta** (T5.1–T5.2): NO hace peticiones de red, reporta `requires_auth` + `requiresManualAction` (SUNARP exige DNI + fecha de emisión + CAPTCHA; no automatizable, Ley 29733);
     - `sunarp_sprl` es real SOLO como **postura honesta** (T5.3): SPRL = servicio de pago con valor legal; `requires_auth` + `requiresManualAction`, sin automatizar compras ni guardar credenciales.
   - Si una fuente requiere auth o no está implementada, devuelve status `not_implemented`, `unavailable` o `requires_auth`. Nunca simules scraping exitoso con datos inventados. Las tareas de investigación apoyadas en stubs terminan como `unavailable`, no como `completed`; las que requieren auth/acción manual terminan como `requires_manual_action`.
5. **Trazabilidad y Proveniencia Obligatoria**:
   - Todo dato externo almacenado debe registrar: `source`, `source_url`, `retrieved_at`, `confidence` ('high' | 'medium' | 'low' | 'unknown') y `verification` ('reported' | 'inferred' | 'verified' | 'conflicting').
6. **Ejecución en Windows / PowerShell**:
   - Para ejecutar scripts `npm` en Windows cuando la política de ejecución de PowerShell bloquea `.ps1`, usa `npm.cmd <comando>` o `npx.cmd <comando>`.
7. **Autoarranque de Docker/PostgreSQL/Redis**:
   - Si una tarea requiere la DB o las colas, iniciar el runtime automáticamente siguiendo **§2.8** (Docker Desktop → `docker compose up -d postgres redis` → esperar `healthy` → `db:migrate`).
   - **NUNCA** tocar los puertos `5432`/`6379` (CAST ERP), **NUNCA** `docker compose down -v` ni borrar volúmenes.
8. **Auto-sync con GitHub**:
   - Cada avance terminado (checkpoint) se **commitea y se hace `git push origin main`** automáticamente (sin `--force`), ver **§2.9**.

---

## 4. Estructura del Repositorio

```text
d:\SaaS\fb-terreno-scout\
├── AGENTS.md                  # Este documento (orientación para IA + gobernanza)
├── PROJECT_EXECUTION_PLAN.md  # Plan maestro de 16 fases (fuente de verdad de "qué sigue")
├── PROJECT_STATUS.md          # Estado vivo del proyecto (fase/tarea/blockers)
├── CHANGELOG_AGENTS.md        # Bitácora de sesiones de agentes
├── docker-compose.yml         # Postgres (5433) + Redis (6380) + API/worker (profile: full)
├── .env.example               # Plantilla de variables de entorno
├── .env.development.example   # Plantilla por entorno: development
├── .env.test.example          # Plantilla por entorno: test
├── .env.production.example    # Plantilla por entorno: production (sin secretos reales)
├── .env                       # Configuración local activa
├── package.json               # Dependencias del Scout Legacy (Playwright, OCR)
├── tsconfig.json              # Configuración TS del Scout Legacy
├── iniciar-scout.bat          # Lanzador del Scout en puerto 8787
├── infra/
│   ├── README.md              # Cómo se relaciona la infra con el código
│   └── gcp/README.md          # PLAN de migración a Google Cloud (sin nada desplegado)
│
├── src/                       # ── SCOUT LEGACY (NO DESTRUIR) ──
│   ├── main.ts                # Entrypoint del Scout
│   ├── panel.html             # UI del Scout + Drawer de Land Intelligence
│   ├── store.ts               # SQLite (data/terrenos.db)
│   ├── scout.ts               # Orquestador del scraping Playwright
│   ├── portals.ts             # Scraper de AdondeVivir / Urbania
│   └── ...                    # OCR, geolocalizadores locales
│
├── server/                    # ── LAND INTELLIGENCE (NUEVO NÚCLEO) ──
│   ├── package.json           # Fastify, Drizzle, BullMQ, Vitest
│   ├── package-lock.json      # Lockfile para builds reproducibles (Docker usa npm ci)
│   ├── Dockerfile             # Imagen multi-stage (non-root, healthcheck)
│   ├── tsconfig.json          # TypeScript ESM Bundler
│   ├── tsconfig.build.json    # Build producción (emit dist/)
│   ├── drizzle.config.ts      # Configuración de Drizzle Kit
│   ├── drizzle/               # Migraciones SQL generadas (0000_military_salo.sql … 0003_natural_mysterio.sql)
│   ├── scripts/
│   │   └── queue-health.mjs   # Healthcheck Redis para el worker en Docker
│   ├── tests/                 # Suite de pruebas Vitest (205 tests pasando)
│   │   ├── app.test.ts        # Tests de API Fastify, /health, /sources
│   │   ├── connector.test.ts  # Tests de registro y conectores stubs
│   │   ├── research.test.ts   # Tests del motor de investigación
│   │   ├── research-api.test.ts   # Tests HTTP de los endpoints de investigación (T3.6)
│   │   ├── research-flows.test.ts # Flujos full/partial/failed/unavailable/retry/duplicate/manual/timeout (T3.8)
│   │   ├── lifecycle.test.ts  # Tests de transiciones del ResearchCase lifecycle
│   │   ├── task-lifecycle.test.ts # Tests de transiciones del ResearchTask lifecycle
│   │   ├── orchestrator.test.ts   # Tests de orquestación y aislamiento de fallos
│   │   ├── manual-action.test.ts  # Tests de acciones manuales (T3.4)
│   │   ├── provenance.test.ts     # Tests de provenance de resultados (T3.5)
│   │   ├── schema.test.ts     # Tests de los 28 esquemas y 19 enums
│   │   ├── sync.test.ts       # Tests de helpers de ingestión (contentHash, mapeos, etc.)
│   │   └── osm.test.ts        # Tests del conector OpenStreetMap (fetch stubbed, sin red)
│   │   └── remaju.test.ts     # Tests del parser REM@JU (fetch stubbed + fixtures HTML) (Fase 4/T4.2)
│   │   └── remaju-normalize.test.ts # Tests de normalización REM@JU (T4.3)
│   │   └── remaju-dedup.test.ts # Tests de deduplicación REM@JU (T4.4)
│   │   └── remaju-link.test.ts # Tests de linking REM@JU (partida/dirección) (T4.5)
│   │   └── remate-manual.test.ts # Tests del planner de intake manual REM@JU (T4.5)
│   │   └── remate-intake.service.test.ts # Tests del servicio de intake manual (T4.5)
│   │   └── remate-intake.routes.test.ts # Tests HTTP de /api/v1/manual-actions (T4.5)
│   │   └── remaju-research.test.ts # Tests de matching REM@JU→property para research (T4.6)
│   │   └── sunarp.test.ts  # Tests del conector SUNARP postura requires_auth (T5.1–T5.2)
│   │   └── sunarp-sprl.test.ts # Tests del conector SUNARP SPRL postura pago (T5.3)
│   │   └── sunarp-normalize.test.ts # Tests de normalización registral SUNARP (T5.4) + titulares/cargas/títulos (T5.5/T5.6/T5.7)
│   │   └── sunarp-historical.test.ts # Tests de estado registral derivado SUNARP (T5.8)
│   └── fixtures/
│       └── remaju-home.html   # Fixture offline del home público REM@JU (T4.2)
│       └── remate-manual-payload.json # Fixture del payload de intake manual REM@JU (T4.5/T4.8)
│       └── registry-capture.json # Fixture de captura registral SUNARP (T5.4)
│   └── src/
│       ├── config.ts          # Configuración cloud-agnostic por env (incl. NOMINATIM_URL/OSM_USER_AGENT/SCOUT_DB_PATH)
│       ├── logger.ts          # Logger Pino estructurado con censura de secretos
│       ├── app.ts             # Factory buildApp() de Fastify (genReqId + CORS)
│       ├── index.ts           # Entrypoint del servidor (puerto 3001)
│       ├── worker.ts          # Entrypoint del worker BullMQ separado (handlers geocoding/research)
│       ├── connectors/        # Conectores de datos
│       │   ├── base.ts        # Clase abstracta PropertyDataSource e interfaces
│       │   ├── registry.ts    # Singleton ConnectorRegistry
│       │   ├── routes.ts      # Endpoints /api/v1/sources
│       │   ├── stubs/         # 14 conectores stubs
│       │   └── implementations/
│       │       └── osm.ts     # Conector REAL OpenStreetMap/Nominatim (rate-limit 1req/s)
│       │       ├── remaju.ts  # Conector REAL REM@JU (superficie pública, sin CAPTCHA) (T4.2)
│       │       └── remaju-normalize.ts # Normalización canónica REM@JU (T4.3)
│       │       └── remaju-dedup.ts # Deduplicación REM@JU (hash + ids) (T4.4)
│       │       ├── remaju-link.ts # Linking REM@JU → properties (T4.5)
│       │       └── sunarp.ts  # Conector REAL SUNARP (postura requires_auth; Conoce Aquí + Consulta de Propiedad, sin fetch) (T5.1–T5.2)
│       │       └── sunarp-sprl.ts # Conector REAL SUNARP SPRL (postura requires_auth + pago, sin fetch) (T5.3)
│       │       └── sunarp-normalize.ts # Normalización registral SUNARP (clave canónica P-XXXXXXXX + captura) (T5.4/T5.5/T5.6/T5.7)
│       │       └── sunarp-historical.ts # Estado registral derivado del historial de asientos (T5.8)
│       ├── db/
│       │   ├── connection.ts  # Pool pg + Drizzle DB + testConnection()
│       │   ├── init.ts        # ensureExtensions() + migrationsFolder() robusto
│       │   ├── setup.ts       # db:setup idempotente (ext + migrate + seed)
│       │   ├── run-guard.ts   # isMainRunner(): permite reutilizar scripts
│       │   ├── init.sql       # Extensiones PostGIS y uuid-ossp (solo Docker entries)
│       │   ├── migrate.ts     # Runner de migraciones Drizzle
│       │   ├── seed.ts        # Seed de desarrollo (exporta runSeed())
│       │   └── schema/        # 28 tablas Drizzle + 19 enums PostgreSQL
│       ├── domain/            # Servicios de negocio
│       │   ├── properties/    # PropertyService + rutas /api/v1/properties
│       │   ├── research/      # ResearchService + lifecycle + task-lifecycle + orchestrator + manual-action + result-provenance + remate-manual/remate-intake/remaju-research (T4.5/T4.6)
│       │   ├── monitoring/    # MonitoringService + rutas /api/v1/monitoring (operations|queues) (T4.9)
│       │   ├── ingestion/     # sync.ts: SQLite legacy → PostgreSQL (dedup, hash, audit)
│       │   └── audit/         # AuditService para registro de eventos
│       ├── dto/               # Tipos de transferencia de datos
│       ├── storage/           # Abstracción cloud-agnostic (provider "local")
│       │   ├── types.ts       # Interfaz StorageProvider
│       │   ├── local.ts       # LocalStorageProvider (filesystem)
│       │   └── index.ts       # Factory (STORAGE_PROVIDER) + singleton
│       ├── scripts/
│       │   └── sync-sqlite.ts # CLI 1-shot: npm run sync:sqlite
│       └── workers/           # Infraestructura de colas BullMQ (6 colas)
│           ├── queue.ts       # Definiciones de colas + getQueue()
│           ├── runner.ts      # startWorker(): consumidores BullMQ separados
│           ├── jobs.ts        # enqueueGeocoding() / enqueueResearch()
│           └── consumers/
│               ├── geocoding.worker.ts  # Geolocaliza propiedad + crea geometría + tarea completed
│               └── research.worker.ts   # Orienta las 8 tareas (identity→completed, stubs→unavailable)
│
└── docs/                      # ── DOCUMENTACIÓN COMPLETA ──
    ├── ARCHITECTURE.md        # Arquitectura del sistema modular
    ├── ARCHITECTURE_AUDIT.md  # Auditoría del Scout inicial
    ├── DATABASE.md            # Esquema de 28 tablas + PostGIS
    ├── DOMAIN_MODEL.md        # Entidades, invariantes y estados
    ├── API.md                 # Especificación de endpoints Fastify
    ├── CONNECTORS.md          # Arquitectura de conectores
    ├── SUNARP.md              # Reporte de discovery SUNARP + Fase 5 (T5.1–T5.8)
    ├── RESEARCH_ENGINE.md     # Motor de 8 tareas de investigación
    ├── GIS.md                 # Inteligencia geoespacial y PDM Arequipa
    ├── QUEUES.md              # Infraestructura BullMQ y Redis
    ├── DEVELOPMENT.md         # Manual para levantar y desarrollar
    ├── ROADMAP.md             # Plan de fases 1 a 5
    ├── DECISIONS.md           # Registros de decisiones (ADRs)
    └── NEXT_STEPS.md          # Tareas exactas para la siguiente fase
```

---

## 5. Cómo Levantar el Proyecto desde Cero

### Paso 1: Instalar dependencias
```bash
# Raíz (Scout Legacy)
npm.cmd install

# Servidor Land Intelligence
cd server
npm.cmd install
```

### Paso 2: Configurar variables de entorno
Verifica que exista el archivo `.env` en la raíz y en `server/.env` (cópialo de
`.env.development.example`):
```ini
NODE_ENV=development
DATABASE_URL=postgresql://land_intel:land_intel_dev_2024@localhost:5433/land_intelligence
REDIS_URL=redis://localhost:6380
PORT=3001
HOST=127.0.0.1
API_URL=http://127.0.0.1:3001
APP_URL=http://localhost:8787
CORS_ORIGINS=http://127.0.0.1:8787,http://localhost:8787
SCOUT_PORT=8787
LOG_LEVEL=info
STORAGE_PROVIDER=local

# Fase 2: OpenStreetMap + SQLite legacy
NOMINATIM_URL=https://nominatim.openstreetmap.org
OSM_USER_AGENT=LandIntelligence/0.1 (land-intel-dev; +http://localhost:3001)
# SCOUT_DB_PATH: en desarrollo se auto-detecta (data/scout.db o ../data/scout.db). En producción es OBLIGATORIA.
SCOUT_DB_PATH=../data/scout.db
```

### Paso 3: Iniciar infraestructura Docker (cuando Docker esté disponible)
```bash
docker compose up -d postgres redis
```
> **Nota**: Si PostgreSQL/Redis están apagados y la tarea los requiere, el agente los inicia
> **automáticamente** (ver **§2.8**): Docker Desktop → `docker compose up -d postgres redis`
> → esperar `healthy` → aplicar migraciones (`npm.cmd run db:migrate`). No detenerse por
> "Docker no está corriendo" a menos que el engine no pueda arrancarse.
> El servidor además tiene **degradación elegante**: inicia en modo degradado, reporta el
> estado en `/health` y los endpoints de conectores y metadatos siguen respondiendo.

### Paso 4: Migraciones y Seed (con Postgres activo)
```bash
cd server
npm.cmd run db:setup      # TODO EN UNO: extensiones PostGIS + migraciones + seed
# ... o por pasos:
npm.cmd run db:generate   # Genera migraciones en server/drizzle/
npm.cmd run db:migrate    # Ejecuta migraciones en PostgreSQL
npm.cmd run db:seed       # Inserta usuario de sistema, fuentes y datos de prueba
```

### Paso 5: Ejecutar la suite de tests
```bash
cd server
npm.cmd test               # Ejecuta Vitest (205 tests automáticos)
npm.cmd run typecheck      # Verifica que TypeScript esté al 100% sin errores
```

### Paso 6: Iniciar el servidor API de Land Intelligence
```bash
cd server
npm.cmd run dev            # Inicia Fastify con hot reload en http://localhost:3001
npm.cmd run dev:worker     # Worker BullMQ en proceso separado (consumidores geocoding/research)
npm.cmd run build          # Compila dist/ (para contenedores o node dist/index.js)
```

### Paso 7: Sincronizar el SQLite legacy hacia PostgreSQL (Fase 2)
```bash
cd server
npm.cmd run sync:sqlite    # Lee data/scout.db y crea/actualiza properties + listings
```

### Paso 8: Iniciar el Scout Legacy (opcional)
```bash
# En otra terminal o mediante doble clic:
iniciar-scout.bat          # Abre el panel web en http://localhost:8787
```

---

## 6. Pruebas Rápidas de Verificación (Smoke Test)

Con el servidor corriendo en el puerto 3001:

```bash
# 1. Healthcheck
curl http://localhost:3001/health

# 2. Listar los 14 conectores y su estado
curl http://localhost:3001/api/v1/sources

# 3. Consultar un conector específico
curl http://localhost:3001/api/v1/sources/sunarp

# 4. Probar endpoints reservados de Fase 3
curl http://localhost:3001/api/v1/properties/00000000-0000-0000-0000-000000000000/scores
```

---

## 7. Índice de Documentación Detallada

Para profundizar en cualquier área, lee directamente el documento correspondiente:

| Documento | Contenido Principal |
|---|---|
| [AGENTS.md](file:///d:/SaaS/fb-terreno-scout/AGENTS.md) | **Reglas y gobernanza para agentes IA** (Checkpoint Rules, Decision Gates) |
| [PROJECT_EXECUTION_PLAN.md](file:///d:/SaaS/fb-terreno-scout/PROJECT_EXECUTION_PLAN.md) | **Plan maestro de 16 fases — fuente de verdad de "qué sigue"** |
| [PROJECT_STATUS.md](file:///d:/SaaS/fb-terreno-scout/PROJECT_STATUS.md) | **Estado vivo: runtime, DB, tests, fase/tarea actual, blockers** |
| [CHANGELOG_AGENTS.md](file:///d:/SaaS/fb-terreno-scout/CHANGELOG_AGENTS.md) | **Bitácora de sesiones de agentes** |
| [ARCHITECTURE.md](file:///d:/SaaS/fb-terreno-scout/docs/ARCHITECTURE.md) | Diagrama modular, flujo de datos, principios de diseño |
| [ARCHITECTURE_AUDIT.md](file:///d:/SaaS/fb-terreno-scout/docs/ARCHITECTURE_AUDIT.md) | Diagnóstico completo del código previo de FB Terreno Scout |
| [DATABASE.md](file:///d:/SaaS/fb-terreno-scout/docs/DATABASE.md) | Diccionario de 28 tablas, índices, llaves foráneas y tipos PostGIS |
| [DOMAIN_MODEL.md](file:///d:/SaaS/fb-terreno-scout/docs/DOMAIN_MODEL.md) | Modelo de dominio: Property, Listing, ResearchCase, Task, Scores |
| [API.md](file:///d:/SaaS/fb-terreno-scout/docs/API.md) | Contratos REST Fastify, DTOs de entrada y salida, códigos HTTP |
| [CONNECTORS.md](file:///d:/SaaS/fb-terreno-scout/docs/CONNECTORS.md) | Arquitectura de adaptadores, política de rate limits y stubs |
| [RESEARCH_ENGINE.md](file:///d:/SaaS/fb-terreno-scout/docs/RESEARCH_ENGINE.md) | Especificación de las 8 tareas automáticas de investigación |
| [GIS.md](file:///d:/SaaS/fb-terreno-scout/docs/GIS.md) | PostGIS, SRID 4326, capas del PDM Arequipa y zonificación |
| [QUEUES.md](file:///d:/SaaS/fb-terreno-scout/docs/QUEUES.md) | Colas BullMQ preparadas para workers asíncronos |
| [DEVELOPMENT.md](file:///d:/SaaS/fb-terreno-scout/docs/DEVELOPMENT.md) | Guía de desarrollo local, scripts, depuración y convenciones |
| [ROADMAP.md](file:///d:/SaaS/fb-terreno-scout/docs/ROADMAP.md) | Plan maestro de evolución técnica (Fases 1 a 5) |
| [DECISIONS.md](file:///d:/SaaS/fb-terreno-scout/docs/DECISIONS.md) | ADRs: Fastify, Drizzle ORM, Monolito Modular, Puertos alternativos |
| [NEXT_STEPS.md](file:///d:/SaaS/fb-terreno-scout/docs/NEXT_STEPS.md) | **Instrucciones paso a paso para la siguiente fase de desarrollo** |
| [CLOUD.md](file:///d:/SaaS/fb-terreno-scout/docs/CLOUD.md) | Estrategia cloud-agnostic y estado de preparación para GCP |
| [CI-CD.md](file:///d:/SaaS/fb-terreno-scout/docs/CI-CD.md) | Pipeline mínimo de CI/CD y despliegue futuro |
| [COST_CONTROL.md](file:///d:/SaaS/fb-terreno-scout/docs/COST_CONTROL.md) | Control de costos en la nube (sin recursos creados aún) |
| [LOCAL_TO_GCP.md](file:///d:/SaaS/fb-terreno-scout/docs/LOCAL_TO_GCP.md) | Guía de transición del stack local a Google Cloud |
