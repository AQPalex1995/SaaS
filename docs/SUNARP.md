# SUNARP — Registro y Titularidad (Fase 5)

> **Estado**: Fase 5 / T5.1 (Conoce Aquí) ✅ + T5.2 (Consulta de Propiedad) ✅ + T5.3 (SPRL) ✅ + T5.4 (Registry normalization) ✅ + T5.5 (Owners) ✅ + T5.6 (Charges) ✅ + T5.7 (Titles) ✅ + T5.8 (Historical data) ✅ + T5.9 (Provenance superficie) ✅ — DONE (2026‑09‑19).
> Reporte de discovery, postura del conector `sunarp` y normalización registral.

## 1. Qué es SUNARP

La **Superintendencia Nacional de los Registros Públicos (SUNARP)** administra
los registros jurídicos del Perú: Propiedad Inmueble, Vehicular, Personas
Naturales y Personas Jurídicas (~33 millones de partidas vigentes). La Zona
Registral que cubre Arequipa es la **Nº XII — Sede Arequipa**, prioritaria para
este ecosistema.

Portal institucional: `https://www.gob.pe/sunarp`.

## 2. Superficies de consulta registral (estado 2026)

Ninguna superficie web de SUNARP es consultable **sin identidad personal**.
Todas las gratuitas exigen además **CAPTCHA**; la de valor legal es de pago.

| Servicio | URL | Acceso | Alcance | Costo |
|---|---|---|---|---|
| **Conoce Aquí** | `https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio` | DNI + fecha de emisión + **CAPTCHA** | Contenido de la partida (4 registros); asientos con tramado "no constituye publicidad registral"; no imprimible | Gratis |
| **Consulta de Propiedad** | `https://www2.sunarp.gob.pe/consulta-propiedad` | DNI/carnet de extranjería + fecha de emisión + **CAPTCHA** (+ validación de correo OTP) | Localización de partidas a **nombre del propietario** (busca por nombres, con **homonimia**); vista simple: titular, partida, cargas vigentes | Gratis |
| **SPRL (Publicidad Registral en Línea)** | `https://sprl.sunarp.gob.pe` | Usuario y clave (suscripción gratuita; consulta pagada) | Visualización/imprevisto de partida, copias literales, certificados (valor legal) | S/ 6.90/página; copia literal ~ S/ 14 (2 hojas) + S/ 7 extra |
| **Visor BGR** | visor de la Base Gráfica Registral | DNI + fecha de emisión + **CAPTCHA** | Mapas de predios incorporados a la BGR; búsqueda por ubicación/partida/coordenadas | Gratis (3 accesos/día, 45 min) |
| **Consulta Verificadores** | `https://www.sunarp.gob.pe/ConsultaVerificadores/` | Apellido paterno + primer nombre + **CAPTCHA** obligatorio | Verificación de registradores públicos | Gratis |

Detalle de **Conoce Aquí** (objetivo de T5.1):

- Login con **DNI + fecha de emisión** validados y **clic en el CAPTCHA**.
- Límites operativos: **3 a 5 consultas/visualizaciones por día por DNI**;
  cada visualización de la partida queda disponible **30 minutos**.
- Asientos con **tramado de agua** indicando "servicio gratuito, no constituye
  publicidad registral"; **no se puede imprimir**.
- Excepción legal: información de acceso restringido (p. ej. **testamentos**)
  solo visible para el titular.

Detalle de **Consulta de Propiedad** (T5.2):

- Es la vía para **localizar la(s) partida(s) a nombre de un propietario**
  cuando no se conoce el número de partida (entrada natural de la tarea
  `registry` del Research Engine: DNI/RUC del vendedor o nombre del titular).
- Formulario: tipo de documento (DNI / carnet de extranjería) + número +
  **fecha de emisión** + correo electrónico + **verificación de seguridad
  (CAPTCHA)**; el código se envía al correo (validación OTP).
- Resultado: lista de partidas coincidentes por nombre (a veces varias por
  **homonimia**); la "Vista Simple" muestra titular, partida y cargas vigentes.
- Igual que Conoce Aquí: **no automatizable** (identidad + CAPTCHA + correo OTP;
  Ley 29733, minimización de datos). El conector `search()` lo señala con
  `requiresManualAction` y la URL oficial.

Detalle de **SPRL** (T5.3):

- **Servicio de Publicidad Registral en Línea** con **valor legal** (el único
  camino a copias literales / certificados de gravamen oficiales).
