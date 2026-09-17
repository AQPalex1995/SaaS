# Base de Datos — PostgreSQL 16 + PostGIS 3.4 & Drizzle ORM

## 1. Visión General

La capa de persistencia de **Land Intelligence** utiliza **PostgreSQL 16** con la extensión espacial **PostGIS 3.4**, gestionada mediante **Drizzle ORM** (código TypeScript tipado en `server/src/db/schema/`).

- **Puerto de Conexión**: `5433` (no colisiona con el puerto `5432` del CAST ERP).
- **Nombre de Base de Datos**: `land_intelligence`.
- **Extensiones Habilitadas**: `postgis`, `"uuid-ossp"`.
- **Total de Tablas**: 27.
- **Total de Enums PostgreSQL**: 17.

---

## 2. Enums de PostgreSQL (`enums.ts`)

| Enum | Valores Permitidos | Propósito |
|---|---|---|
| `property_type` | `terreno`, `lote`, `casa`, `departamento`, `duplex`, `agricola`, `comercial`, `industrial`, `otro` | Clasificación física del inmueble |
| `property_status` | `active`, `inactive`, `sold`, `reserved`, `unknown` | Estado de comercialización del inmueble |
| `listing_status` | `active`, `inactive`, `expired`, `removed`, `unknown` | Estado de la publicación en la fuente |
| `source_type` | `facebook_marketplace`, `facebook_group`, `adondevivir`, `urbania`, `remaju`, `sunarp`, `sunarp_bgr`, `sunarp_sprl`, `google_maps`, `openstreetmap`, `impla`, `pdm`, `pat`, `municipality`, `cadastre`, `cej`, `sbn`, `cofopri`, `seace`, `manual`, `other` | Identificador de fuente o conector |
| `confidence_level` | `high`, `medium`, `low`, `unknown` | Certeza algorítmica del dato |
| `verification_status` | `reported`, `inferred`, `verified`, `conflicting`, `unknown` | Grado de corroboración oficial |
| `research_status` | `pending`, `running`, `completed`, `failed`, `cancelled`, `created`, `queued`, `partial` | Estado del expediente de investigación (`created`/`queued`/`partial` desde T3.1; `pending` es legacy) |
| `task_type` | `identity`, `geolocation`, `registry`, `bgr`, `urbanism`, `judicial`, `market`, `risk`, `documentation`, `manual_verification` | Tipo de tarea de due diligence |
| `task_status` | `pending`, `running`, `completed`, `failed`, `requires_manual_action`, `blocked`, `unavailable`, `skipped` | Estado de la tarea individual |
| `task_priority` | `critical`, `high`, `medium`, `low` | Prioridad en la cola de procesamiento |
| `currency` | `PEN`, `USD`, `unknown` | Moneda de precios (soles o dólares) |
| `document_type` | `image`, `pdf`, `screenshot`, `certificate`, `map`, `report`, `raw_response`, `other` | Tipo de archivo adjunto |
| `alert_severity` | `critical`, `warning`, `info` | Gravedad de la alerta de riesgo |
| `alert_status` | `active`, `dismissed`, `resolved` | Estado de ciclo de vida de la alerta |
| `connector_status` | `available`, `unavailable`, `maintenance`, `rate_limited`, `requires_auth`, `error` | Salud y disponibilidad de la fuente |
| `audit_action` | `property_created`, `property_updated`, `property_deleted`, `listing_created`, `listing_linked`, `research_started`, `research_completed`, `research_failed`, `task_completed`, `task_failed`, `manual_result_entered`, `score_changed`, `alert_created`, `alert_dismissed` | Registro de auditoría |
| `scraping_job_status` | `pending`, `running`, `completed`, `failed`, `cancelled` | Estado del job de extracción |

---

## 3. Diccionario de Tablas

### Grupo A: Núcleo Inmobiliario
1. **`properties`**: Inmueble unificado (entidad física raíz). Posee `public_id` tipo nanoId (ej. `PRP-10023`), tipo, estado, precios normalizados, área en m², distrito, y campos de proveniencia.
2. **`property_listings`**: Publicaciones específicas encontradas en portales o redes sociales. Vinculadas a `properties.id`. Almacena `raw_data` y `content_hash` para deduplicación.
3. **`property_sources`**: Registro de conectores y orígenes de datos con configuración, rate limits y estado de conexión.
4. **`property_locations`**: Datos descriptivos de dirección: departamento, provincia, distrito, urbanización, calle, número, referencias y coordenadas reportadas.
5. **`property_geometries`**: Representación PostGIS espacial: punto (`geometry(Point, 4326)`) y polígono (`geometry(Polygon, 4326)`).

