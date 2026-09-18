# PROJECT STATUS

Updated:
2026-09-17

## Runtime

Scout:
⏸️ 8787 (detenido al cierre de esta sesión)

Land Intelligence API:
⏸️ 3001 (detenido al cierre de esta sesión)

PostgreSQL:
⏸️ 5433 (detenido al cierre de esta sesión)

Redis:
⏸️ 6380 (detenido al cierre de esta sesión)

> Nota: todos los servicios locales estaban detenidos durante T3.1–T3.8; el smoke
> test en vivo no se repitió desde T3.2 (ver CHANGELOG_AGENTS.md).

## Database

Properties:
4025

Listings:
4152

PostGIS:
✅

## Tests

Server:
✅ 85/85

Root:
✅

## Current Phase

Phase 3

## Current Task

T3.9 Research documentation

## Blockers

None

## Known Issues

- La suite completa de tests emitió ruido ambiental durante T3.4–T3.6:
  `osm.test.ts` falla una llamada real a Nominatim (`500`) y `app.test.ts`
  reporta `ECONNREFUSED` a PostgreSQL 5433 (servicios locales detenidos), pero
  **todos los archivos de test pasan** (13/13, 85/85). El smoke test en vivo no
  se repitió: PostgreSQL/Redis/Docker estaban detenidos (ver CHANGELOG_AGENTS.md
  2026-09-17, T3.4–T3.8).
- Limitaciones conocidas del motor de investigación (reveladas por T3.8, sin
  corregir en una tarea de tests):
  - `createResearch` no deduplica investigaciones activas del mismo inmueble.
  - `transitionTask` no aplica `maxRetries` (sólo se expone en el DTO).
  - No hay timeout activo en el orquestador; un timeout del conector se
    registra como tarea `failed`.
  - `updateCaseProgress` nunca marca un caso como `failed` (usa `partial`).
- Migración `0003_natural_mysterio.sql` (manual actions) generada pero **no
  aplicada** a ninguna base viva todavía.