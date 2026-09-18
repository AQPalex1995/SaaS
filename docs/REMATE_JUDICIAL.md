# REM@JU — Discovery (Fase 4, T4.1)

> **Fecha**: 2026-09-17 · **Tarea**: T4.1 discovery · **Estado**: DONE
> Objetivo de la Fase 4 (plan): "Conectar información pública de remates
> judiciales de manera legal y respetando mecanismos de acceso." Regla dura:
> **NO bypass CAPTCHA**, **NO automatizar autenticación**.

---

## 1. Resumen ejecutivo

- **REM@JU = "Remate Electrónico Judicial"** (Poder Judicial del Perú),
  portal web en `https://remaju.pj.gob.pe/`.
- La **información pública** de remates (bien inmueble, ubicación, fechas,
  valor de tasación, expediente) se muestra **sin autenticación** en el home y
  en páginas públicas servidas por el servidor.
- La **participación** (inscripción de postores, posturas, resultados) requiere
  **login** (cuenta SINOE / casilla electrónica o usuario "sin casilla") y
  resolución de **CAPTCHA** → **fuera de alcance** de automatización.
- **Iteración 1 viable (100% legal y sin CAPTCHA)**: consumir el **home y el
  listado público** (render servidor-side) con sesión HTTP + parseo HTML,
  respetando Akamai, **sin** acceder a la zona autenticada.
- La zona autenticada (si algún día se requiere) solo puede implementarse vía
  **Acción Manual** del motor existente (`manual_actions`, T3.4/T4.7).

## 2. Qué es REM@JU y marco legal

- Plataforma del Poder Judicial del Perú para ejecutar **remates judiciales en
  línea** (bienes muebles e inmuebles subastados tras embargo/ejecución).
- Marco: **Resolución Administrativa Nº 211-2016-CE-PJ** y **Directiva
  008-2016-CE-PJ** *"Normas y Procedimientos para la realización de los Remates
  Electrónicos Judiciales REM@JU"*; régimen procesal del remate en los arts.
  729–740 del **Código Procesal Civil** (publicidad obligatoria del aviso de
  remate).
- El aviso de remate es un acto de **publicidad legal obligatoria**: leerlo y
  referenciarlo es legítimo. Las fuentes tienen su propio aviso "AVISO
  IMPORTANTE" y "Términos y Condiciones" (dialog al cargar), que deben ser
  archivados durante la implementación del conector.

## 3. Stack técnico y superficie de acceso

- **Aplicación**: JavaServer Faces (JSF) + **PrimeFaces 8.0**, versión app
  **3.7.1**, contexto `/remaju`, servidor WebLogic
  (`;jsessionid=...P-Nodo3:SRemaju7-1`).
- **WAF/Bot**: Akamai (`stormcaster.js`, `validate.perfdrive.com`, cookies
  `__uzdbm_*`). Sesión JSF por cookie `jsessionid` + token
  `javax.faces.ViewState` en cada `POST`/AJAX.
- **Páginas observadas**:
  - `/` y `/remaju/index.xhtml` — **home público** (`formInicio`): carrusel
    "REMATE SIMPLE" con ubicación, fecha y botón "Detalle" que envía por AJAX:
    `convocatoria`, `tipoConvocatoria`, `remate` (ids numéricos). Render
    servidor, fácil de parsear con GET+sessión.
  - `/remaju/pages/publico/informativo.xhtml` — info pública (JSF, sin login).
  - `/remaju/pages/seguridad/login.xhtml` — **login** con **CAPTCHA**
    (`frmLogin:imgCaptcha`, base64; input `captcha` max 5; botón "Refrescar"),
    "Con Casilla" / "Sin Casilla", link "Términos y Condiciones".
  - `/remaju/faces/page/remaju.xhtml` — devuelve **"No Autorizado"** (requiere
    sesión autenticada).
- El menú "Remates" es **AJAX** (`menuExternoForm:j_idt23`); el listado/detalle
  público se sirve vía **partial POST PrimeFaces** (requiere reproducir
  `ViewState` en una sesión real), no hay URL GET directa (verificación de una
  URL candidata devolvió 404). **No hay JSON/API pública.**

## 4. Datos disponibles públicamente (observados en vivo)

Del carrusel público del home (muestra 2026-09-17):

| Campo | Ejemplo | Uso en el producto |
|---|---|---|
| tipo de convocatoria | `REMATE SIMPLE` (tipoConvocatoria=1) | clasificación de señal |
| ubicación | MIRAFLORES, CARABAYLLO, CHICLAYO, CUSCO… | **linking por distrito** |
| fecha límite / remate | 27/09/2026 · "ÚLTIMO DÍA DE INSCRIPCIÓN" | vigencia de la señal |
| ids internos | convocatoria=40451, remate=25296 | clave única `remaju` (provenance) |

En el **detalle** (zona pública, vía AJAX) se espera además: descripción del
bien, **partida registral (SUNARP)**, expediente, juzgado, valor de tasación y
posturas — se confirmará/refinará en T4.5 con capturas reales de la página
pública (sin login).

## 5. Restricciones de acceso y anti-bots

1. **CAPTCHA**: presente en el **login** (autenticación). Prohibido bypassearlo;
   cualquier flujo autenticado = **Acción Manual** (persona resuelve).