### Grupo B: Registro & Titularidad (SUNARP)
6. **`registry_properties`**: Ficha técnica de la partida registral SUNARP (número de partida, tomo, folio, zona registral Arequipa).
7. **`registry_owners`**: Titulares registrales vigentes e históricos con tipo y número de documento (DNI/RUC) y porcentaje de dominio.
8. **`registry_charges`**: Cargas, gravámenes, hipotecas, embargos y medidas cautelares registradas.
9. **`registry_titles`**: Historial cronológico de títulos archivados y transferencias registrales.

### Grupo C: Urbanismo & Planeamiento Territorial
10. **`urban_zones`**: Información de zonificación según el PDM (Plan de Desarrollo Metropolitano) del IMPLA Arequipa (código de zona: RDM, RDA, CZ, ZRE, etc.).
11. **`urban_parameters`**: Parámetros edificatorios: altura máxima, coeficiente de edificación, porcentaje de área libre, retiros y usos compatibles.

### Grupo D: Asuntos Judiciales & Remates
12. **`judicial_cases`**: Expedientes judiciales en trámite en el Poder Judicial (CEJ) vinculados al inmueble o a los titulares.
13. **`judicial_events`**: Hitos y resoluciones emitidas dentro del expediente judicial.

### Grupo E: Mercado & Valuación
14. **`market_comparables`**: Inmuebles comparables en la misma zona o radio geográfico usados para estimación de valor.
15. **`market_prices`**: Estimaciones de valor comercial por m², precio sugerido y confianza algorítmica.

### Grupo F: Motor de Investigación (Research Engine)
16. **`research_cases`**: Expediente global de investigación de un inmueble.
17. **`research_tasks`**: Cada una de las 8 tareas automáticas de due diligence que componen la investigación.
18. **`research_results`**: Evidencia y datos normalizados resultantes de una tarea, con copia íntegra del `raw_data`.

### Grupo G: Documentos & Evidencia
19. **`documents`**: Metadatos de archivos (imágenes, PDFs de partidas, certificados de parámetros, capturas).
20. **`external_links`**: Enlaces externos rastreados (publicaciones, visores cartográficos, resoluciones).

### Grupo H: Scoring & Riesgo
21. **`property_scores`**: Índices calculados: score de oportunidad, score de riesgo legal, liquidez comercial.
22. **`property_alerts`**: Alertas operativas (inconsistencias de área, indicios de litigio, discrepancia de precios).

### Grupo I: Operaciones de Scraping
23. **`scraping_jobs`**: Definición de trabajos recurrentes o bajo demanda por fuente.
24. **`scraping_runs`**: Registro de ejecuciones individuales, tiempos y métricas de extracción.
25. **`scraping_errors`**: Registro detallado de fallos, códigos de error y trazas de scraping.

### Grupo J: Sistema & Auditoría
26. **`users`**: Usuarios del sistema (preparado para autenticación y roles).
27. **`audit_logs`**: Bitácora inmutable de eventos del sistema para trazabilidad total.

---

## 4. Tipos Geográficos PostGIS (`geo.ts`)

En `server/src/db/schema/geo.ts` se implementaron tipos de columna personalizados para Drizzle ORM utilizando el estándar EPSG:4326 (WGS 84):
- **`point(name)`**: Genera columna `geometry(Point, 4326)`. Almacena coordenadas `[longitud, latitud]`.
- **`polygon(name)`**: Genera columna `geometry(Polygon, 4326)`. Almacena polígonos cerrados de linderos.
- **`multiPolygon(name)`**: Genera columna `geometry(MultiPolygon, 4326)` para geometrías compuestas o parcelas divididas.

---

## 5. Estrategia de Migraciones

- Las migraciones SQL son generadas por **Drizzle Kit** y residen en `server/drizzle/`.
- El archivo `server/drizzle/0000_military_salo.sql` contiene la definición completa de las 27 tablas y 17 enums.
- Comando para generar: `npm.cmd run db:generate`
- Comando para aplicar: `npm.cmd run db:migrate`
- Comando para sembrar: `npm.cmd run db:seed`