- Suscripción **gratuita** (usuario + clave), pero **cada consulta es de pago**:
  visualización de partida (~S/ 6.90/página); copia literal ~S/ 14.00 (las dos
  primeras hojas) + S/ 7.00 por hoja adicional; certificados varios.
- No automatizable: requiere credenciales personales, **pago por servicio** y
  CAPTCHA; no se automatiza la compra ni se almacenan credenciales. El conector
  `sunarp_sprl` (`SunarpSprlConnector`) reporta `requires_auth` +
  `requiresManualAction` con la guía de pago (visión en `docs/CONNECTORS.md`).

## 3. Veredicto de automatización

> **No existe superficie pública SUNARP sin identidad + CAPTCHA** (a diferencia
> del home público de REM@JU, Fase 4). Por tanto:

1. **No se automatiza ninguna consulta SUNARP**:
   - implica datos personales (DNI + fecha de emisión) → prohibido almacenar
     según la **Ley 29733 / D.S. 003‑2013‑JUS** (minimización de datos);
   - además violaría la política dura del proyecto: **no bypass de CAPTCHA**;
   - hay límites diarios por identidad (3–5 consultas/día).
2. **Postura honesta del conector `sunarp`** (`SunarpConnector`):
   - `getStatus()` → `requires_auth` + `requiresManualAction: true` con
     instrucciones para el operador (guía combinada: localizar partida por
     nombre en **Consulta de Propiedad** y ver contenido en **Conoce Aquí**);
   - `search()` → resultado vacío (nunca datos simulados) + señala
     `requiresManualAction` con las instrucciones de **Consulta de Propiedad**
     (búsqueda por propietario);
   - `getDetails()` → `found:false` + `requiresManualAction: true` orientado a
     **Conoce Aquí** (contenido de partida conocida).
3. **Impacto en el Research Engine**: la tarea `registry` (Tarea 3) y `bgr`
   transicionan a `requires_manual_action` creando una `manual_actions`
   (kind `login`) con la descripción, en lugar de `unavailable`. El operador
   consulta Conoce Aquí/SPRL de forma manual (usuario humano, identidad propia)
   y el resultado (partida, titular, cargas) se persiste vía el intake de
   `registry_properties` existente (T4.5) o el flujo general (T5.10).

## 4. Recomendaciones por servicio (plan Fase 5)

- **T5.1 Conoce Aquí** → ✅ DONE: conector `sunarp` reporta `requires_auth`
  (manual) para el contenido de partidas conocidas.
- **T5.2 Consulta de Propiedad** → ✅ DONE: misma postura en `search()`
  (`requiresManualAction`, instrucciones de búsqueda por propietario). Sirve para
  localizar la partida por nombre del propietario cuando no se conoce el número;
  el Research Engine incluye la guía combinada (Consulta de Propiedad + Conoce
  Aquí) en la manual action de la tarea `registry`.
- **T5.3 SPRL** → ✅ DONE: conector `sunarp_sprl` real de postura
  (`server/src/connectors/implementations/sunarp-sprl.ts`, registrado en
  `index.ts` 1e): `requires_auth` + `requiresManualAction` que documenta
  suscripción gratuita + **pago por servicio** (kind `payment` en el flujo
  manual del operador; copias legales/certificados). No se automatiza la compra.
- **T5.4 Registry normalization** → ✅ DONE (2026‑09‑18): normalización pura de
  la captura manual del registro en
  `server/src/connectors/implementations/sunarp-normalize.ts`
  (`normalizeRegistryPartida`, `registryLookupKey`, `normalizeRegistryCapture`).
  - **Clave canónica** `P-XXXXXXXX` (Zona Registral XII — Arequipa, prefijo de
    oficina `110` opcional): es lo que se persiste en
    `registry_properties.registry_number` y permite **deduplicar el cache de
    pagos de SPRL** (primera consulta pagada → almacenada; búsquedas siguientes
    por clave canónica sin volver a pagar). Acepta `P-12345678`, `p12345678`,
    `P 1234 5678`, `12345678` y `11012345678` (11 dígitos con oficina).
  - **Campos de la captura** (titulares y cargas) se tipan y normalizan para
    `registry_owners` / `registry_charges`: nombre (Title Case), tipo de
    documento (DNI/RUC/CE/PASAPORTE), tipo de titular
    (natural/jurídica/desconocido), porcentaje (0–100), tipo de carga
    (hipoteca/embargo/medida_cautelar/anotación/prohibición/servidumbre/usufructo),
    estado (si/no/unknown), montos S/ y US$, fechas dd/MM/yyyy→ISO y m².
  - Integrado en el intake manual (T4.5): `planRemateIntake` ahora persiste la
    clave canónica en `registry_properties.registry_number` ("antes de persistir").
  - Tests offline `server/tests/sunarp-normalize.test.ts` (20) + fixture
    `server/tests/fixtures/registry-capture.json`. Dos bugs reales detectados por
    la batería y corregidos: `normalizeAreaM2` dejaba el dígito de "m2" en "380 m2"
    → 3802, y `normalizeCarga`/`amount` no parseaba separadores de miles
    ("S/ 1,234.56" → null). Suite **187/187 (27 archivos)**; typecheck server+root
    y build OK.
