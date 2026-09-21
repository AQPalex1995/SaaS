# Especificación de API REST — Fastify (Puerto 3001)

## 1. Convenciones Generales

- **Servidor**: Fastify 5 en `http://127.0.0.1:3001`.
- **Formato**: JSON estricto (`Content-Type: application/json`).
- **CORS**: Habilitado para comunicación con el Scout en `http://127.0.0.1:8787` y clientes locales.
- **Prefijo de API**: `/api/v1`.
- **Manejo de Errores**: Todos los errores devuelven un objeto consistente:
  ```json
  {
    "error": "NombreDelError",
    "message": "Descripción amigable del error",
    "statusCode": 404
  }
  ```

---

## 2. Endpoints de Diagnóstico & Salud

### `GET /health`
Verifica el estado del servicio, conexión a PostgreSQL + PostGIS y disponibilidad de Redis.
- **Respuesta 200 (Saludable)** / **503 (Modo Degradado)**:
  ```json
  {
    "status": "healthy",
    "service": "land-intelligence-server",
    "version": "0.1.0",
    "timestamp": "2026-09-15T21:48:19.166Z",
    "database": {
      "connected": true,
      "postgis": true,
      "version": "PostgreSQL 16.2..."
    },
    "redis": {
      "connected": true
    }
  }
  ```

### `GET /api/health`
Alias directo de `/health`.

---

## 3. Endpoints de Inmuebles (`/api/v1/properties`)

### `GET /api/v1/properties`
Lista propiedades unificadas con paginación.
- **Query Params**: `page` (default: 1), `per_page` (default: 20, max: 100).
- **Respuesta 200**:
  ```json
  {
    "items": [...],
    "total": 142,
    "page": 1,
    "perPage": 20,
    "totalPages": 8
  }
  ```

### `GET /api/v1/properties/:id`
Detalle completo de una propiedad por su UUID o public ID.
- **Respuesta 200**:
  ```json
  {
    "data": {
      "id": "a0000000-0000-0000-0000-000000000001",
      "publicId": "PRP-00001",
      "title": "Terreno en La Joya 500m2",
      "propertyType": "terreno",
      "status": "active",
      "price": "45000.00",
      "currency": "USD",
      "areaM2": "500.00",
      "district": "La Joya",
      "department": "Arequipa",
      "primarySource": "facebook_marketplace"
    }
  }
  ```
- **Respuesta 404**: `{ "error": "Property not found" }`.

### `POST /api/v1/properties`
Crea una nueva propiedad unificada en PostgreSQL.
- **Body**: Campos del inmueble (`title`, `propertyType`, `price`, `currency`, `areaM2`, `district`, `primarySource`).
- **Respuesta 201**: Propiedad creada.

### `GET /api/v1/properties/:id/listings`
Lista todas las publicaciones asociadas al inmueble unificado.
- **Respuesta 200**: `{ "data": [ ... ] }`.

### `GET /api/v1/properties/:id/scores` (Preparado para Fase 3)
Devuelve respuesta explícita de fase planificada:
```json
{
  "status": "not_implemented",
  "message": "Property scoring is prepared but not yet implemented",
  "plannedFor": "Phase 3 - Market Intelligence"
}
```

### `GET /api/v1/properties/:id/alerts` (Preparado para Fase 3)
```json
{
  "status": "not_implemented",
  "message": "Property alerts are prepared but not yet implemented",
  "plannedFor": "Phase 3 - Risk Analysis"
}
```

---

## 4. Endpoints de Investigación (`/api/v1/research`)

### `GET /api/v1/properties/:id/research`
Lista todos los casos de investigación iniciados sobre una propiedad.
- `:id` puede ser un **UUID** de PostgreSQL **o un ID legacy de SQLite** (ej. `1709640736761984`). En el segundo caso se resuelve on-the-fly contra `data/scout.db`.
- **Respuesta 200**: `{ "data": [ ... ], "resolvedPropertyId?": "<uuid>" }` (el campo `resolvedPropertyId` se incluye sólo cuando se resolvió un ID legacy).

