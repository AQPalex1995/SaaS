# Guía de Desarrollo Local — Land Intelligence

## 1. Requisitos del Sistema

- **Node.js**: v20.x o v22.x LTS (con soporte para ESM nativo).
- **Docker & Docker Compose**: Para levantar PostgreSQL con PostGIS y Redis.
- **Sistema Operativo**: Windows 10/11 o Linux/macOS.

---

## 2. Configuración de Entorno

1. Copiar `.env.example` a `.env` en la raíz y en `server/.env`:
   ```bash
   cp .env.example .env
   cp .env.example server/.env
   ```

2. Variables clave configuradas por defecto:
   ```ini
   DATABASE_URL=postgresql://land_intel:land_intel_dev_2024@localhost:5433/land_intelligence
   REDIS_URL=redis://localhost:6380
   API_PORT=3001
   API_HOST=127.0.0.1
   NODE_ENV=development
   SCOUT_PORT=8787
   LOG_LEVEL=info
   ```

---

## 3. Infraestructura Docker

Iniciar los contenedores de base de datos/cache (Postgres + Redis) en segundo plano:
```bash
docker compose up -d postgres redis
```

> **Autoarranque (agentes IA)**: si una tarea requiere PostgreSQL 5433 o Redis 6380
> y el puerto no escucha, el agente los inicia automáticamente sin pedir permiso:
> 1) abrir Docker Desktop (`C:\Program Files\Docker\Docker\Docker Desktop.exe`) y
> esperar el engine; 2) `docker compose up -d postgres redis`; 3) esperar que
> `land-intel-postgres` esté `healthy`; 4) `npm.cmd run db:migrate` (idempotente).
> Ver **§2.8 de AGENTS.md** para el procedimiento y guardrails exactos.

Verificar que los contenedores estén saludables:
```bash
docker compose ps
```
- Contenedor `land-intel-postgres` escucha en `localhost:5433`.
- Contenedor `land-intel-redis` escucha en `localhost:6380`.

Para detenerlos:
```bash
docker compose stop postgres redis
```
> **NUNCA** `docker compose down -v` ni borrar volúmenes (destruyen los datos 4025 properties).

---

## 4. Scripts y Comandos Principales

### En el directorio `server/`:

| Comando | Acción Realizada |
|---|---|
| `npm.cmd run dev` | Inicia el servidor API Fastify con `tsx watch` en el puerto 3001 |
| `npm.cmd run start` | Inicia el servidor API en modo producción |
| `npm.cmd run dev:worker` | Worker BullMQ en proceso separado con hot reload |
| `npm.cmd run worker` | Worker BullMQ en producción (`WORKER_QUEUES` selecciona colas) |
| `npm.cmd run sync:sqlite` | Sincroniza `data/scout.db` (SQLite legacy) → PostgreSQL (esp. `npm run sync:sqlite -- ruta.db`) |
| `npm.cmd run typecheck` | Ejecuta `tsc --noEmit` para validar tipos en todo el proyecto |
| `npm.cmd run db:generate` | Genera nuevas migraciones SQL en `drizzle/` analizando el schema TS |
| `npm.cmd run db:migrate` | Ejecuta las migraciones pendientes en PostgreSQL |
| `npm.cmd run db:seed` | Inserta datos de prueba (usuario, fuentes, propiedad de ejemplo) |
| `npm.cmd run db:setup` | TODO EN UNO: extensiones PostGIS + migraciones + seed (idempotente) |
| `npm.cmd run db:studio` | Abre Drizzle Studio en el navegador para explorar la base de datos |
| `npm.cmd test` | Ejecuta la suite de pruebas unitarias e integración con Vitest (96 tests) |
| `npm.cmd run test:watch` | Ejecuta Vitest en modo observador interactivo |

### En la raíz del proyecto (`fb-terreno-scout`):

| Comando | Acción Realizada |
|---|---|
| `npm.cmd start` | Inicia el monitor legacy FB Terreno Scout en el puerto 8787 |
| `npm.cmd run typecheck` | Valida los tipos TypeScript del Scout legacy |
| `iniciar-scout.bat` | Script batch para iniciar el monitor en Windows |

### Flujo recomendado para la Fase 2 (sincronización + geolocalización)

```bash
# 1. Infra (Docker): Postgres 5433 + Redis 6380
docker compose up -d

# 2. Setup de la base
cd server && npm.cmd run db:setup

# 3. Sincronizar el SQLite legacy (crea properties/listings en PostgreSQL)
npm.cmd run sync:sqlite

# 4. API en una terminal
npm.cmd run dev

# 5. Worker (consume las colas geocoding/research) en otra terminal
npm.cmd run dev:worker

# 6. Abrir el panel del Scout en http://localhost:8787 y pulsar [INVESTIGAR]
```

> **Nota**: si Redis está caído, el API sigue funcionando en modo degradado. Los endpoints
> de investigación crean el caso y las tareas, y los workers las procesan cuando Redis vuelve.
> El conector OpenStreetMap respeta la política de Nominatim (1 req/s máx.) usando `NOMINATIM_URL`
> y `OSM_USER_AGENT`.

---

## 5. Notas Específicas de Windows / PowerShell

- En PowerShell, si aparece el error `No se puede cargar el archivo npm.ps1 porque la ejecución de scripts está deshabilitada`:
  - **Solución**: Usa `npm.cmd <comando>` en lugar de `npm <comando>`.
  - Lo mismo aplica para `npx`: usa `npx.cmd <comando>`.