2. **Akamai WAF**: protección del sitio completo. Un cliente HTTP debe usar los
   encabezados normales (UA), **frecuencia baja**, reutilizar una única sesión y
   tratar `403`/challenge como degradación (`unavailable`/manual), nunca evadir.
3. **JSF ViewState**: cada interacción POST/AJAX requiere token + `jsessionid`.
   Parsear el home no lo exige (GET simple); listado/detalle sí.
4. **Sin API JSON**, sin URLs GET estables de listado/detalle (verificado 404).

## 6. Cumplimiento legal y protección de datos

- **Protección de datos (Ley 29733 y D.S. 003-2013-JUS)**: el aviso de remate
  es público por mandato judicial, pero se debe **minimizar el dato personal**.
  - Almacenar datos del **inmueble** (descripción, partida, ubicación, tasación,
    fechas, expediente) y del **proceso** (expediente, distrito) — no los datos
    del deudor salvo que sean imprescindibles para el enlace; si se guardan
    nombres de titulares (para linking por persona), tratarlos como dato
    sensible con finalidad limitada al producto de inteligencia territorial.
- **Términos y Condiciones del portal** (dialog de login): archivar una copia y
  registrar el análisis de cumplimiento en `CHANGELOG_AGENTS.md`/ADR en T4.2.
- **Límite de uso**: lectura de información pública con fines de seguimiento a
  predios; **nada** de automatización de posturas, pagos o trámites (BN).

## 7. Mapeo al modelo de datos existente

- Conector: `remaju` (ya existe en el registry y en `source_type`).
- `dataType` propuesto: `judicial_remate` (o `remates`).
- Provenance (T3.5 `recordResearchResult`): `source=remaju`, `source_url` =
  URL del home/detalle observado, `retrievedAt`, `confidence` (`medium` si solo
  llegó del listado público, `high` en detalle verificado + linked),
  `verification=reported`, `parser_version=v1`, `raw_data` = HTML/JSON parseado.
- **Linking (T4.5)**: clave fuerte = **partida registral SUNARP** (en el
  detalle público) → `properties` vía partida; secundario = distrito +
  dirección. Los remates sin partida quedan como señales sin enlace
  (`candidate`).
- **Señal de riesgo (Fase 11)**: "remate activo sobre el predio" es una señal
  `judicial` de riesgo alto para el Risk Engine y una alerta de
  oportunidad/riesgo (Fase 14).

## 8. Viabilidad por tarea (T4.2–T4.9) — recomendaciones

| Tarea | Viabilidad | Enfoque recomendado |
|---|---|---|
| T4.2 parser | ✅ Alta (zona pública) | Parser HTML del home/carrusel (GET + sesión) y, si es alcanzable sin auth ni captcha, del listado/detalle público vía AJAX JSF con ViewState. Fixtures offline para tests. |
| T4.3 normalization | ✅ Alta | Normalizar tipoConvocatoria, ubicaciones, fechas dd/MM/yyyy, valores numéricos S/, ids → campos tipados + `raw_data`. |
| T4.4 deduplication | ✅ Alta | Dedup por `remate`/`convocatoria` (ids únicos) + hash del detalle; reutilizar `contentHash` de ingesta. |
| T4.5 property linking | ⚠️ Media/Alta | Por partida registral (fuerte) o distrito+dirección (débil); todo candidato sin hard-match. |
| T4.6 research connector | ✅ Alta | Implementar `PropertyDataSource` `remaju` (busca por distrito/partida) → tarea `judicial` del motor (T3.x) responde con resultados/`unavailable`. |
| T4.7 manual action handling | ✅ (existente) | CAPTCHA/auth del portal → `manual_actions` (T3.4) si se requiere un paso humano puntual; el flujo automático NO entra a login. |
| T4.8 tests | ✅ Alta | Mismo patrón que `osm.test.ts`: `fetch` stubbed + fixtures HTML; sin red en la suite. |
| T4.9 monitoring | ✅ Alta | Métricas del conector: sesiones, fetch OK/403/captcha, remates nuevos, dedups; logs pino con censura. |

## 9. Fuentes oficiales complementarias (nota)

- **Diario Oficial El Peruano — "Remates Judiciales"**
  (`diariooficial.elperuano.pe/RematesJudiciales`): listado por mes/día de los
  avisos de remate publicados. Estático y de referencias oficiales; candidato a
  fuente secundaria/contraste (fuera del alcance T4.x salvo decisión).
- **CEJ — Consulta de Expedientes Judiciales**: ya planeado como conector
  `cej` (Fase 4/5 del motor). Complementa el contexto procesal del remate.

## 10. Referencias

- Portal REM@JU: https://remaju.pj.gob.pe/
- Login (con CAPTCHA): https://remaju.pj.gob.pe/remaju/pages/seguridad/login.xhtml
- Info pública: https://remaju.pj.gob.pe/remaju/pages/publico/informativo.xhtml
- Directiva 008-2016-CE-PJ / RA Nº 211-2016-CE-PJ (procedimiento REM@JU).
- gob.pe servicio "Participar en procesos de remates judiciales (Remaju)".
- Ley 29733 y D.S. 003-2013-JUS (protección de datos personales, Perú).