### `POST /api/v1/properties/:id/research`
Inicia un nuevo expediente de investigación para la propiedad e inserta automáticamente las **8 tareas de investigación**.
- `:id` puede ser un **UUID** o un **ID legacy de SQLite** (Facebook/adondevivir/urbania). Si el ID legacy aún no está sincronizado, la propiedad se crea automáticamente (ingesta on-the-fly), respetando la deduplicación por `content_hash`.
- Encola en BullMQ los jobs de `geocoding` y `research` (best-effort). Si al menos uno se encola, el caso pasa a `queued`; si Redis está caído no se encola nada y el caso queda en `created` hasta que los workers vuelvan.
- **Respuesta 201**:
  ```json
  {
    "data": {
      "id": "b0000000-0000-0000-0000-000000000001",
      "propertyId": "a0000000-0000-0000-0000-000000000001",
      "status": "queued",
      "summary": null,
      "errorCount": 0,
      "warningCount": 0,
      "completedTaskCount": 0,
      "totalTaskCount": 8,
      "startedAt": null,
      "completedAt": null,
      "createdBy": "system",
      "createdAt": "2026-09-15T21:50:00.000Z",
      "updatedAt": "2026-09-15T21:50:00.050Z"
    },
    "resolvedPropertyId": "a0000000-0000-0000-0000-000000000001"
  }
  ```
- **Ciclo de vida** (`status`): `created → queued → running → completed | partial | failed` (`pending` legacy, `cancelled` reservado). Ver `docs/RESEARCH_ENGINE.md` §4.
- **Respuesta 404**: `{ "error": "... no encontrada en data/scout.db ni en PostgreSQL" }`.

### `GET /api/v1/research/:id`
Consulta el estado de un expediente de investigación.
- **Respuesta 200**: `{ "data": { ...ResearchCaseDTO } }`.
- **Respuesta 400**: `{ "error": "Invalid research case id (expected UUID)" }` si `:id` no es un UUID válido.
- **Respuesta 404**: `{ "error": "Research case not found" }` si el caso no existe.

### `GET /api/v1/properties/:id/history` (RP.3 — Research history)
Historial completo del predio: **PROPERTY** + todos sus **RESEARCH_CASE /
RESEARCH_RUN**, distinguiendo los tres niveles de `docs/RESEARCH_GOVERNANCE.md`
§4. Las ejecuciones se derivan de `research_cases.run_number` (ADR-007: no hay
tabla `research_runs` todavía).
- `:id` puede ser un **UUID** de PostgreSQL o un **ID legacy de SQLite**
  (resolución on-the-fly como el resto de rutas de research).
- **Respuesta 200**:
  ```json
  {
    "data": {
      "property": { "...PropertySummary" },
      "runs": [
        {
          "runNumber": 1,
          "caseId": "b0000000-0000-0000-0000-000000000001",
          "status": "completed",
          "summary": null,
          "errorCount": 0,
          "warningCount": 0,
          "completedTaskCount": 8,
          "totalTaskCount": 8,
          "startedAt": "2026-09-15T21:50:00.000Z",
          "completedAt": "2026-09-15T21:51:00.000Z",
          "createdBy": "system",
          "createdAt": "2026-09-15T21:50:00.000Z",
          "updatedAt": "2026-09-15T21:51:00.000Z"
        }
      ],
      "cases": [
        {
          "runNumber": 1,
          "caseId": "b0000000-0000-0000-0000-000000000001",
          "status": "completed",
          "summary": null,
          "errorCount": 0,
          "warningCount": 0,
          "completedTaskCount": 8,
          "totalTaskCount": 8,
          "startedAt": "2026-09-15T21:50:00.000Z",
          "completedAt": "2026-09-15T21:51:00.000Z",
          "createdBy": "system",
          "createdAt": "2026-09-15T21:50:00.000Z",
          "updatedAt": "2026-09-15T21:51:00.000Z",
          "tasks": [ { "taskType": "identity", "status": "completed", "requiresManualAction": false } ],
          "results": [
            {
              "researchTaskId": "c0000000-0000-0000-0000-000000000001",
              "taskType": "identity",
              "source": "admin_intake",
              "dataType": "identity",
              "retrievedAt": "2026-09-15T21:50:10.000Z",
              "confidence": "high",
              "verification": "reported",
              "parserVersion": "identity-v1"
            }
          ],
          "changes": [
            { "taskType": "registry", "source": "sunarp_intake", "change": "edited", "fieldsChanged": ["titular"], "changedAt": "2026-09-15T21:50:20.000Z" }
          ],
          "updated": true
        }
      ]
    }
  }
  ```
