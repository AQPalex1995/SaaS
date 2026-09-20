# PROJECT STATUS

Updated:
2026-09-19

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
✅ 210/210 (28 files — incl. `remaju*.test.ts` + `remate-*` + `remaju-research.test.ts` + `phase4-acceptance.test.ts` + `monitoring.*.test.ts` T4.2–T4.9 + `sunarp.test.ts` T5.1–T5.2 + `sunarp-sprl.test.ts` T5.3 + `sunarp-normalize.test.ts` T5.4/T5.5/T5.6/T5.7 + `sunarp-historical.test.ts` T5.8 + provenance superficie T5.9)

Root:
✅

## Current Phase

Phase 5 — ✅ SUNARP EN PROGRESO (T5.1–T5.9 DONE, 2026-09-19). Fase 4 — REM@JU COMPLETED.

## Current Task

Fase 5 / T5.10 (Manual actions) — próximo paso. T5.1–T5.9 completados:
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
- **T5.8 Historical data**:
  Nuevo módulo puro `sunarp-historical.ts` con `deriveHistoricalState(titulos,
  cargas)`: deriva el **estado registral** de la partida desde el historial de
  títulos/asientos y cargas ya normalizados (T5.6/T5.7). Estado `cargado`
  (cargas `isActive: 'si'`) / `sano` (solo vencidas) / `desconocido` (sin
  cargas); también nº de títulos/cargas, `activeCharges`/`inactiveCharges`,
  deuda activa por moneda (PEN/USD) y `lastTitleDate`. `planRemateIntake`
  expone la derivación en `RemateManualNormalized.historical` y
  `RegistryPlanRow.historical` (en `rawData`; sin migración ni DB).
  Tests: +5 en `sunarp-historical.test.ts` (nuevo) + 1 en remate-manual.
Suite **205/205 (28 archivos)**; typecheck server+root y build OK.
- **T5.9 Provenance (superficie)**:
  - Tipo `IntakeProvenance` (`sunarp-historical.ts`)
    (`source/sourceUrl/retrievedAt/confidence/verification/parserVersion`).
  - `RemateManualNormalized.provenance` (source `manual`, `parserVersion
    manual-v1`, `sourceUrl` = PDF) y `RegistryPlanRow.provenance` (`remaju`,
    `SUNARP_PARSER_VERSION`); `RegistryHistoricalState.provenance` deriva con
    `source: 'sunarp'`, `verification: 'inferred'` (regla hecho/señal).
  - `planRemateIntake(input, retrievedAt?)` propaga un único `retrievedAt`; el
    provenance fluye por `manualAction.result` → `research_results.data` y
    `registry_properties.raw_data`.
  - Tests: +2 `remate-manual`, +2 `sunarp-historical`, +1 `remate-intake.service`.
  Suite **210/210 (28 archivos)**; typecheck server+root y build OK.

## Gobernanza y producto (registrado 2026-09-19)

Documentación de producto/seguridad/gobierno actualizada con la definición
formal del producto **Land Intelligence** (plataforma de investigación y due
diligence de predios). Documentos añadidos:
- `docs/PRODUCT.md` — producto, flujos oficiales, módulo Buscar Predio (entrada
  B: predios no publicados), expediente `/investigaciones/:id`, Due Diligence
  PRO (dimensiones A–I), planes FREE/BASIC/PRO/PROFESSIONAL (conceptuales).
- `docs/RESEARCH_GOVERNANCE.md` — HECHO/SEÑAL/INTERPRETACIÓN/REQUIERE
  VERIFICACIÓN/OPINIÓN PROFESIONAL; separación Listing/Property/ResearchCase/
  ResearchRun; historial.
- `docs/UX_ARCHITECTURE.md` — navegación y estructura del expediente.
- `docs/DATA_GOVERNANCE.md` — ciclo de vida, provenance/cumplimiento.
- `docs/SECURITY.md` — auth, RBAC, entitlements, ASVS L2, auditoría, know-how.
- Plan: cabecera corregida a PHASE 5; nueva etapa **PHASE 5.5 — Research
  Platform UX + Identity** (11 subfases RP.1–RP.11, **todas PLANNED**, ninguna
  implementada). `PROJECT_EXECUTION_PLAN.md` VERSION 1.0 → 1.1.

Decisiones en curso / pendientes (DECISION REQUIRED):
- Tabla `research_runs` (existencia y diseño) — modelada en dominio, no creada.
- Proveedor de autenticación, pagos/planes premium, acceso comercial a fuentes,
  almacenamiento de documentos, retención/borrado de datos → Decision Gates
  (AGENTS.md §2.3-bis, `docs/SECURITY.md` §9).

## Blockers

None

## Known Issues

- El producto definido (2026-09-19: Land Intelligence, Buscar Predio,
  expediente `/investigaciones/:id`, planes) está **documentado pero no
  implementado en la UI**: el frontend sigue siendo el panel Scout (8787) +
  Property Intelligence Drawer. La tabla `users` es solo para auditoría;
  roles/entitlements/auth aún no existen (ver `docs/SECURITY.md`).
- **No ejecutar `git reset --hard` ni `git clean -fd`** (regla AGENTS.md §2.7).

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