- **T5.5 Owners** → ✅ DONE (2026‑09‑19): los **titulares** de la partida
  capturados por el operador se normalizan (helper `normalizePropietarios`,
  reutiliza `PropietarioNormalizado`) y se **persisten en `registry_owners`**
  vinculados a la fila de `registry_properties` (FK `registry_property_id` →
  `registryId` del intake):
  - `planRemateIntake` acepta `propietarios` (array o un único objeto) en el
    payload manual; solo persiste titulares aprovechables (con nombre y/o
    documento) y advierte si la captura no deja ninguno.
  - `RemateIntakeService.saveOwners` inserta el array en un solo INSERT con
    `source: 'sunarp'`, porcentaje en texto numérico (columna `numeric(5,2)`) y
    `rawData: { parserVersion }`; `RemateIntakeResult.ownersPersisted` reporta
    cuántas filas se crearon.
  - Tests: `sunarp-normalize.test.ts` (`normalizePropietarios`),
    `remate-manual.test.ts` (planner) y `remate-intake.service.test.ts`
    (persistencia). Suite **191/191 (27 archivos)**; typecheck server+root y
    build OK.
- **T5.6 Charges** → ✅ DONE (2026‑09‑19): las **cargas/gravámenes** de la
  partida capturadas por el operador se normalizan (helper `normalizeCargas`,
  reutiliza `CargaNormalizada`/`normalizeCarga`) y se **persisten en
  `registry_charges`** vinculados a la fila de `registry_properties` (FK
  `registry_property_id` → `registryId` del intake):
  - `planRemateIntake` acepta `cargas` (array o un único objeto) en el payload
    manual; solo persiste cargas aprovechables (con tipo/descripción/monto/
    acreedor) y advierte si la captura no deja ninguna.
  - `RemateIntakeService.saveCharges` inserta el lote en un solo INSERT con
    `source: 'sunarp'`, monto en texto numérico (columna `numeric(15,2)`),
    moneda (PEN/USD), estado si/no/unknown y `rawData: { parserVersion }`;
    `RemateIntakeResult.chargesPersisted` reporta cuántas filas se crearon.
  - Tests: `sunarp-normalize.test.ts` (`normalizeCargas`), `remate-manual.test.ts`
    (planner) y `remate-intake.service.test.ts` (persistencia). Suite
    **195/195 (27 archivos)**; typecheck server+root y build OK.
- **T5.7 Titles** → ✅ DONE (2026‑09‑19): el **historial de títulos/asientos**
  de la partida capturado por el operador se normaliza (helper `normalizeTitulos`,
  shape `TituloNormalizado`: titleNumber/titleDate/titleType/notary/description)
  y se **persiste en `registry_titles`** vinculado a la fila de
  `registry_properties` (FK `registry_property_id` → `registryId` del intake):
  - `planRemateIntake` acepta `titulos` (array o un único objeto) en el payload
    manual; solo persiste títulos aprovechables (algún dato real) y advierte si
    la captura no deja ninguno.
  - `RemateIntakeService.saveTitles` inserta el lote en un solo INSERT con
    `source: 'sunarp'`, fechas en ISO (YYYY‑MM‑DD) y `rawData: { parserVersion }`;
    `RemateIntakeResult.titlesPersisted` reporta cuántas filas se crearon.
  - Tests: +1 `sunarp-normalize.test.ts` (`normalizeTitulos`), +2
    `remate-manual.test.ts` (planner) y +1 `remate-intake.service.test.ts`
    (persistencia → 2 INSERTs: registry + titles). Suite
    **199/199 (27 archivos)**; typecheck server+root y build OK.
