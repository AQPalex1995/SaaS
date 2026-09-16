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
- Encola en BullMQ los jobs de `geocoding` y `research` (best-effort; si Redis está caído el caso queda `pending` y se procesa cuando los workers vuelvan).
- **Respuesta 201**:
  ```json
  {
    "data": {
      "id": "b0000000-0000-0000-0000-000000000001",
      "propertyId": "a0000000-0000-0000-0000-000000000001",
      "status": "pending",
      "overallRiskLevel": "unknown",
      "createdAt": "2026-09-15T21:50:00.000Z"
    },
    "resolvedPropertyId": "a0000000-0000-0000-0000-000000000001"
  }
  ```
- **Respuesta 404**: `{ "error": "... no encontrada en data/scout.db ni en PostgreSQL" }`.

### `GET /api/v1/research/:id`
Consulta el estado de un expediente de investigación.

### `GET /api/v1/research/:id/tasks`
Lista las 8 tareas del expediente con su estado individual (`pending`, `running`, `completed`, `failed`, `requires_manual_action`, `unavailable`, `skipped`, `blocked`).
- Estados explicables: `identity` y `geolocation` llegan a `completed`/`skipped`; las tareas apoyadas en conectores stub (`registry`, `bgr`, `urbanism`, `judicial`, `market`, `risk`) terminan en `unavailable` hasta que se implementen los conectores (política anti-datos-inventados).

### `GET /api/v1/research/:id/results`
Lista todos los resultados y evidencias acumuladas para el expediente.

---

## 5. Endpoints de Conectores & Fuentes (`/api/v1/sources`)

### `GET /api/v1/sources`
Lista el catálogo de los 14 conectores registrados y el estado actual de cada uno.
- El conector `openstreetmap` es **real** (Nominatim) en el servidor en ejecución, por lo que su estado aparece como `available`; los otros 13 permanecen `unavailable` (stubs).
- **Respuesta 200**:
  ```json
  {
    "data": [
      {
        "sourceId": "sunarp",
        "status": "unavailable",
        "message": "SUNARP Conoce Aquí connector is not yet implemented",
        "lastChecked": "2026-09-15T21:48:30.257Z"
      },
      ...
    ]
  }
  ```

### `GET /api/v1/sources/:id`
Consulta el estado de un conector específico (ej. `/api/v1/sources/sunarp`).
- **Respuesta 200**: Detalle del conector.
- **Respuesta 404**: Si el conector no existe en el registro.