- **`changes`** compara la ejecución con la **anterior** del mismo predio por
  `(taskType, source)`: `added` (aparece), `removed` (desaparece), `edited`
  (cambió el dato normalizado; `fieldsChanged` lista las claves de primer nivel
  de `data` que cambiaron), `unchanged`. `changedAt` = `retrievedAt` de la
  versión nueva; `updated` = `true` si la ejecución introdujo o perdió
  información vs. la previa.
- **Respuesta 404**: `{ "error": "Research case not found" }` si el predio no
  existe; id legacy no resoluble → mensaje honesto de publicación no
  encontrada.

### `GET /api/v1/research/:id/tasks`
Lista las tareas del expediente con su estado individual (`pending`, `running`, `completed`, `failed`, `requires_manual_action`, `unavailable`, `blocked`, `skipped`).
- Las transiciones de tarea se validan de forma atómica en `server/src/domain/research/task-lifecycle.ts` (`transitionTask()`); `completed` y `skipped` son estados **inmutables**, y los estados `failed` / `blocked` / `unavailable` / `requires_manual_action` pueden reintentarse (incrementa `retryCount`). **Nota (T3.8)**: `maxRetries` se expone en el DTO pero todavía no se aplica como tope en `transitionTask`. Ver `docs/RESEARCH_ENGINE.md` §5 y §8.
- Cada tarea expone: `retryCount`, `maxRetries`, `requiresManualAction`, `manualActionDescription`, `startedAt`, `completedAt`, `error`, `createdAt` y `updatedAt`.
- Estados explicables: `identity` y `geolocation` llegan a `completed`/`skipped`; las tareas apoyadas en conectores stub (`registry`, `bgr`, `urbanism`, `judicial`, `market`, `risk`) terminan en `unavailable` hasta que se implementen los conectores (política anti-datos-inventados).
- **Respuesta 400/404**: `:id` malformado → 400; caso inexistente → 404 (mismo contrato que `GET /research/:id`).

### `GET /api/v1/research/:id/results`
Lista todos los resultados y evidencias acumuladas para el expediente, con provenance completa (`source`, `source_url`, `retrieved_at`, `data`, `raw_data`, `confidence`, `verification`, `parser_version`, `metadata`).
- **Respuesta 400/404**: `:id` malformado → 400; caso inexistente → 404 (mismo contrato que `GET /research/:id`).

---

## 4.b Acciones Manuales REM@JU (`/api/v1/manual-actions`, Fase 4 / T4.5)

Flujo humano-en-el-bucle: el motor deja acciones manuales pendientes (p. ej.
captcha/filtros/PDF de REM@JU) y el operador las completa con un payload
normalizado. Los endpoints existen para cubrir el caso REM@JU; la UI mínima se
sirve desde el propio API. Política de privacidad: solo se guardan partida,
dirección, coordenadas y datos públicos del remate; **nunca** datos personales.

### `GET /api/v1/manual-actions`
Lista acciones manuales. Query opcional `status` (`requested` | `completed` |
`cancelled` | `all`; por defecto todas las de `?status` indicado, o todas si se
omite).
- **Respuesta 200**: `{ "data": [ManualActionDTO, ...] }`.

### `GET /api/v1/manual-actions/:id`
Detalle de una acción manual.
- **Respuesta 200**: `{ "data": ManualActionDTO }`; inexistente → 404.