- **T5.8 Historical data** → ✅ DONE (2026‑09‑19): nuevo módulo puro
  `sunarp-historical.ts` con `deriveHistoricalState(titulos, cargas)` que
  **deriva el estado registral** de la partida desde el historial de
  asientos/títulos y cargas ya normalizados (T5.6/T5.7):
  - Estado: `cargado` (hay cargas con `isActive: 'si'`), `sano` (solo cargas
    vencidas/canceladas) o `desconocido` (sin cargas capturadas).
  - Resumen: nº de títulos/cargas, listas `activeCharges`/`inactiveCharges`,
    deuda activa por moneda (`totalActiveDebtPen`/`totalActiveDebtUsd`,
    redondeada a 2 decimales) y `lastTitleDate` (máximo de fechas ISO de los
    títulos; null si no hay).
  - `planRemateIntake` expone la derivación en `RemateManualNormalized.historical`
    y en `RegistryPlanRow.historical` (queda en `rawData` del registry row; sin
    migración, sin DB).
  - Tests: nuevo archivo `sunarp-historical.test.ts` (5 casos) + 1 en
    `remate-manual.test.ts` (plan expone la derivación). Suite
    **205/205 (28 archivos)**; typecheck server+root y build OK.
- **T5.9 Provenance (superficie)** → ✅ DONE (2026‑09‑19, alcance acotado con el
  usuario: bloque de provenance en la superficie, sin migración ni DB):
  - Tipo reutilizable `IntakeProvenance`
    (`sunarp-historical.ts`): `{ source, sourceUrl, retrievedAt, confidence,
    verification, parserVersion }` — misma disciplina que
    `result-provenance.ts` de T3.5, ahora explícita en la **superficie** de los
    DTOs del intake (sin excavar `rawData`).
  - `RemateManualNormalized.provenance` — el intake tal como lo ingresó el
    humano: `source: 'manual'`, `sourceUrl` = `sourceUrlPdf` (PDF del aviso)
    o `null`, `confidence: 'medium'`, `verification: 'reported'`,
    `parserVersion: 'manual-v1'`.
  - `RegistryPlanRow.provenance` — la fila registral a persistir:
    `source: 'remaju'`, `parserVersion: SUNARP_PARSER_VERSION` (la clave
    canónica/la captura se normalizan con el parser SUNARP v1).
  - `RegistryHistoricalState.provenance` (T5.8 + T5.9) — el estado derivado es
    una **derivación del sistema**: `source: 'sunarp'`,
    `verification: 'inferred'`, `confidence: 'medium'`
    (regla HECHO/SEÑAL de `docs/RESEARCH_GOVERNANCE.md` §2: una derivación
    nunca se presenta como HECHO verificado).
  - `planRemateIntake(input, retrievedAt?)` propaga un único `retrievedAt`
    (default: ahora) a los tres bloques; el provenance viaja por
    `manualAction.result` → `research_results.data` (persistencia ya existente
    vía `recordResearchResult`) y en `registry_properties.raw_data`.
  - Tests: +2 `remate-manual.test.ts` (superficie intake/registry/historical +
    sin PDF), +2 `sunarp-historical.test.ts` (provenance + override parcial),
    +1 `remate-intake.service.test.ts` (provenance en result y en el payload de
    `completeManualAction`). Suite **210/210 (28 archivos)**; typecheck
    server+root y build OK.
- **BGR (Fase 6, visor)** → DNI + CAPTCHA: misma postura `requires_auth` en
  `sunarp_bgr`.
- **SPRL histórico** (T5.8) → via copias literales manuales.

## 5. Reglas críticas vigentes

- **No** automatizar autenticación ni CAPTCHA de SUNARP.
- **No** almacenar DNI/fecha de emisión de individuos.
- **No** inventar datos: resultados vacíos o `requires_manual_action`, nunca
  datos simulados.
- El conector `sunarp` **no realiza peticiones de red** (postura estática,
  honesta y verificada contra la documentación oficial de gob.pe).

## 6. URLs de referencia (2026)

- Conoce Aquí: https://conoce-aqui.sunarp.gob.pe/conoce-aqui/inicio
- Consulta de Propiedad: https://www2.sunarp.gob.pe/consulta-propiedad
- SPRL: https://sprl.sunarp.gob.pe
- gob.pe — consultar gratis partidas: https://www.gob.pe/50685
- gob.pe — consultar datos de propiedad: https://www.gob.pe/26531
- gob.pe — ver partidas en SPRL: https://www.gob.pe/381
- gob.pe — Visor BGR: https://www.gob.pe/63173
- ALÓ SUNARP: 0800‑27164 · consultas@sunarp.gob.pe