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
✅ 199/199 (27 files — incl. `remaju*.test.ts` + `remate-*` + `remaju-research.test.ts` + `phase4-acceptance.test.ts` + `monitoring.*.test.ts` T4.2–T4.9 + `sunarp.test.ts` T5.1–T5.2 + `sunarp-sprl.test.ts` T5.3 + `sunarp-normalize.test.ts` T5.4/T5.5/T5.6/T5.7)

Root:
✅

## Current Phase

Phase 5 — ✅ SUNARP EN PROGRESO (T5.1–T5.7 DONE, 2026-09-19). Fase 4 — REM@JU COMPLETED.

## Current Task

Fase 5 / T5.8 (Historical data) — próximo paso. T5.1–T5.7 completados:
- **T5.1 Conoce Aquí**: discovery (`docs/SUNARP.md`): **ninguna superficie consultable
  sin identidad (DNI + fecha de emisión) + CAPTCHA** → no automatizable (Ley 29733, no
  bypass CAPTCHA, 3–5 consultas/día). Conector real de postura `SunarpConnector`
  (`server/src/connectors/implementations/sunarp.ts`) registrado en `index.ts` (1d).
- **T5.2 Consulta de Propiedad**: localizar partidas por NOMBRE del propietario (DNI +
  fecha emisión + CAPTCHA + correo OTP; homonimia) anexada al mismo conector:
  `search()` → `requiresManualAction`; `getStatus()` → guía combinada.
  `SearchResult` ganó campos opcionales `requiresManualAction`/`manualActionDescription`
  (aditivo, contrato intacto).
- **T5.3 SPRL**: conector real de postura `SunarpSprlConnector`
  (`server/src/connectors/implementations/sunarp-sprl.ts`, index.ts 1e) — servicio con
  valor legal, suscripción gratuita + **pago por consulta**; `requires_auth` +
  `requiresManualAction` (no se automatiza compra ni se guardan credenciales).
- **T5.4 Registry normalization**:
  `server/src/connectors/implementations/sunarp-normalize.ts` (WIP no commitado,
  terminado y testeado): `normalizeRegistryPartida`/`registryLookupKey` → clave
  canónica `P-XXXXXXXX` (prefijo `110` de la Zona XII) para dedup del cache SPRL;
  `normalizeRegistryCapture` tipa titulares/cargas para
  `registry_properties`/`registry_owners`/`registry_charges`. `planRemateIntake`
  (intake manual T4.5) persiste ahora la clave canónica. Bugs reales corregidos
  (`normalizeAreaM2` "380 m2"→380 y montos con miles vía `parseAmount`).
  Tests `sunarp-normalize.test.ts` (20) + fixture `registry-capture.json`.
Tareas `registry`/`bgr` → `requires_manual_action` (manual action kind `login`).
Tests: `sunarp.test.ts` (5) + `sunarp-sprl.test.ts` (5) + `sunarp-normalize.test.ts` (21).
- **T5.5 Owners**:
  `planRemateIntake` acepta `propietarios` (array u objeto único) de la captura
  SUNARP y los normaliza con `normalizePropietarios` → `registry_owners`
  vinculados a la fila de `registry_properties` (FK `registry_property_id`).
  `RemateIntakeService.saveOwners` inserta el lote en un solo INSERT
  (`source: 'sunarp'`, porcentaje `numeric(5,2)` en texto, `rawData` con
  `parserVersion`); `ownersPersisted` en el resultado del intake. Solo se
  persisten titulares con nombre y/o documento (+warnings).
  Tests: +1 sunarp-normalize, +2 remate-manual, +1 remate-intake.service.
- **T5.6 Charges**:
  `planRemateIntake` acepta `cargas` (array u objeto único) de la captura SUNARP
  y las normaliza con `normalizeCargas` → `registry_charges` vinculados a la
  fila de `registry_properties` (FK `registry_property_id`). 
  `RemateIntakeService.saveCharges` inserta el lote en un solo INSERT
  (`source: 'sunarp'`, monto `numeric(15,2)` en texto, moneda PEN/USD, estado
  si/no/unknown, `rawData` con parserVersion); `chargesPersisted` en el
  resultado del intake. Solo se persisten cargas aprovechables (+warnings).
  Tests: +1 sunarp-normalize, +2 remate-manual, +1 remate-intake.service.
Suite **195/195 (27 archivos)**; typecheck server+root y build OK.
- **T5.7 Titles**:
  `planRemateIntake` acepta `titulos` (array u objeto único) de la captura
  SUNARP y los normaliza con `normalizeTitulos` (shape `TituloNormalizado`) →
  `registry_titles` vinculados a la fila de `registry_properties` (FK
  `registry_property_id`). `RemateIntakeService.saveTitles` inserta el lote en
  un solo INSERT (`source: 'sunarp'`, fechas ISO, `rawData` con parserVersion);
  `titlesPersisted` en el resultado del intake. Solo se persisten títulos
  aprovechables (+warnings). Tests: +1 sunarp-normalize, +2 remate-manual, +1
  remate-intake.service.
Suite **199/199 (27 archivos)**; typecheck server+root y build OK.

## Blockers

None

## Known Issues

- La suite completa de tests emitió ruido ambiental durante T3.4–T3.6:
  `osm.test.ts` falla una llamada real a Nominatim (`500`) y `app.test.ts`
  reporta `ECONNREFUSED` a PostgreSQL 5433 (servicios locales detenidos), pero
  **todos los archivos de test pasan** (25/25, 162/162). El smoke test en vivo de
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