### `POST /api/v1/manual-actions/:id/complete`
Completa la acción con los datos extraídos manualmente (opcionalmente el PDF del
aviso en base64). `bodyLimit` de 12 MB.
- **Body**:
  ```json
  {
    "payload": {
      "partida": "P-12345678",
      "distrito": "Arequipa",
      "direccion": { "urb": "Los Álamos", "avenida": "Ejército", "numero": "400", "lote": "12", "referencia": "frente al parque" },
      "valorDeuda": "S/ 150,000.50",
      "tasacion": 200000,
      "precioRemate": 180000,
      "convocatoria": "primera",
      "fechaRemate": "2026-10-01",
      "origenUbicacion": "partida",
      "latitude": -16.409,
      "longitude": -71.537
    },
    "completedBy": "analista",
    "pdf": { "name": "aviso.pdf", "contentType": "application/pdf", "base64": "JVBERi0..." }
  }
  ```
- **Respuesta 200**: `{ "data": ManualActionDTO, "plan": {...}, "registryId", "pdfKey", "locationApplied" }`.
- **Errores**: 400 payload/PDF inválido; 404 acción inexistente; 409 acción ya completada.

### `POST /api/v1/manual-actions/:id/cancel`
Cancela una acción manual pendiente (el operador decidió que no procede). La
tarea sigue en `requires_manual_action`; un re-run posterior puede pedir una
nueva acción.
- **Body (opcional)**: `{ "cancelledBy": "analista" }`.
- **Respuesta 200**: `{ "data": ManualActionDTO }` con `status: "cancelled"`.
- **Errores**: 404 acción inexistente; 409 acción ya completada.

### `GET /manual-actions`
UI HTML mínima (servida por el API) para listar pendientes y completar el
formulario, incluyendo subida de PDF (leído como base64 en el navegador).

---

## 4.c Monitoreo Operacional (`/api/v1/monitoring`, Fase 4 / T4.9)

### `GET /api/v1/monitoring/operations`
Resumen operacional read-side (sin escrituras) sobre el pipeline de
investigación:
- **manualCycle**: `total`, `requested`, `completed`, `cancelled`, `stalePending`
  (acciones pedidas hace más de `staleThresholdHours` — por defecto 168 h) y
  `avgCompletionHours` (media requested→completed).
- **judicialPipeline**: `tasks` por estado (`total`, `completed`,
  `requiresManualAction`, `failed`, `cancelled`, `pending`, `running`) y
  `resultsBySource` / `resultsByParser` de los resultados con
  `data_type = 'judicial'` (REM@JU público + intake manual).
- **stuck**: tareas que requieren atención, ordenadas por antigüedad:
  `stale_pending_action` (acción pendiente vencida) y `orphan_task`
  (tarea `requires_manual_action` sin acción pendiente).
- **Respuesta 200**: `{ "data": OperationsSummary }`.

### `GET /api/v1/monitoring/queues`
Profundidad de las 6 colas BullMQ (`scraping`, `research`, `geocoding`, `gis`,
`market`, `notifications`): `waiting`, `active`, `delayed`, `completed`,
`failed`, `paused`.
- Degrada con `connected: false` y todas las colas `null` cuando Redis no
  responde (nunca lanza 500).

---

## 5. Endpoints de Conectores & Fuentes (`/api/v1/sources`)

### `GET /api/v1/sources`
Lista el catálogo de los 14 conectores registrados y el estado actual de cada uno.
- Los conectores `openstreetmap` (real/Nominatim) y `remaju` (real/superficie
  pública) aparecen como `available`; `sunarp` (real/solo postura, T5.1) aparece
  como **`requires_auth`** con `requiresManualAction: true` e instrucciones para
  el operador (SUNARP no ofrece superficie consultable sin identidad + CAPTCHA);
  los 11 restantes permanecen `unavailable` (stubs). Ningún conector simula datos.
- **Respuesta 200**:
  ```json
  {
    "data": [
      {
        "sourceId": "sunarp",
        "status": "requires_auth",
        "requiresManualAction": true,
        "message": "SUNARP Conoce Aquí requiere login DNI + fecha de emisión + CAPTCHA (no automatizable)",
        "lastChecked": "2026-09-17T00:00:00.000Z"
      },
      ...
    ]
  }
  ```

### `GET /api/v1/sources/:id`
Consulta el estado de un conector específico (ej. `/api/v1/sources/sunarp`).
- **Respuesta 200**: Detalle del conector.
- **Respuesta 404**: Si el conector no existe en el registro.
