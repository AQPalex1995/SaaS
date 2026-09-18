# PROJECT STATUS

Updated:
2026-09-17

## Runtime

Scout:
⏸️ 8787 (detenido al cierre de esta sesión)

Land Intelligence API:
⏸️ 3001 (detenido al cierre de esta sesión)

PostgreSQL:
▶️ 5433 (docker `land-intel-postgres`, healthy)

Redis:
▶️ 6380 (docker `land-intel-redis`, healthy)

GitHub:
✅ `origin` → `https://github.com/AQPalex1995/SaaS.git` — `main` sincronizado
   (autopush por checkpoint, ver AGENTS.md §2.9)

> Nota: los contenedores `land-intel-postgres`/`land-intel-redis` se levantaron
> al final de la sesión para aplicar la migración `0003`. La API y el Scout
> permanecen detenidos (ver CHANGELOG_AGENTS.md).

## Database

Properties:
4025

Listings:
4152

PostGIS:
✅

## Tests

Server:
✅ 96/96 (14 files — incl. `remaju.test.ts` T4.2)

Root:
✅

## Current Phase

Phase 4 — IN PROGRESS (REM@JU; T4.1 discovery + T4.2 parser done)

## Current Task

Phase 4 / T4.3 (normalization) — próximo paso. T4.2 parser completado:
`server/src/connectors/implementations/remaju.ts` (zona pública del home,
sin CAPTCHA/login) + tests offline 96/96 + smoke en vivo (276 remates
parseados del home público real). Reporte T4.1 en `docs/REMATE_JUDICIAL.md`.

## Blockers

None

## Known Issues

- La suite completa de tests emitió ruido ambiental durante T3.4–T3.6:
  `osm.test.ts` falla una llamada real a Nominatim (`500`) y `app.test.ts`
  reporta `ECONNREFUSED` a PostgreSQL 5433 (servicios locales detenidos), pero
  **todos los archivos de test pasan** (14/14, 96/96). El smoke test en vivo de
  REM@JU (T4.2) SÍ se repitió contra la página pública real: 276 remates
  parseados (MIRAFLORES/40451/25296, distrito "cusco" → 2 hits).
- Limitaciones conocidas del motor de investigación (reveladas por T3.8, sin
  corregir en una tarea de tests):
  - `createResearch` no deduplica investigaciones activas del mismo inmueble.
  - `transitionTask` no aplica `maxRetries` (sólo se expone en el DTO).
  - No hay timeout activo en el orquestador; un timeout del conector se
    registra como tarea `failed`.
  - `updateCaseProgress` nunca marca un caso como `failed` (usa `partial`).
- ~~Migración `0003_natural_mysterio.sql` (manual actions) generada pero **no
  aplicada** a ninguna base viva todavía.~~ **Resuelto (2026-09-17)**: migración
  aplicada a `land_intelligence` en PostgreSQL 5433 (`manual_actions` + enums
  `manual_action_kind`/`manual_action_status`; 4 migraciones registradas; datos
  intactos: 4025 properties).